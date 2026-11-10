import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pino } from "pino";
import { io as connect } from "socket.io-client";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";

export const SECRET = "x".repeat(32) + "-segredo-de-teste";
export const ORIGIN = "http://127.0.0.1:5173";

/** Sobe a API de verdade (HTTP + Socket.IO) com um SQLite temporário e migrations aplicadas. */
export async function startServer(limits = { authMax: 1000, messagesMax: 1000 }) {
  const dir = mkdtempSync(join(tmpdir(), "rtchat-"));
  const url = `file:${join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const { server, io } = createApp({
    prisma, secret: SECRET, origin: ORIGIN, limits,
    logger: pino({ level: "silent" }),
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];

  async function call(path, { method = "GET", body, token, headers } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
  }

  async function signUp(name) {
    const email = `${name.toLowerCase()}@teste.dev`;
    const password = "senha-segura-123";
    await call("/register", { method: "POST", body: { name, email, password } });
    const { body } = await call("/login", { method: "POST", body: { email, password } });
    return { ...body.user, token: body.token, email, password };
  }

  function socketFor(token) {
    const socket = connect(base, { auth: { token }, reconnection: false, forceNew: true });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.once("connect", () => resolve(socket));
      socket.once("connect_error", reject);
    });
  }

  /** Desconecta os sockets abertos pelo teste anterior, para a presença começar limpa. */
  async function dropSockets() {
    sockets.splice(0).forEach(socket => socket.disconnect());
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  async function close() {
    sockets.forEach(socket => socket.disconnect());
    io.close();
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  }

  return { base, prisma, call, signUp, socketFor, dropSockets, close };
}

export const next = (socket, event, ms = 1500) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), ms);
  socket.once(event, data => { clearTimeout(timer); resolve(data); });
});

/** Resolve true se o evento NÃO chegar dentro da janela (usado para provar isolamento). */
export const silent = (socket, event, ms = 300) => new Promise(resolve => {
  const handler = () => resolve(false);
  socket.once(event, handler);
  setTimeout(() => { socket.off(event, handler); resolve(true); }, ms);
});
