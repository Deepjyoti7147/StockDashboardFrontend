FROM nginx:alpine
COPY index.html /usr/share/nginx/html/
COPY index.css /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/
COPY config.js /usr/share/nginx/html/
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
