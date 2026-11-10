-- Confirmação de leitura: preenchido quando o destinatário abre a conversa.
ALTER TABLE "Message" ADD COLUMN "readAt" DATETIME;
CREATE INDEX "Message_receiverId_senderId_readAt_idx" ON "Message"("receiverId", "senderId", "readAt");
