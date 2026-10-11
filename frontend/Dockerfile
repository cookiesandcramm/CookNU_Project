
FROM nginx:1.28-alpine

COPY index.html /usr/share/nginx/html/index.html
COPY app.css /usr/share/nginx/html/app.css
COPY app.js /usr/share/nginx/html/app.js
COPY ui.js /usr/share/nginx/html/ui.js

COPY cooknulogo.png /usr/share/nginx/html/cooknulogo.png
COPY photo1.jpg /usr/share/nginx/html/photo1.jpg
COPY photo2.jpg /usr/share/nginx/html/photo2.jpg
COPY photo3.jpg /usr/share/nginx/html/photo3.jpg

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
