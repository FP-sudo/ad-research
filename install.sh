#!/usr/bin/env bash
# ad-research セットアップ
#
# ★このスキルは MCP不要・APIキー不要・ログイン不要 で動きます。
#   Meta広告ライブラリ/Google透明性センターの「公開サイト」を Playwright で読むだけ。
#   必要なのは Node.js だけ（Chromium はこのスクリプトが入れます）。
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "== ad-research setup =="
echo "skill dir: $SKILL_DIR"
echo "前提: MCP不要・ログイン不要。必要なのは Node.js のみ（Chromiumは自動導入）。"

# --- [1/3] Node.js（必須）。無ければ導入を案内/実行 ---
echo
echo "[1/3] Node.js を確認..."
if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js が見つかりません（このスキルに必須）。"
  if command -v brew >/dev/null 2>&1; then
    if [ -t 0 ]; then
      read -r -p "  Homebrew で Node を今すぐ入れますか? [y/N]: " ans
      case "${ans:-N}" in
        [yY]*) brew install node && echo "  OK: Node を導入しました" || { echo "  ERROR: 'brew install node' 失敗"; exit 1; } ;;
        *) echo "  中止。'brew install node' で導入後、再度 install.sh を実行してください。"; exit 1 ;;
      esac
    else
      echo "  → 'brew install node' を実行 → もう一度 install.sh を流してください。"; exit 1
    fi
  else
    echo "  → Node.js 18+ を https://nodejs.org/ja から導入（または nvm 利用）→ 再実行。"; exit 1
  fi
fi
echo "  OK: $(node -v)"

# --- [2/3] Playwright + Chromium（必須・自動導入） ---
echo
echo "[2/3] Playwright + Chromium を導入（約150MB DL）..."
cd "$SKILL_DIR" || { echo "  ERROR: skill dir へ移動できません"; exit 1; }
if [ ! -f package.json ]; then
  cat > package.json <<'JSON'
{ "name": "ad-research", "private": true, "version": "1.0.0",
  "dependencies": { "playwright": "^1.57.0" } }
JSON
fi
npm install --no-audit --no-fund >/dev/null 2>&1 && echo "  OK: npm install" || { echo "  ERROR: npm install 失敗"; exit 1; }
npx playwright install chromium >/dev/null 2>&1 && echo "  OK: chromium" || { echo "  ERROR: chromium 導入失敗。'npx playwright install chromium' を手動実行してください。"; exit 1; }

# --- [3/3] firecrawl MCP（完全に任意。無くても全機能が動く） ---
echo
echo "[3/3] firecrawl MCP（任意・スキップ可）..."
echo "  ※ このスキルは MCP無しで動きます。firecrawl は Mode Y の web探索を使う時だけの補助です。"
if command -v claude >/dev/null 2>&1 && claude mcp list 2>/dev/null | grep -qi firecrawl; then
  echo "  OK: firecrawl MCP は登録済み（任意機能も使えます）"
else
  echo "  未検出（問題なし）。必要になったら: claude mcp add firecrawl-mcp -- npx -y firecrawl-mcp"
fi

echo
echo "== 完了（MCP設定は不要でした）=="
echo "Meta(キーワード検索):  node \"$SKILL_DIR/scripts/meta_fetch.js\" \"副業\""
echo "YouTube(広告主軸):     node \"$SKILL_DIR/scripts/atc_fetch.js\" \"株式会社ユーキャン\""
