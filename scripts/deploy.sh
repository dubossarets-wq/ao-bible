#!/usr/bin/env bash
# Выкладывает dist/pwa на GitHub Pages (ветка gh-pages) — после этого приложение открывается
# и устанавливается на iPhone и Android по адресу https://<user>.github.io/<repo>/
# Запуск: npm run build && bash scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
TMP=$(mktemp -d)
cp -r dist/pwa/. "$TMP"
touch "$TMP/.nojekyll"   # без Jekyll: файлы отдаются как есть
cd "$TMP"
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git push -q -f "$REMOTE" gh-pages
cd - >/dev/null
rm -rf "$TMP"
echo "Готово: ветка gh-pages обновлена"
