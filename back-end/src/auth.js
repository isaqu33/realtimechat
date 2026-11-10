import jwt from "jsonwebtoken";

export function createAuth(secret) {
  function sign(userId) {
    return jwt.sign({ userId }, secret, { algorithm: "HS256", expiresIn: "50m" });
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

  return { sign, identity, authenticate };
}
