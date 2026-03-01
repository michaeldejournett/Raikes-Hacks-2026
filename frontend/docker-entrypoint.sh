#!/bin/sh
set -e

PORT="${PORT:-80}"

# In Railway: auto-use the backend service URL.
# In Docker Compose: fall back to http://backend:3001.
if [ -n "$RAILWAY_SERVICE_BACKEND_URL" ]; then
    BACKEND_URL="https://${RAILWAY_SERVICE_BACKEND_URL}"
else
    BACKEND_URL="${BACKEND_URL:-http://backend:3001}"
fi

cat > /etc/nginx/conf.d/default.conf <<NGINX
server {
    listen ${PORT};
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    resolver 1.1.1.1 8.8.8.8 valid=30s;

    location /api/ {
        proxy_pass ${BACKEND_URL};
        proxy_ssl_server_name on;
        proxy_ssl_verify off;
        proxy_http_version 1.1;
        proxy_set_header Host \$proxy_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Cookie \$http_cookie;
        proxy_read_timeout 60s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

exec nginx -g "daemon off;"
