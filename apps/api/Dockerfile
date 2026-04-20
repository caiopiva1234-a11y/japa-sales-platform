FROM node:20-bookworm-slim AS base
WORKDIR /app

COPY package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm install

COPY . .
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build --workspace @japa/api

EXPOSE 3333
CMD ["npm", "run", "start", "--workspace", "@japa/api"]
