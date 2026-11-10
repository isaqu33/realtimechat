FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY server.js ./
COPY src ./src

# SQLite fica em /data (volume); o usuário "node" precisa poder escrever lá.
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
# Aplica as migrations e sobe a API. "exec" repassa o SIGTERM do docker stop ao Node.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node server.js"]
