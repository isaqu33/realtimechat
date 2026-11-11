import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
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
    // Não lidas por remetente, numa consulta só (evita N+1).
    const counts = await prisma.message.groupBy({
      by: ["senderId"],
      where: { receiverId: req.identity.userId, readAt: null },
      _count: { _all: true },
    });
    const unread = new Map(counts.map(row => [row.senderId, row._count._all]));
    res.json(users.map(user => ({ ...user, online: isOnline(user.id), unread: unread.get(user.id) ?? 0 })));
  }));

  // Paginação por cursor: `before` = id da mensagem mais antiga que o cliente já tem.
  // Cursor por id (e não por página/offset) não repete nem pula itens quando chegam mensagens novas.
  router.get("/messages/:peer", auth.authenticate, asyncRoute(async (req, res) => {
    const peer = Number(req.params.peer);
    const self = req.identity.userId;
    const limit = req.query.limit === undefined ? PAGE_SIZE : Number(req.query.limit);
    const before = req.query.before === undefined ? undefined : Number(req.query.before);
    if (!Number.isSafeInteger(peer) || peer < 1 || peer === self) return res.status(400).json({ error: "Contato inválido." });
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE ||
        (before !== undefined && (!Number.isSafeInteger(before) || before < 1))) {
      return res.status(400).json({ error: "Parâmetros de paginação inválidos." });
    }
    // Busca limit + 1 para saber se há mais páginas sem uma segunda consulta (count).
    const rows = await prisma.message.findMany({
      where: {
        OR: [{ senderId: self, receiverId: peer }, { senderId: peer, receiverId: self }],
        ...(before ? { id: { lt: before } } : {}),
      },
      orderBy: { id: "desc" },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    res.json({ messages: rows.slice(0, limit).reverse().map(vault.decode), hasMore });
  }));

  return router;
}
