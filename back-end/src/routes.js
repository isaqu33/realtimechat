import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// bcrypt só considera os 72 primeiros bytes; recusar acima disso evita senhas "truncadas" em silêncio.
const MAX_PASSWORD_BYTES = 72;

export function createRoutes({ prisma, auth, vault, isOnline, limits }) {
  const router = Router();
  const authLimiter = rateLimit({
    windowMs: limits.windowMs,
    limit: limits.authMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas tentativas. Aguarde um pouco e tente de novo." },
  });

  router.get("/health", (req, res) => res.json({ status: "ok" }));

  router.post("/register", authLimiter, asyncRoute(async (req, res) => {
    const { name, email, password } = req.body ?? {};
    if (typeof name !== "string" || !name.trim() || name.length > 60 ||
        typeof email !== "string" || email.length > 120 || !EMAIL.test(email) ||
        typeof password !== "string" || password.length < 8 || Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
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

  router.post("/login", authLimiter, asyncRoute(async (req, res) => {
    const { email, password } = req.body ?? {};
    const user = typeof email === "string" && typeof password === "string" && Buffer.byteLength(password) <= MAX_PASSWORD_BYTES
      ? await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
      : null;
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: "E-mail ou senha inválidos." });
    }
    res.json({ token: auth.sign(user.id), user: { id: user.id, name: user.name } });
  }));

  router.get("/users", auth.authenticate, asyncRoute(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { id: { not: req.identity.userId } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 100,
    });
    res.json(users.map(user => ({ ...user, online: isOnline(user.id) })));
  }));

  router.get("/messages/:peer", auth.authenticate, asyncRoute(async (req, res) => {
    const peer = Number(req.params.peer);
    const self = req.identity.userId;
    if (!Number.isSafeInteger(peer) || peer < 1 || peer === self) return res.status(400).json({ error: "Contato inválido." });
    const messages = await prisma.message.findMany({
      where: { OR: [{ senderId: self, receiverId: peer }, { senderId: peer, receiverId: self }] },
      orderBy: { id: "desc" },
      take: 100,
    });
    res.json(messages.reverse().map(vault.decode));
  }));

  return router;
}
