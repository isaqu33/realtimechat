import { PrismaClient } from "@prisma/client";
import { pino } from "pino";
import { loadConfig } from "./src/config.js";
import { createApp } from "./src/app.js";

const config = loadConfig();
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const prisma = new PrismaClient();
const { server, io } = createApp({ prisma, secret: config.secret, origin: config.origin, logger });

server.listen(config.port, config.host, () => logger.info(`API em http://${config.host}:${config.port}`));

// Encerramento gracioso: fecha conexões e o banco antes de sair (docker stop envia SIGTERM).
async function shutdown(signal) {
  logger.info({ signal }, "encerrando");
  io.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
