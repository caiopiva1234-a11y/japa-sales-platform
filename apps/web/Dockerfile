FROM node:20-alpine AS base
WORKDIR /app

ARG NEXT_PUBLIC_API_URL=http://localhost:3333
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

ARG NEXT_PUBLIC_ENABLE_WHATSAPP=false
ENV NEXT_PUBLIC_ENABLE_WHATSAPP=$NEXT_PUBLIC_ENABLE_WHATSAPP

COPY package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm install

COPY . .
RUN npm run build --workspace @japa/web

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@japa/web"]
