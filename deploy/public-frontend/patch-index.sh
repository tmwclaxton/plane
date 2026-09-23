#!/bin/sh
set -eu
INDEX=/usr/share/nginx/html/index.html
ASSETS=/usr/share/nginx/html/assets

# Remove any previous LGS script tags.
sed -i 's#<script src="/lgs-brand.js[^"]*" defer></script>##g' "$INDEX"
sed -i 's#<script src="/lgs-share.js[^"]*" defer></script>##g' "$INDEX"
sed -i 's#<script src="/lgs-crm.js[^"]*" defer></script>##g' "$INDEX"

sed -i \
  -e 's#/assets/favicon-32x32-cfWXc3P9.png#/lgs-brand/favicon.ico#g' \
  -e 's#/assets/favicon-16x16-B_Opgp1K.png#/lgs-brand/favicon.svg#g' \
  -e 's#/assets/favicon-DJlV-mcI.ico#/lgs-brand/favicon.ico#g' \
  -e 's#/assets/icon-512x512-CyS1mcXS.png#/lgs-brand/apple-touch-icon.png#g' \
  -e 's#/assets/icon-180x180-ArenqHjH.png#/lgs-brand/apple-touch-icon.png#g' \
  -e 's#<title>Plane | Simple, extensible, open-source project management tool.</title>#<title>Let'\''s Go Social</title>#' \
  -e 's#content="Plane"#content="Let'\''s Go Social"#g' \
  -e 's#content="Plane | Simple, extensible, open-source project management tool."#content="Let'\''s Go Social"#g' \
  "$INDEX"

# Point home doodle at the local campfire asset and bust the JS URL.
HOME_CHUNK=""
if [ -f "$ASSETS/page-lgs-home-v3.js" ]; then
  HOME_CHUNK="$ASSETS/page-lgs-home-v3.js"
elif [ -f "$ASSETS/page-lgs-home-v2.js" ]; then
  HOME_CHUNK="$ASSETS/page-lgs-home-v2.js"
elif [ -f "$ASSETS/page-Cl8OjvoZ.js" ]; then
  HOME_CHUNK="$ASSETS/page-Cl8OjvoZ.js"
fi
if [ -n "$HOME_CHUNK" ]; then
  sed -i \
    -e 's#https://www.letsgosocial.co.uk/images/doodles/coffee.webp#/lgs-brand/lgs-logo.png?v=7#g' \
    -e 's#https://www.letsgosocial.co.uk/images/doodles/auth-campfire.webp#/lgs-brand/lgs-logo.png?v=7#g' \
    -e 's#/lgs-brand/auth-campfire\.webp\?v=6#/lgs-brand/lgs-logo.png?v=7#g' \
    -e 's#/lgs-brand/auth-campfire\.webp#/lgs-brand/lgs-logo.png?v=7#g' \
    "$HOME_CHUNK"
  cp "$HOME_CHUNK" "$ASSETS/page-lgs-home-v4.js"
  find "$ASSETS" -type f \( -name '*.js' -o -name '*.json' \) -print0 | xargs -0 sed -i \
    -e 's#page-Cl8OjvoZ\.js#page-lgs-home-v4.js#g' \
    -e 's#page-lgs-home-v2\.js#page-lgs-home-v4.js#g' \
    -e 's#page-lgs-home-v3\.js#page-lgs-home-v4.js#g'
  sed -i \
    -e 's#page-Cl8OjvoZ\.js#page-lgs-home-v4.js#g' \
    -e 's#page-lgs-home-v2\.js#page-lgs-home-v4.js#g' \
    -e 's#page-lgs-home-v3\.js#page-lgs-home-v4.js#g' \
    "$INDEX" || true
fi

sed -i 's#</body>#<script src="/lgs-brand.js?v=10" defer></script><script src="/lgs-share.js?v=2" defer></script><script src="/lgs-crm.js?v=1" defer></script></body>#' "$INDEX"

# Replace service worker with kill-switch.
if [ -f /usr/share/nginx/html/sw.js.lgs ]; then
  cp /usr/share/nginx/html/sw.js.lgs /usr/share/nginx/html/sw.js
fi
