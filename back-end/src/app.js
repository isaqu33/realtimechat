import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { Server } from "socket.io";
import { createAuth } from "./auth.js";
import { createVault } from "./vault.js";
import { createRoutes } from "./routes.js";
import { attachSockets } from "./sockets.js";

const DEFAULT_LIMITS = { windowMs: 60_000, authMax: 20, messagesMax: 30 };

export function createApp({ prisma, secret, origin, logger, limits = {} }) {
  const rules = { ...DEFAULT_LIMITS, ...limits };
  const auth = createAuth(secret);
  const vault = createVault(secret);
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: { origin },
    allowRequest: (request, done) => done(null, !request.headers.origin || request.headers.origin === origin),
    maxHttpBufferSize: 16_384,
  });
  const { isOnline } = attachSockets(io, { prisma, auth, vault, logger, limits: rules });

  app.disable("x-powered-by");
  app.use(pinoHttp({
    logger,
    autoLogging: { ignore: req => req.url === "/health" },
    redact: ["req.headers.authorization", "req.headers.cookie"],
  }));
  app.use(helmet());
  app.use(cors({ origin }));
  app.use(express.json({ limit: "16kb" }));
  app.use(createRoutes({ prisma, auth, vault, isOnline, limits: rules }));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status >= 400 && error.status < 500 ? error.status : 500;
    if (status === 500) req.log.error({ err: error }, "erro interno");
    res.status(status).json({ error: status === 500 ? "Erro interno." : "Requisição inválida." });
  });

  return { app, server, io };
}
