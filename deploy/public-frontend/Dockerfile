FROM lgs/plane-frontend:v1.4.2-public

COPY lgs-share.js /usr/share/nginx/html/lgs-share.js
COPY lgs-brand.js /usr/share/nginx/html/lgs-brand.js
COPY lgs-crm.js /usr/share/nginx/html/lgs-crm.js
COPY assets/ /usr/share/nginx/html/lgs-brand/
COPY sw.js /usr/share/nginx/html/sw.js.lgs
COPY nginx.conf /etc/nginx/nginx.conf
COPY patch-index.sh /tmp/patch-index.sh

RUN sh /tmp/patch-index.sh \
  && rm /tmp/patch-index.sh \
  && test -f /usr/share/nginx/html/lgs-brand/lgs-logo.png \
  && test -f /usr/share/nginx/html/lgs-crm.js \
  && grep -q 'lgs-crm.js' /usr/share/nginx/html/index.html
