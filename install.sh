#!/usr/bin/env bash
# ad-research セットアップ — Playwright + Chromium を同梱導入。
# Mode M(Meta) / Mode Y(YouTube) 両方で使用。Mode Y の firecrawl探索は任意(MCP)。
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "== ad-research setup =="
echo "skill dir: $SKILL_DIR"

echo
echo "[1/3] Node.js を確認..."
if ! command -v node >/dev/null 2>&1; then
  echo "  ERROR: node が見つかりません。Node.js 18+ を入れてください。"; exit 1
fi
echo "  OK: $(node -v)"

echo
echo "[2/3] Playwright + Chromium を導入..."
cd "$SKILL_DIR" || { echo "  ERROR: skill dir へ移動できません"; exit 1; }
if [ ! -f package.json ]; then
  cat > package.json <<'JSON'
{ "name": "ad-research", "private": true, "version": "1.0.0",
  "dependencies": { "playwright": "^1.57.0" } }
JSON
fi
npm install --no-audit --no-fund >/dev/null 2>&1 && echo "  OK: npm install" || { echo "  ERROR: npm install 失敗"; exit 1; }
npx playwright install chromium >/dev/null 2>&1 && echo "  OK: chromium" || { echo "  ERROR: chromium 導入失敗。'npx playwright install chromium' を手動実行してください。"; exit 1; }

echo
echo "[3/3] firecrawl MCP（任意・Mode Yのキーワード探索で使用）..."
if command -v claude >/dev/null 2>&1 && claude mcp list 2>/dev/null | grep -qi firecrawl; then
  echo "  OK: firecrawl MCP は登録済み"
else
  echo "  (任意) 未検出。Mode M/Y-bridge は不要。Mode Yでweb探索したい場合のみ:"
  echo "      claude mcp add firecrawl-mcp -- npx -y firecrawl-mcp  /  export FIRECRAWL_API_KEY=fc-xxxxx"
fi

echo
echo "== 完了 =="
echo "Meta(キーワード):  node \"$SKILL_DIR/scripts/meta_fetch.js\" \"引き寄せ\""
echo "YouTube(広告主):   node \"$SKILL_DIR/scripts/atc_fetch.js\" \"株式会社ユーキャン\""
