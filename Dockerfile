FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data && chown node:node /data
USER node
ENV STORAGE_DIR=/data
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.js && node src/server.js"]
