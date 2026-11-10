import "dotenv/config";

export function loadConfig(env = process.env) {
  const secret = env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Configure JWT_SECRET no .env com pelo menos 32 caracteres.");
  }
  return {
    secret,
    port: Number(env.PORT || 3000),
    host: env.HOST || "127.0.0.1",
    origin: env.FRONTEND_ORIGIN || "http://127.0.0.1:5173",
  };
}
