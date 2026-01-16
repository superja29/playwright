FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

# Copy server dependencies and prisma
COPY server/package*.json ./server/
COPY server/prisma ./server/prisma

RUN cd server && npm ci --include=dev
RUN cd server && npx prisma generate

# Copy server source and tsconfig
COPY server/tsconfig.json ./server/
COPY server/src ./server/src

 # Build client and copy to server/public
 COPY client/package*.json ./client/
 RUN cd client && npm ci
 COPY client ./client
 RUN cd client && npm run build
 RUN mkdir -p server/public && cp -r client/dist/* server/public/

RUN cd server && npm run build

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
