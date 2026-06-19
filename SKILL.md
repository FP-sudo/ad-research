---
name: ad-research
description: Competitor ad research for the Japanese market — search ads by keyword (Meta/Facebook/Instagram Ad Library, full-text) and by advertiser (Google/YouTube via the Ads Transparency Center). Output creative list tables (advertiser, copy, LP, dates, video). Use when asked "広告を調べて", "キーワードで広告を探したい", "Meta広告ライブラリ", "YouTube広告を一覧で", "競合の広告を集めて", or to build a swipe file for channeling / spirituality / law-of-attraction / marketing / health / any 情報商材 genre.
metadata:
  origin: sudotakao
version: 1.0.0
---

# 広告リサーチ (ad-research)

競合の広告を **キーワード**または**広告主**から一覧表にする。Meta と Google/YouTube の両方を1スキルで扱う。

| やりたいこと | Mode | 媒体 | キーワード検索 |
|---|---|---|---|
| **キーワードで広告を本文ごと探す** | **Mode M (Meta)** | FB/IG | ✅ できる（本命） |
| 特定競合のYouTube動画広告を見る | **Mode Y (YouTube)** | YouTube/Google | △ 広告主軸 |
| キーワード→YouTube広告 | **Mode Y-bridge** | YouTube | Meta経由で擬似的に |

> **使い分けの一言**: 「キーワードで探す」=Meta（在庫もキーワード検索もここ）。「この競合のYouTube動画を見る」=YouTube。情報商材/スピ系は**ほぼMeta専業**なのでMode Mが主役。

## 大前提（実測で確定）
- **Google/YouTube(ATC)はキーワード全文検索不可**（広告主名/サイト名でしか引けない）。
- **Meta広告ライブラリは広告本文の全文検索が公式・無料・ログイン不要**（日本・動画/画像）。
- **ATCは広告主の"全"広告を返す**（資格大手等は数百テーマ混在）→ YouTube側はタイトルで関連度判定が必須。
- ATCの広告主名は**法人/アカウント名**。表記揺れに弱い（「ライザップ」✗/「RIZAP」○）。
- 情報商材/スピ系は**Meta専業でYouTube在庫ゼロ**のことが多い（実測: チャネリングJPで Meta約220件 vs YouTubeほぼ0）。

## Setup
```bash
bash ~/.claude/skills/ad-research/install.sh
```
Playwright + Chromium（必須）。Mode Y の firecrawl探索を使う場合のみ firecrawl MCP（任意）。

---

## Mode M: キーワードで広告検索（Meta・本命）

```bash
node ~/.claude/skills/ad-research/scripts/meta_fetch.js "<キーワード>"
# env: COUNTRY(既定JP) / MEDIA(all|video|image) / MAX_ITEMS(既定40)
```
返却 items[]: `advertiser` / `copy`(本文) / `startDate` / `isVideo` / `landingUrl`(LP直リンク) / `detailUrl` / `libraryId`。
→ `references/meta-report-template.md` で一覧表化。**同一広告主の出稿本数＝勝ちパターンの示唆**として集計すると有用。

## Mode Y: 広告主のYouTube動画広告（Google ATC）

```bash
node ~/.claude/skills/ad-research/scripts/atc_fetch.js "株式会社◯◯" "△△"
# env: REGION(JP) / FORMAT(VIDEO) / MAX_ITEMS(120) / ENRICH(1)
```
1. 広告主名で照会（表記揺れは複数表記を投げる）。`advertiserLabel` 不一致は破棄（誤一致＝"チャネリングなのに振袖"防止）。
2. 返却 items[]: `creativeUrl` / `thumb` / `youtubeUrl` / **`title`**(oEmbed) / `channel`。
3. **`title` でキーワード関連度を判定**し関連のみ採用（ATCは全テーマ返すため）。関連0なら正直に「該当なし」。
→ `references/youtube-report-template.md` で一覧表化。

## Mode Y-bridge: キーワード→YouTube（Metaブリッジ）
ATCはキーワード検索できないので、Mode Mで広告主を集めてMode Yに渡す。
```
キーワード →(meta_fetch)→ 出稿中の広告主＋LPドメイン →(atc_fetch・複数表記/法人名で照会)→ 動画 →(title判定)→ 表
```
- LPの特商法ページを `firecrawl_scrape` して**運営会社の正式名**を取ると照会が当たりやすい。
- **天井（正直に）**: 広告主がYouTube動画も出している場合のみ成立。健康/フィットネス/大型DR（例 RIZAP=動画40件）は○、スピ系は在庫ゼロで×。

---

## 出力後
- `npx agent-skill-bus record-run --agent claude --skill ad-research --task "<内容>" --result <success|partial|fail> --score <0-1>`

## 制約まとめ
- 取得は上位サンプル（`MAX_ITEMS`）。総件数はMetaの`resultLine`参照。
- Metaのレイアウト変更で `meta_fetch.js` の `harvestInPage` が壊れる可能性（`fetched:0`で要メンテ）。
- 対象は Meta(FB/IG) と Google/YouTube のみ。
