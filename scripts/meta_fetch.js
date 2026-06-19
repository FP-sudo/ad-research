#!/usr/bin/env node
/**
 * meta_fetch.js — Meta広告ライブラリ(FB/IG)を「キーワードで全文検索」して広告を抽出する。
 *
 * Googleの透明性センターと違い、Meta広告ライブラリは広告本文のキーワード全文検索が
 * 公式・無料・ログイン不要でできる(日本対応・動画/画像含む)。情報商材/スピリチュアル系は
 * Meta中心に出稿しているため、この genre のキーワード調査はこちらが本命。
 *
 * 使い方:
 *   node meta_fetch.js "チャネリング"
 *   COUNTRY=JP MEDIA=video MAX_ITEMS=40 node meta_fetch.js "引き寄せ"
 *
 * 出力(stdout, JSON): { keyword, country, resultLine, fetched, items[] }
 *   items[]: libraryId, advertiser, startDate, isVideo, copy, landingUrl, detailUrl
 *
 * 注意: APIではなくライブラリ"サイト"をPlaywrightで駆動(API版は app の身元確認が必要)。
 *       取得は上位サンプル(MAX_ITEMS)。DOMはクラス名が難読なので「ライブラリID」テキストを
 *       アンカーにカードを特定する(レイアウト変更に弱い→件数0等が出たら要メンテ)。
 */
'use strict';
const path = require('path');
const os = require('os');

function loadPlaywright() {
  const candidates = [
    process.env.PW_PATH,
    path.join(__dirname, '..', 'node_modules', 'playwright'),
    path.join(os.homedir(), '.claude/skills/meta-ad-research/node_modules/playwright'),
    path.join(os.homedir(), '.claude/skills/youtube-ad-research/node_modules/playwright'),
    path.join(os.homedir(), '.claude/skills/playwright-skill/skills/playwright-skill/node_modules/playwright'),
    'playwright',
  ].filter(Boolean);
  for (const c of candidates) { try { return require(c); } catch (_) { /* next */ } }
  throw new Error('playwright が見つかりません。`bash install.sh` を実行してください。');
}

const KEYWORD = process.argv[2];
const COUNTRY = process.env.COUNTRY || 'JP';
const MEDIA = (process.env.MEDIA || 'all').toLowerCase(); // all | video | image
const MAX_ITEMS = parseInt(process.env.MAX_ITEMS || '40', 10);

function decodeLfb(href) {
  try {
    const u = new URL(href);
    if (u.hostname.includes('facebook.com') && u.searchParams.get('u')) return u.searchParams.get('u');
  } catch (_) { /* ignore */ }
  return href;
}

// ページ内で各広告カードを抽出する(ブラウザ文脈で実行)。
function harvestInPage() {
  function cardRoot(node) {
    let el = node;
    for (let i = 0; i < 8; i++) {
      if (el.parentElement) {
        el = el.parentElement;
        const t = el.innerText || '';
        if (/ライブラリID/.test(t) && /掲載開始/.test(t) && t.length > 120) return el;
      }
    }
    return null;
  }
  const leafs = [...document.querySelectorAll('*')].filter(
    (el) => el.children.length === 0 && /ライブラリID[:：]\s*\d+/.test(el.textContent));
  const out = [];
  for (const lf of leafs) {
    const root = cardRoot(lf);
    if (!root) continue;
    const txt = (root.innerText || '').replace(/​/g, '').split('\n').map((s) => s.trim()).filter(Boolean);
    const joined = txt.join('\n');
    const id = (joined.match(/ライブラリID[:：]\s*(\d+)/) || [])[1];
    if (!id) continue;
    const start = (joined.match(/掲載開始日[:：]\s*([\d/]+)/) || [])[1] || null;
    const isVideo = /\d:\d\d\s*\/\s*\d:\d\d/.test(joined);
    const spIdx = txt.findIndex((l) => /スポンサー広告/.test(l));
    const advertiser = spIdx > 0 ? txt[spIdx - 1] : null;
    const copy = spIdx >= 0 ? txt.slice(spIdx + 1).filter((l) => !/^\d:\d\d/.test(l)).join(' ').slice(0, 400) : null;
    const lfLink = [...root.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
      .find((h) => /l\.facebook\.com\/l\.php/.test(h)) || null;
    out.push({ libraryId: id, advertiser, startDate: start, isVideo, copy, landingRaw: lfLink });
  }
  return out;
}

async function main() {
  if (!KEYWORD) { console.error('使い方: node meta_fetch.js "<キーワード>"'); process.exit(1); }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1400, height: 1700 } });
  const page = await ctx.newPage();
  try {
    const media = MEDIA === 'video' ? '&media_type=video' : MEDIA === 'image' ? '&media_type=image' : '&media_type=all';
    const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${COUNTRY}`
      + `&q=${encodeURIComponent(KEYWORD)}${media}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);
    for (const t of ['すべてのクッキーを許可', '許可する', 'Allow all cookies', 'Only allow essential cookies']) {
      const btn = page.getByRole('button', { name: new RegExp(t) }).first();
      if (await btn.count() > 0) { try { await btn.click({ timeout: 3000 }); } catch (_) { /* ignore */ } break; }
    }
    await page.waitForTimeout(3500);
    const resultLine = await page.evaluate(
      () => (document.body.innerText.match(/検索結果[:：]\s*[約~]?\s*[\d,]+\s*件/) || [])[0] || null);

    const byId = new Map();
    const absorb = (rows) => rows.forEach((r) => { if (r.libraryId && !byId.has(r.libraryId)) byId.set(r.libraryId, r); });
    absorb(await page.evaluate(harvestInPage));
    let prevH = -1;
    for (let i = 0; i < 80; i++) {
      if (byId.size >= MAX_ITEMS) break;
      const reached = await page.evaluate(() => {
        window.scrollBy(0, Math.round(window.innerHeight * 0.85));
        return (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 5;
      });
      await page.waitForTimeout(700);
      absorb(await page.evaluate(harvestInPage));
      const h = await page.evaluate(() => document.body.scrollHeight);
      if (reached && h === prevH) break;
      prevH = h;
    }

    const items = [...byId.values()].slice(0, MAX_ITEMS).map((r) => ({
      libraryId: r.libraryId,
      advertiser: r.advertiser,
      startDate: r.startDate,
      isVideo: r.isVideo,
      copy: r.copy,
      landingUrl: r.landingRaw ? decodeLfb(r.landingRaw) : null,
      detailUrl: `https://www.facebook.com/ads/library/?id=${r.libraryId}`,
    }));
    console.log(JSON.stringify({ keyword: KEYWORD, country: COUNTRY, media: MEDIA, resultLine, fetched: items.length, items }));
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
