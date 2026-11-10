import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { startServer, SECRET } from "./helpers.js";

let api;
before(async () => { api = await startServer(); });
after(() => api.close());

const valid = { name: "Ana", email: "ana@teste.dev", password: "senha-segura-123" };

test("cadastro e login devolvem token sem expor a senha", async () => {
  const created = await api.call("/register", { method: "POST", body: valid });
  assert.equal(created.status, 201);
  const login = await api.call("/login", { method: "POST", body: valid });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.name, "Ana");
  assert.ok(login.body.token);
  assert.equal(JSON.stringify(login.body).includes("password"), false);
});

test("a senha é guardada com hash", async () => {
  const user = await api.prisma.user.findUnique({ where: { email: valid.email } });
  assert.match(user.password, /^\$2[aby]\$/);
});

test("e-mail duplicado (mesmo em maiúsculas) retorna 409", async () => {
  const { status } = await api.call("/register", { method: "POST", body: { ...valid, email: "ANA@teste.dev" } });
  assert.equal(status, 409);
});

test("cadastro valida nome, e-mail e senha", async () => {
  for (const body of [
    { ...valid, name: "  " },
    { ...valid, email: "sem-arroba" },
    { ...valid, password: "curta" },
    { ...valid, password: "x".repeat(73) },
    { ...valid, name: { $ne: null } },
    undefined,
  ]) {
    const { status } = await api.call("/register", { method: "POST", body });
    assert.equal(status, 400, JSON.stringify(body));
  }
});

test("login com senha errada ou usuário inexistente dá a mesma resposta", async () => {
  const wrong = await api.call("/login", { method: "POST", body: { ...valid, password: "outra-senha-123" } });
  const missing = await api.call("/login", { method: "POST", body: { email: "x@y.dev", password: "qualquer-coisa" } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, missing.body);
});

test("rotas protegidas exigem token válido", async () => {
  assert.equal((await api.call("/users")).status, 401);
  assert.equal((await api.call("/users", { token: "lixo" })).status, 401);
  const expired = jwt.sign({ userId: 1 }, SECRET, { algorithm: "HS256", expiresIn: -10 });
  assert.equal((await api.call("/users", { token: expired })).status, 401);
  const wrongKey = jwt.sign({ userId: 1 }, "y".repeat(40), { algorithm: "HS256" });
  assert.equal((await api.call("/users", { token: wrongKey })).status, 401);
  const none = jwt.sign({ userId: 1 }, "", { algorithm: "none" });
  assert.equal((await api.call("/messages/2", { token: none })).status, 401);
});

test("/users lista os outros usuários, sem o próprio e sem dados sensíveis", async () => {
  const ana = await api.signUp("Ana2");
  await api.signUp("Beto");
  const { body } = await api.call("/users", { token: ana.token });
  assert.ok(body.length >= 1);
  assert.equal(body.some(user => user.id === ana.id), false);
  assert.deepEqual(Object.keys(body[0]).sort(), ["id", "name", "online"]);
});

test("/messages valida o contato", async () => {
  const ana = await api.signUp("Ana3");
  for (const peer of ["abc", "0", "-1", String(ana.id)]) {
    assert.equal((await api.call(`/messages/${peer}`, { token: ana.token })).status, 400, peer);
  }
});

test("envia headers de segurança e esconde o framework", async () => {
  const { headers } = await api.call("/health");
  assert.equal(headers.get("x-powered-by"), null);
  assert.equal(headers.get("x-content-type-options"), "nosniff");
});

test("corpo acima do limite é recusado", async () => {
  const { status } = await api.call("/register", { method: "POST", body: { ...valid, name: "x".repeat(20_000) } });
  assert.equal(status, 413);
});
