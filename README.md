# ad-research

日本市場の**競合広告リサーチ**を1スキルで。**キーワード検索（Meta広告ライブラリ・全文）**と**広告主軸（Google/YouTubeの透明性センター）**の両方に対応。

| Mode | 媒体 | 何ができる |
|---|---|---|
| **M (Meta)** | FB/IG | **キーワードで広告を本文ごと全文検索**（本命） |
| **Y (YouTube)** | YouTube/Google | 広告主のYouTube動画広告を抽出（タイトルで関連度判定） |
| **Y-bridge** | YouTube | キーワード→Metaで広告主発見→YouTube広告（在庫があるジャンルのみ） |

> 旧 `youtube-ad-research` と `meta-ad-research` を統合したもの（両旧リポはアーカイブ）。

## インストール（GitHub経由）
```bash
git clone https://github.com/FP-sudo/ad-research.git ~/.claude/skills/ad-research
bash ~/.claude/skills/ad-research/install.sh
```
更新: `cd ~/.claude/skills/ad-research && git pull`。前提: Node.js 18+（Chromiumはinstall.shが導入）。

## 使い方

```
/ad-research 引き寄せ            # キーワード→Meta広告(全文)
「ユーキャンのYouTube広告見せて」  # 広告主→YouTube動画広告
```

直接:
```bash
node scripts/meta_fetch.js "チャネリング"     # Mode M: env COUNTRY/MEDIA/MAX_ITEMS
node scripts/atc_fetch.js "株式会社ユーキャン" # Mode Y: env REGION/FORMAT/MAX_ITEMS/ENRICH
```

## 要点（実測で確定した現実）
- **キーワードで探す＝Metaが本命**。Google/YouTubeはキーワード全文検索が構造的に不可（広告主名のみ）。
- **情報商材/スピ系はMeta専業**でYouTube在庫がほぼ無い（チャネリングJP: Meta約220件 vs YouTubeほぼ0）。
- ATCは広告主の全広告を返すので、YouTube側はタイトルで関連度判定。広告主名は表記揺れに弱い（「RIZAP」○/「ライザップ」✗）。

## 構成
```
ad-research/
├── SKILL.md
├── install.sh
├── scripts/{meta_fetch.js, atc_fetch.js}
└── references/{meta-report-template.md, youtube-report-template.md}
```

## ライセンス
社内利用向け。
