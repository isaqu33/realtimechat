export type User = { id: number; name: string; online?: boolean; unread?: number };
export type Message = { id: number; senderId: number; receiverId: number; content: string; timestamp: string; readAt?: string | null; clientId?: string };
/** Mensagem que o usuário enviou e o servidor ainda não confirmou (envio otimista). */
export type Outgoing = { clientId: string; receiverId: number; content: string; status: "sending" | "failed" };
export type Session = { token: string; user: User };
