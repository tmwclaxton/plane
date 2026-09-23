#!/bin/sh
set -eu

docker cp /home/gunnergrant/plane-selfhost/plane-app/public-frontend/lgs-brand.js \
  plane-app-web-1:/usr/share/nginx/html/lgs-brand.js

docker exec plane-app-web-1 sh <<'EOS'
set -eu
ASSETS=/usr/share/nginx/html/assets
INDEX=/usr/share/nginx/html/index.html
HOME=""
if [ -f "$ASSETS/page-lgs-home-v2.js" ]; then
  HOME="$ASSETS/page-lgs-home-v2.js"
elif [ -f "$ASSETS/page-Cl8OjvoZ.js" ]; then
  HOME="$ASSETS/page-Cl8OjvoZ.js"
fi
if [ -n "$HOME" ]; then
  sed -i \
    -e 's#https://www.letsgosocial.co.uk/images/doodles/coffee.webp#/lgs-brand/auth-campfire.webp?v=6#g' \
    -e 's#https://www.letsgosocial.co.uk/images/doodles/auth-campfire.webp#/lgs-brand/auth-campfire.webp?v=6#g' \
    -e 's#src:`/lgs-brand/auth-campfire.webp`#src:`/lgs-brand/auth-campfire.webp?v=6`#g' \
    -e 's#"/lgs-brand/auth-campfire.webp"#"/lgs-brand/auth-campfire.webp?v=6"#g' \
    "$HOME"
  cp "$HOME" "$ASSETS/page-lgs-home-v3.js"
  find "$ASSETS" -type f \( -name '*.js' -o -name '*.json' \) -exec sed -i \
    -e 's#page-Cl8OjvoZ\.js#page-lgs-home-v3.js#g' \
    -e 's#page-lgs-home-v2\.js#page-lgs-home-v3.js#g' {} +
  sed -i \
    -e 's#page-Cl8OjvoZ\.js#page-lgs-home-v3.js#g' \
    -e 's#page-lgs-home-v2\.js#page-lgs-home-v3.js#g' \
    "$INDEX" || true
fi
sed -i 's#lgs-brand.js?v=[0-9]*#lgs-brand.js?v=6#g' "$INDEX"
if ! grep -q 'lgs-brand.js?v=6' "$INDEX"; then
  sed -i 's#</body>#<script src="/lgs-brand.js?v=6" defer></script></body>#' "$INDEX"
fi
EOS

echo "=== origin index refs ==="
curl -sS -H "Host: plane.canvassr.org" http://127.0.0.1:8100/ | grep -oE 'lgs-brand.js\?v=[0-9]+|page-lgs-home[^"'"'"']*'
echo "=== home chunk img src ==="
curl -sS -H "Host: plane.canvassr.org" http://127.0.0.1:8100/assets/page-lgs-home-v3.js | grep -oE '/lgs-brand/auth-campfire[^`"'"'"']*' | sort -u
echo "=== brand script campfire ==="
curl -sS -H "Host: plane.canvassr.org" http://127.0.0.1:8100/lgs-brand.js | grep -F 'auth-campfire.webp?v=6' | head -3
