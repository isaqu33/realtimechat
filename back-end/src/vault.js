import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const TAG_BYTES = 16;

/**
 * Cifra o conteúdo das mensagens em repouso (AES-256-GCM).
 * A chave é derivada do JWT_SECRET; o IV é aleatório por mensagem.
 * A tag de autenticação vai junto do texto cifrado: qualquer alteração no banco faz a leitura falhar.
 */
export function createVault(secret) {
  const key = createHash("sha256").update("realtimechat-storage:").update(secret).digest();

  function encode(content) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(content, "utf8"), cipher.final()]);
    return {
      content: Buffer.concat([cipher.getAuthTag(), encrypted]).toString("base64"),
      iv: iv.toString("base64"),
    };
  }

  function decode(message) {
    const encrypted = Buffer.from(message.content, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(message.iv, "base64"));
    decipher.setAuthTag(encrypted.subarray(0, TAG_BYTES));
    const content = Buffer.concat([decipher.update(encrypted.subarray(TAG_BYTES)), decipher.final()]).toString("utf8");
    return {
      id: message.id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      content,
      timestamp: message.timestamp,
    };
  }

  return { encode, decode };
}
