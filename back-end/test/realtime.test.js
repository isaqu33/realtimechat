import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { io as connect } from "socket.io-client";
import { startServer, next, silent, ORIGIN } from "./helpers.js";

let api, ana, beto, carla;
const send = (socket, payload) => socket.timeout(2000).emitWithAck("message", payload);

before(async () => {
  api = await startServer();
  [ana, beto, carla] = await Promise.all([api.signUp("Ana"), api.signUp("Beto"), api.signUp("Carla")]);
});
after(() => api.close());
afterEach(() => api.dropSockets());

test("socket sem token ou com token inválido é recusado", async () => {
  for (const token of [undefined, "lixo"]) {
    const socket = connect(api.base, { auth: { token }, reconnection: false, forceNew: true });
    const error = await next(socket, "connect_error");
    assert.match(error.message, /Sessão inválida/);
    socket.disconnect();
  }
});

test("origem diferente da configurada é recusada", async () => {
  const socket = connect(api.base, {
    auth: { token: ana.token }, reconnection: false, forceNew: true,
    extraHeaders: { Origin: "http://evil.example" }, transports: ["polling"],
  });
  await next(socket, "connect_error");
  socket.disconnect();
});

test("mensagem chega ao destinatário e ao remetente, e o remetente vem do token", async () => {
  const [a, b] = await Promise.all([api.socketFor(ana.token), api.socketFor(beto.token)]);
  const toBeto = next(b, "message");
  const toAna = next(a, "message");
  // senderId forjado no payload deve ser ignorado
  const ack = await send(a, { receiverId: beto.id, content: "  oi, Beto  ", senderId: carla.id });
  assert.deepEqual(ack, { ok: true });
  const received = await toBeto;
  assert.equal(received.content, "oi, Beto");
  assert.equal(received.senderId, ana.id);
  assert.equal((await toAna).id, received.id);
});

test("terceiros não recebem a mensagem", async () => {
  const [a, c] = await Promise.all([api.socketFor(ana.token), api.socketFor(carla.token)]);
  const quiet = silent(c, "message");
  await send(a, { receiverId: beto.id, content: "só entre nós" });
  assert.equal(await quiet, true);
});

test("o banco guarda só texto cifrado e o histórico decifra", async () => {
  const a = await api.socketFor(ana.token);
  await send(a, { receiverId: beto.id, content: "texto-secreto-xyz" });
  const rows = await api.prisma.message.findMany();
  assert.ok(rows.length > 0);
  assert.equal(rows.some(row => row.content.includes("texto-secreto-xyz")), false);
  const { body } = await api.call(`/messages/${ana.id}`, { token: beto.token });
  assert.ok(body.some(message => message.content === "texto-secreto-xyz"));
});

test("o histórico só mostra a conversa entre os dois", async () => {
  const c = await api.socketFor(carla.token);
  await send(c, { receiverId: ana.id, content: "carla para ana" });
  const { body } = await api.call(`/messages/${beto.id}`, { token: ana.token });
  assert.equal(body.some(message => message.content === "carla para ana"), false);
});

test("rejeita destinatário inválido, vazio, longo, para si mesmo e sem ack", async () => {
  const a = await api.socketFor(ana.token);
  for (const payload of [
    { receiverId: ana.id, content: "eu" },
    { receiverId: "2", content: "oi" },
    { receiverId: beto.id, content: "   " },
    { receiverId: beto.id, content: "x".repeat(2001) },
    { receiverId: 999999, content: "ninguém" },
    null,
  ]) {
    const ack = await send(a, payload);
    assert.ok(ack.error, JSON.stringify(payload));
  }
});

test("indicador de digitação vai só ao destinatário", async () => {
  const [a, b, c] = await Promise.all([ana, beto, carla].map(user => api.socketFor(user.token)));
  const typing = next(b, "typing");
  const quiet = silent(c, "typing");
  a.emit("typing", { receiverId: beto.id });
  assert.deepEqual(await typing, { senderId: ana.id });
  assert.equal(await quiet, true);
});

test("presença: avisa quando entra e quando sai; /users reflete o estado", async () => {
  const watcher = await api.socketFor(ana.token);
  const joined = next(watcher, "presence");
  const b = await api.socketFor(beto.token);
  assert.deepEqual(await joined, { userId: beto.id, online: true });
  let { body } = await api.call("/users", { token: ana.token });
  assert.equal(body.find(user => user.id === beto.id).online, true);

  const left = next(watcher, "presence");
  b.disconnect();
  assert.deepEqual(await left, { userId: beto.id, online: false });
});

test("clientId volta no evento e reenvio com o mesmo clientId não duplica", async () => {
  const [a, b] = await Promise.all([api.socketFor(ana.token), api.socketFor(beto.token)]);
  const first = next(b, "message");
  const payload = { receiverId: beto.id, content: "só uma vez", clientId: "abc-12345678" };
  assert.deepEqual(await send(a, payload), { ok: true });
  assert.equal((await first).clientId, "abc-12345678");
  assert.deepEqual(await send(a, payload), { ok: true, duplicate: true });
  const { body } = await api.call(`/messages/${ana.id}`, { token: beto.token });
  assert.equal(body.filter(message => message.content === "só uma vez").length, 1);
  assert.ok((await send(a, { receiverId: beto.id, content: "x", clientId: "curto" })).error);
});

test("limite de mensagens por janela de tempo", async () => {
  const limited = await startServer({ authMax: 1000, messagesMax: 3, windowMs: 60_000 });
  try {
    const [x, y] = await Promise.all([limited.signUp("Xis"), limited.signUp("Ypsilon")]);
    const socket = await limited.socketFor(x.token);
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await send(socket, { receiverId: y.id, content: `m${i}` }));
    assert.equal(results.filter(result => result.ok).length, 3);
    assert.match(results[4].error, /rápido demais/);
  } finally {
    await limited.close();
  }
});

test("confirmação de leitura: recibo ao remetente, histórico e contador de não lidas", async () => {
  const x = await api.signUp("Leitor"), y = await api.signUp("Autor");
  const [sx, sy] = await Promise.all([api.socketFor(x.token), api.socketFor(y.token)]);
  await send(sy, { receiverId: x.id, content: "leia isto" });
  await send(sy, { receiverId: x.id, content: "e isto" });

  let { body } = await api.call("/users", { token: x.token });
  assert.equal(body.find(user => user.id === y.id).unread, 2);
  let history = (await api.call(`/messages/${x.id}`, { token: y.token })).body;
  assert.equal(history.every(message => message.readAt === null), true);

  const receipt = next(sy, "read");
  sx.emit("read", { peerId: y.id });
  const event = await receipt;
  assert.equal(event.readerId, x.id);
  assert.equal(event.upTo, history.at(-1).id);

  history = (await api.call(`/messages/${x.id}`, { token: y.token })).body;
  assert.equal(history.every(message => message.readAt), true);
  ({ body } = await api.call("/users", { token: x.token }));
  assert.equal(body.find(user => user.id === y.id).unread, 0);
});

test("read inválido ou sem mensagens não gera evento nem erro", async () => {
  const x = await api.signUp("Quieto"), y = await api.signUp("Outro");
  const [sx, sy] = await Promise.all([api.socketFor(x.token), api.socketFor(y.token)]);
  const quiet = silent(sy, "read");
  for (const peerId of ["1", -1, 0, x.id, 99999, null]) sx.emit("read", { peerId });
  sx.emit("read");
  assert.equal(await quiet, true);
});

test("ninguém marca como lidas as mensagens de outra conversa", async () => {
  const x = await api.signUp("Alvo"), y = await api.signUp("Remetente"), z = await api.signUp("Intruso");
  const [sy, sz] = await Promise.all([api.socketFor(y.token), api.socketFor(z.token)]);
  await send(sy, { receiverId: x.id, content: "só para o alvo" });
  sz.emit("read", { peerId: y.id }); // z não é o destinatário
  await new Promise(resolve => setTimeout(resolve, 200));
  const history = (await api.call(`/messages/${x.id}`, { token: y.token })).body;
  assert.equal(history[0].readAt, null);
});
