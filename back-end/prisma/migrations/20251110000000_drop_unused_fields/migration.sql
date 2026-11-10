-- Remove campos que o protótipo nunca usou (foto, presença persistida e exclusão lógica).
-- A presença online agora vem das salas do Socket.IO.
ALTER TABLE "User" DROP COLUMN "photourl";
ALTER TABLE "User" DROP COLUMN "isOnline";
ALTER TABLE "Message" DROP COLUMN "deletedBySender";
ALTER TABLE "Message" DROP COLUMN "deletedByReceiver";
