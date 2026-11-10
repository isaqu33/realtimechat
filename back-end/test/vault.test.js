import test from "node:test";
import assert from "node:assert/strict";
import { createVault } from "../src/vault.js";

const vault = createVault("a".repeat(40));
const row = { id: 1, senderId: 1, receiverId: 2, timestamp: new Date() };

test("cifra e decifra o conteúdo", () => {
  const stored = { ...row, ...vault.encode("olá, mundo 👋") };
  assert.notEqual(stored.content, "olá, mundo 👋");
  assert.equal(vault.decode(stored).content, "olá, mundo 👋");
});

test("o mesmo texto gera cifras diferentes (IV aleatório)", () => {
  const a = vault.encode("igual");
  const b = vault.encode("igual");
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.content, b.content);
});

test("conteúdo adulterado no banco é rejeitado", () => {
  const stored = { ...row, ...vault.encode("segredo") };
  const bytes = Buffer.from(stored.content, "base64");
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => vault.decode({ ...stored, content: bytes.toString("base64") }));
});

test("outra chave não decifra", () => {
  const stored = { ...row, ...vault.encode("segredo") };
  assert.throws(() => createVault("b".repeat(40)).decode(stored));
});
