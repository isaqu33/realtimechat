import "dotenv/config";
import { createServer } from "node:http";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) throw new Error("Configure JWT_SECRET no .env com pelo menos 32 caracteres.");
const port = Number(process.env.PORT || 3000);
const origin = process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5173";
const key = createHash("sha256").update("realtimechat-storage:").update(secret).digest();
const prisma = new PrismaClient();
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin },
  allowRequest: (request, done) => done(null, !request.headers.origin || request.headers.origin === origin),
  maxHttpBufferSize: 16_384,
});

function encode(content) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(content, "utf8"), cipher.final()]);
  return { content: Buffer.concat([cipher.getAuthTag(), encrypted]).toString("base64"), iv: iv.toString("base64") };
}

function decode(message) {
  const encrypted = Buffer.from(message.content, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(message.iv, "base64"));
  decipher.setAuthTag(encrypted.subarray(0, 16));
  const content = Buffer.concat([decipher.update(encrypted.subarray(16)), decipher.final()]).toString("utf8");
  return { id: message.id, senderId: message.senderId, receiverId: message.receiverId, content, timestamp: message.timestamp };
}

function identity(token) {
  const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
  if (!Number.isSafeInteger(payload.userId) || payload.userId < 1) throw new Error("Sessão inválida.");
  return payload;
}

function authenticate(req, res, next) {
  try {
    req.identity = identity(req.get("authorization")?.match(/^Bearer (.+)$/i)?.[1]);
    next();
  } catch {
    res.status(401).json({ error: "Sessão inválida ou expirada." });
  }
}

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const room = userId => `user:${userId}`;
const online = userId => Boolean(io.sockets.adapter.rooms.get(room(userId))?.size);

app.use(cors({ origin }));
app.use(express.json({ limit: "16kb" }));
app.post("/register", asyncRoute(async (req, res) => {
  const { name, email, password } = req.body ?? {};
  if (typeof name !== "string" || !name.trim() || name.length > 60 ||
      typeof email !== "string" || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== "string" || password.length < 8 || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ error: "Informe nome, e-mail e senha de pelo menos 8 caracteres." });
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    await prisma.user.create({ data: { name: name.trim(), email: email.toLowerCase(), password: hash } });
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "E-mail já cadastrado." });
    throw error;
  }
  res.status(201).json({ ok: true });
}));

app.post("/login", asyncRoute(async (req, res) => {
  const { email, password } = req.body ?? {};
  const user = typeof email === "string" && typeof password === "string" && Buffer.byteLength(password) <= 72
    ? await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    : null;
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ error: "E-mail ou senha inválidos." });
  }
  const token = jwt.sign({ userId: user.id }, secret, { algorithm: "HS256", expiresIn: "50m" });
  res.json({ token, user: { id: user.id, name: user.name } });
}));

app.get("/users", authenticate, asyncRoute(async (req, res) => {
  const users = await prisma.user.findMany({
    where: { id: { not: req.identity.userId } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 100,
  });
  res.json(users.map(user => ({ ...user, online: online(user.id) })));
}));

app.get("/messages/:peer", authenticate, asyncRoute(async (req, res) => {
  const peer = Number(req.params.peer);
  const self = req.identity.userId;
  if (!Number.isSafeInteger(peer) || peer < 1 || peer === self) return res.status(400).json({ error: "Contato inválido." });
  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: self, receiverId: peer }, { senderId: peer, receiverId: self }] },
    orderBy: { id: "desc" },
    take: 100,
  });
  res.json(messages.reverse().map(decode));
}));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  res.status(status).json({ error: status === 500 ? "Erro interno." : "Requisição inválida." });
});

io.use((socket, next) => {
  try {
    socket.data.identity = identity(socket.handshake.auth.token);
    next();
  } catch {
    next(new Error("Sessão inválida ou expirada."));
  }
});

io.on("connection", async socket => {
  const { userId, exp } = socket.data.identity;
  await socket.join(room(userId));
  socket.broadcast.emit("presence", { userId, online: true });
  const expiry = setTimeout(() => socket.disconnect(true), Math.max(0, exp * 1000 - Date.now()));

  socket.on("typing", payload => {
    const { receiverId } = payload ?? {};
    if (Number.isSafeInteger(receiverId) && receiverId > 0 && receiverId !== userId) {
      io.to(room(receiverId)).emit("typing", { senderId: userId });
    }
  });

  socket.on("message", async (payload, ack) => {
    if (typeof ack !== "function") return;
    const { receiverId, content } = payload ?? {};
    if (!Number.isSafeInteger(receiverId) || receiverId < 1 || receiverId === userId ||
        typeof content !== "string" || !content.trim() || content.length > 2000) {
      return ack({ error: "Destinatário ou mensagem inválidos." });
    }
    try {
      const saved = await prisma.message.create({ data: {
        senderId: userId,
        receiverId,
        ...encode(content.trim()),
      } });
      io.to(room(userId)).to(room(receiverId)).emit("message", decode(saved));
      ack({ ok: true });
    } catch {
      ack({ error: "Não foi possível enviar a mensagem." });
    }
  });

  socket.on("disconnect", () => {
    clearTimeout(expiry);
    if (!online(userId)) io.emit("presence", { userId, online: false });
  });
});

server.listen(port, "127.0.0.1", () => console.log(`API local em http://127.0.0.1:${port}`));
