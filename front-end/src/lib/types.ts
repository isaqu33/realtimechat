export type User = { id: number; name: string; online?: boolean };
export type Message = { id: number; senderId: number; receiverId: number; content: string; timestamp: string };
export type Session = { token: string; user: User };
