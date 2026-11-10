import test from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.js";

test("login e cadastro têm limite de tentativas por IP", async () => {
  const api = await startServer({ authMax: 3, messagesMax: 10, windowMs: 60_000 });
  try {
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      const { status } = await api.call("/login", { method: "POST", body: { email: "a@b.dev", password: "senha-qualquer" } });
      statuses.push(status);
    }
    assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
  } finally {
    await api.close();
  }
});
