FROM node:20-alpine
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Copy backend
COPY server.js ./

# Copy frontend into /public
COPY index.html index.css app.js config.js ./public/

EXPOSE 3000
CMD ["node", "server.js"]
