FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/build ./build
USER node
EXPOSE 3000
# PUBLIC_API_URL é lida em tempo de execução (veja o docker-compose.yml).
CMD ["node", "build"]
