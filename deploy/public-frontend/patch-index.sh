#!/bin/sh
set -eu
INDEX=/usr/share/nginx/html/index.html
ASSETS=/usr/share/nginx/html/assets

sed -i 's#<script src="/lgs-brand.js[^"]*" defer></script>##g' "$INDEX"
sed -i 's#<script src="/lgs-share.js[^"]*" defer></script>##g' "$INDEX"
sed -i 's#<script src="/lgs-crm.js[^"]*" defer></script>##g' "$INDEX"

sed -i \
  -e 's#/assets/favicon[^"]*#/lgs-brand/favicon.ico#g' \
  -e 's#/assets/icon-512x512[^"]*#/lgs-brand/apple-touch-icon.png#g' \
  -e 's#/assets/icon-180x180[^"]*#/lgs-brand/apple-touch-icon.png#g' \
  -e 's#<title>Plane | Simple, extensible, open-source project management tool.</title>#<title>Let'\''s Go Social</title>#' \
  -e 's#content="Plane"#content="Let'\''s Go Social"#g' \
  -e 's#content="Plane | Simple, extensible, open-source project management tool."#content="Let'\''s Go Social"#g' \
  "$INDEX"

find "$ASSETS" -type f -name '*.js' -print0 | xargs -0 sed -i \
  -e 's#my_stickies:{component:[A-Za-z_$][A-Za-z0-9_$]*,#my_stickies:{component:null,#'

sed -i 's#</body>#<script src="/lgs-brand.js?v=12" defer></script><script src="/lgs-share.js?v=2" defer></script></body>#' "$INDEX"

if [ -f /usr/share/nginx/html/sw.js.lgs ]; then
  cp /usr/share/nginx/html/sw.js.lgs /usr/share/nginx/html/sw.js
fi
