const room = userId => `user:${userId}`;

/**
 * Tempo real: o remetente e a sala privada vêm sempre do token validado no handshake,
 * nunca do payload do cliente.
 */
export function attachSockets(io, { prisma, auth, vault, logger, limits }) {
  const isOnline = userId => Boolean(io.sockets.adapter.rooms.get(room(userId))?.size);

  io.use((socket, next) => {
    try {
      socket.data.identity = auth.identity(socket.handshake.auth.token);
      next();
    } catch {
      next(new Error("Sessão inválida ou expirada."));
    }
  });

  io.on("connection", async socket => {
    const { userId, exp } = socket.data.identity;
    await socket.join(room(userId));
    socket.broadcast.emit("presence", { userId, online: true });
    // A conexão não pode sobreviver ao token que a autorizou.
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(0, exp * 1000 - Date.now()));
    let sentAt = [];

    socket.on("typing", payload => {
      const { receiverId } = payload ?? {};
      if (Number.isSafeInteger(receiverId) && receiverId > 0 && receiverId !== userId) {
        io.to(room(receiverId)).emit("typing", { senderId: userId });
      }
    });

    socket.on("message", async (payload, ack) => {
      if (typeof ack !== "function") return;
      const now = Date.now();
      sentAt = sentAt.filter(time => now - time < limits.windowMs);
      if (sentAt.length >= limits.messagesMax) return ack({ error: "Você está enviando mensagens rápido demais." });
      sentAt.push(now);

      const { receiverId, content } = payload ?? {};
      if (!Number.isSafeInteger(receiverId) || receiverId < 1 || receiverId === userId ||
          typeof content !== "string" || !content.trim() || content.length > 2000) {
        return ack({ error: "Destinatário ou mensagem inválidos." });
      }
      try {
        const saved = await prisma.message.create({
          data: { senderId: userId, receiverId, ...vault.encode(content.trim()) },
        });
        io.to(room(userId)).to(room(receiverId)).emit("message", vault.decode(saved));
        ack({ ok: true });
      } catch (error) {
        // Destinatário inexistente cai aqui (chave estrangeira); o cliente recebe a mesma resposta genérica.
        logger.warn({ err: error.code ?? error.message, userId }, "falha ao salvar mensagem");
        ack({ error: "Não foi possível enviar a mensagem." });
      }
    });

    socket.on("disconnect", () => {
      clearTimeout(expiry);
      if (!isOnline(userId)) io.emit("presence", { userId, online: false });
    });
  });

  return { isOnline };
}
