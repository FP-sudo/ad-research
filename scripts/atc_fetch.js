#!/usr/bin/env node
/**
 * atc_fetch.js — Google 広告の透明性センター(ATC)から、指定した広告主の
 *                「動画(=YouTube)広告クリエイティブ」を抽出する。
 *
 * 使い方:
 *   node atc_fetch.js "株式会社ユーキャン" "本田健" ...
 *   REGION=JP FORMAT=VIDEO node atc_fetch.js "<広告主名>"
 *
 * 出力: 広告主ごとに1行のJSON(stdout)。呼び出し側(SKILL.md)が集約して一覧表化する。
 *
 * 実証済みの事実(2026-06-18):
 *  - ATCの広告主名は「法人/アカウント名」。個人ブランド名や商品名では引けないことが多い。
 *  - フォーマットフィルタは「動画」を選択した瞬間に自動適用される(「適用」ボタンは無い)。
 *  - URLに ?format=VIDEO を直接付けてもコールドロードでは絞り込まれない → 必ずUI操作で絞る。
 *  - 動画広告のサムネは i.ytimg.com/vi/<YouTubeID>/... なのでYouTube動画URLを復元できる。
 *  - クリエイティブのフォーマットはDOMから判別不能(iframe描画) → ATCのフィルタが唯一の手段。
 */
'use strict';
const path = require('path');
const os = require('os');

function loadPlaywright() {
  const candidates = [
    process.env.PW_PATH,
    path.join(__dirname, '..', 'node_modules', 'playwright'),
    path.join(os.homedir(), '.claude/skills/playwright-skill/skills/playwright-skill/node_modules/playwright'),
    path.join(os.homedir(), 'everything-claude-code/skills/playwright-skill/skills/playwright-skill/node_modules/playwright'),
    'playwright',
  ].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch (_) { /* try next */ }
  }
  throw new Error('playwright が見つかりません。`bash install.sh` を実行してください。');
}

const REGION = process.env.REGION || 'JP';
const FORMAT_LABEL = { VIDEO: '動画', IMAGE: '画像', TEXT: 'テキスト' };
const FORMAT = (process.env.FORMAT || 'VIDEO').toUpperCase();
const MAX_ITEMS = parseInt(process.env.MAX_ITEMS || '120', 10);
const EMPTY_RE = /広告が見つかりません|該当する広告|広告はありません/;

function youtubeFromThumb(thumb) {
  if (!thumb) return null;
  const m = thumb.match(/ytimg\.com\/vi\/([A-Za-z0-9_-]{6,})\//);
  return m ? 'https://www.youtube.com/watch?v=' + m[1] : null;
}

// oEmbed(APIキー不要)でYouTube動画のタイトル/チャンネル名を取得。
// ATCはキーワード絞り込みが無く広告主の全広告を返すため、タイトルが
// キーワード関連度の判定材料になる(例: チャネリング案件に簿記/振袖が混入するのを弾く)。
async function fetchTitle(youtubeUrl) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(youtubeUrl), { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null; // 非公開/削除済みは取得不可 → title=null のまま
    const j = await res.json();
    return { title: j.title || null, channel: j.author_name || null };
  } catch (_) { return null; }
}

async function enrichTitles(items) {
  const targets = items.filter((it) => it.youtubeUrl);
  const CONC = 6;
  for (let i = 0; i < targets.length; i += CONC) {
    const batch = targets.slice(i, i + CONC);
    const results = await Promise.all(batch.map((it) => fetchTitle(it.youtubeUrl)));
    batch.forEach((it, k) => { it.title = results[k]?.title || null; it.channel = results[k]?.channel || null; });
  }
}

/** 広告主名 → ATCの広告主ID(AR...) を解決 */
async function resolveAdvertiser(page, name) {
  await page.goto(`https://adstransparency.google.com/?region=${REGION}`, { waitUntil: 'networkidle', timeout: 45000 });
  const input = page.locator('input').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.click();
  await input.fill(name);
  await page.waitForTimeout(3000);
  const sugg = page.locator('.advertiser-suggestion').first();
  if (await sugg.count() === 0) return { id: null, note: 'ATC未掲載(候補なし)' };
  const label = (await sugg.innerText()).replace(/\s+/g, ' ').trim().slice(0, 80);
  const grouped = /複数あります/.test(label);
  await sugg.click({ timeout: 8000 });
  await page.waitForTimeout(4000);
  const m = page.url().match(/advertiser\/(AR\d+)/);
  return { id: m ? m[1] : null, label, grouped };
}

/** 広告主ページでフォーマットフィルタを適用し、クリエイティブを抽出 */
async function fetchCreatives(page, id) {
  await page.goto(`https://adstransparency.google.com/advertiser/${id}?region=${REGION}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForSelector('creative-preview', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);

  // フォーマットフィルタを開いて目的フォーマットを選択(選択した瞬間に自動適用)
  await page.getByRole('button', { name: /広告フォーマットのフィルタ/ }).click({ timeout: 10000 });
  await page.waitForTimeout(1000);
  const optLabel = FORMAT_LABEL[FORMAT] || '動画';
  await page.getByText(new RegExp('^' + optLabel + '$')).first().click({ timeout: 8000 });
  // フィルタが実際に適用された(URLに format=... が付く)ことを必須確認。
  // 付かないまま進むと全フォーマットを動画と誤認するため、ここで失敗(throw)させる。
  await page.waitForFunction((f) => location.href.includes('format=' + f), FORMAT, { timeout: 10000 });
  await page.waitForTimeout(2500);

  const empty = await page.evaluate((emptySrc) => new RegExp(emptySrc).test(document.body.innerText), EMPTY_RE.source);
  if (empty) return { count: 0, items: [] };

  // ATCはカードを仮想化(画面外はサムネをアンロード)するため、末尾で一括抽出すると取りこぼす。
  // スクロールしながら可視カードを逐次収集し、creativeUrlをキーにthumbを蓄積する。
  const harvest = () => page.evaluate(() =>
    [...document.querySelectorAll('creative-preview')].map((el) => {
      const raw = el.querySelector('a')?.getAttribute('href') || null;
      return {
        href: raw ? 'https://adstransparency.google.com' + raw.replace(/&amp;/g, '&') : null,
        thumb: el.querySelector('img')?.src || null,
      };
    }));

  const byUrl = new Map();
  const absorb = (rows) => rows.forEach((r) => {
    if (!r.href) return;
    const cur = byUrl.get(r.href);
    if (!cur) byUrl.set(r.href, { creativeUrl: r.href, thumb: r.thumb });
    else if (!cur.thumb && r.thumb) cur.thumb = r.thumb;
  });

  absorb(await harvest());
  let prevH = -1, capped = false;
  for (let i = 0; i < 120; i++) {
    if (byUrl.size >= MAX_ITEMS) { capped = true; break; }
    const reached = await page.evaluate(() => {
      window.scrollBy(0, Math.round(window.innerHeight * 0.7));
      return (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 5;
    });
    await page.waitForTimeout(550);
    absorb(await harvest());
    // 高さは「待機・収集の後」に測る。スクロール前の値で判定すると遅延ロード前に早期breakし得る。
    const h = await page.evaluate(() => document.body.scrollHeight);
    if (reached && h === prevH) break;
    prevH = h;
  }

  return { count: byUrl.size, capped, items: [...byUrl.values()] };
}

async function main() {
  const names = process.argv.slice(2);
  if (names.length === 0) {
    console.error('使い方: node atc_fetch.js "<広告主名1>" "<広告主名2>" ...');
    process.exit(1);
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 1700 } });
  const page = await ctx.newPage();
  try {
    for (const name of names) {
      try {
        const r = await resolveAdvertiser(page, name);
        if (!r.id) { console.log(JSON.stringify({ name, ...r })); continue; }
        const v = await fetchCreatives(page, r.id);
        const items = v.items.map((it) => ({ ...it, youtubeUrl: youtubeFromThumb(it.thumb) }));
        if (process.env.ENRICH !== '0') await enrichTitles(items);
        console.log(JSON.stringify({
          name, advertiserId: r.id, advertiserLabel: r.label, grouped: r.grouped,
          format: FORMAT, region: REGION, count: v.count, capped: !!v.capped, items,
        }));
      } catch (e) {
        console.log(JSON.stringify({ name, error: e.message }));
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
