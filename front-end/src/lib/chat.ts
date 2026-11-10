import { get, writable } from "svelte/store";
import { env } from "$env/dynamic/public";
import { io, type Socket } from "socket.io-client";
import type { Message, Session, User } from "./types";

const api = env.PUBLIC_API_URL || "http://127.0.0.1:3000";
const TYPING_VISIBLE_MS = 1800;
const TYPING_THROTTLE_MS = 750;

export const session = writable<Session | null>(null);
export const contacts = writable<User[]>([]);
export const peer = writable<User | undefined>();
export const messages = writable<Message[]>([]);
export const error = writable("");
export const status = writable("");
export const connected = writable(false);
export const typing = writable(false);
export const sending = writable(false);

let socket: Socket | undefined;
let typingTimer: ReturnType<typeof setTimeout>;
let lastTyping = 0;
// Cada troca de conversa/sessão invalida respostas que ainda estavam a caminho.
let conversationVersion = 0;

async function request(path: string, body?: object) {
  const current = get(session);
  const response = await fetch(api + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(current ? { Authorization: `Bearer ${current.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Falha na requisição.");
  return data;
}

/** Une histórico e mensagens em tempo real sem duplicar (o id é a chave) e em ordem. */
export function merge(history: Message[], incoming: Message[]) {
  return [...new Map([...history, ...incoming].map(message => [message.id, message])).values()]
    .sort((a, b) => a.id - b.id);
}

export async function choose(user: User) {
  if (get(peer)?.id !== user.id) messages.set([]);
  peer.set(user);
  typing.set(false);
  const version = ++conversationVersion;
  try {
    const history: Message[] = await request(`/messages/${user.id}`);
    if (version === conversationVersion) messages.update(live => merge(history, live));
  } catch {
    if (version === conversationVersion) error.set("Não foi possível carregar o histórico.");
  }
}

export async function refreshContacts() {
  const current = get(session);
  try {
    const people = await request("/users");
    if (current === get(session)) contacts.set(people);
  } catch {
    if (current === get(session)) error.set("Não foi possível carregar os contatos.");
  }
}

export async function signIn(creds: { name: string; email: string; password: string }, signingUp: boolean) {
  error.set("");
  if (signingUp) await request("/register", creds);
  const account: Session = await request("/login", { email: creds.email, password: creds.password });
  session.set(account);

  const connection = io(api, { auth: { token: account.token } });
  socket = connection;
  connection.on("connect", () => {
    connected.set(true);
    status.set("Conectado");
    void refreshContacts();
    const open = get(peer);
    if (open) void choose(open);
  });
  connection.on("disconnect", () => {
    connected.set(false);
    status.set("Conexão encerrada. Entre novamente se a sessão expirou.");
  });
  connection.on("connect_error", () => {
    connected.set(false);
    status.set("Sem conexão com a API ou sessão expirada.");
  });
  connection.on("presence", ({ userId, online }: { userId: number; online: boolean }) => {
    contacts.update(list => list.map(user => user.id === userId ? { ...user, online } : user));
    peer.update(open => open?.id === userId ? { ...open, online } : open);
  });
  connection.on("message", (message: Message) => {
    const open = get(peer);
    if (open && [message.senderId, message.receiverId].includes(open.id)) {
      messages.update(list => merge(list, [message]));
    }
  });
  connection.on("typing", ({ senderId }: { senderId: number }) => {
    if (get(peer)?.id !== senderId) return;
    typing.set(true);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => typing.set(false), TYPING_VISIBLE_MS);
  });
}

export function signOut() {
  socket?.disconnect();
  socket = undefined;
  session.set(null);
  peer.set(undefined);
  contacts.set([]);
  messages.set([]);
  status.set("");
  error.set("");
  connected.set(false);
  typing.set(false);
  ++conversationVersion;
  clearTimeout(typingTimer);
}

export function notifyTyping() {
  const open = get(peer);
  if (!open || !get(connected) || Date.now() - lastTyping < TYPING_THROTTLE_MS) return;
  lastTyping = Date.now();
  socket?.volatile.emit("typing", { receiverId: open.id });
}

/** Devolve true quando o servidor confirmou o envio (o chamador então limpa o campo). */
export async function send(content: string) {
  const open = get(peer);
  const current = get(session);
  if (!socket || !open || !get(connected) || !content.trim() || get(sending)) return false;
  sending.set(true);
  error.set("");
  try {
    const result = await socket.timeout(5000).emitWithAck("message", { receiverId: open.id, content });
    if (current !== get(session)) return false;
    if (result.error) { error.set(result.error); return false; }
    return true;
  } catch {
    if (current === get(session)) error.set("Envio sem confirmação. Confira o histórico antes de tentar novamente.");
    return false;
  } finally {
    sending.set(false);
  }
}
