import { get, writable } from "svelte/store";
import { env } from "$env/dynamic/public";
import { io, type Socket } from "socket.io-client";
import type { Message, Outgoing, Session, User } from "./types";

const api = env.PUBLIC_API_URL || "http://127.0.0.1:3000";
const TYPING_VISIBLE_MS = 1800;
const TYPING_THROTTLE_MS = 750;

export const session = writable<Session | null>(null);
export const contacts = writable<User[]>([]);
export const peer = writable<User | undefined>();
export const messages = writable<Message[]>([]);
/** Há mensagens mais antigas no servidor? (paginação por cursor) */
export const hasMore = writable(false);
export const loadingOlder = writable(false);
export const error = writable("");
export const status = writable("");
export const connected = writable(false);
export const typing = writable(false);
export const outbox = writable<Outgoing[]>([]);
/** Mensagens não lidas por contato (id do contato → quantidade). */
export const unread = writable<Record<number, number>>({});

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

/** Avisa o servidor que a conversa aberta foi lida (só com a aba visível e algo pendente). */
function markRead() {
  const open = get(peer);
  if (!socket || !open || !get(connected) || document.visibilityState !== "visible") return;
  if (!get(unread)[open.id]) return;
  unread.update(counts => ({ ...counts, [open.id]: 0 }));
  socket.emit("read", { peerId: open.id });
}

if (typeof document !== "undefined") document.addEventListener("visibilitychange", markRead);

export async function choose(user: User) {
  if (get(peer)?.id !== user.id) { messages.set([]); hasMore.set(false); }
  peer.set(user);
  unread.update(counts => ({ ...counts, [user.id]: 0 }));
  typing.set(false);
  const version = ++conversationVersion;
  try {
    const page: { messages: Message[]; hasMore: boolean } = await request(`/messages/${user.id}`);
    const history = page.messages;
    if (version === conversationVersion) {
      // Em reconexão já podemos ter páginas antigas carregadas: só a primeira carga define hasMore.
      if (!get(messages).length) hasMore.set(page.hasMore);
      messages.update(live => merge(history, live));
      // O servidor é a fonte da verdade das não lidas; ao abrir, marcamos tudo como lido.
      if (history.some(m => m.senderId === user.id && !m.readAt)) {
        unread.update(counts => ({ ...counts, [user.id]: 1 }));
        markRead();
      }
    }
  } catch {
    if (version === conversationVersion) error.set("Não foi possível carregar o histórico.");
  }
}

/** Carrega a página de mensagens anteriores à mais antiga que já temos. Devolve true se trouxe algo. */
export async function loadOlder() {
  const open = get(peer);
  const oldest = get(messages)[0];
  if (!open || !oldest || !get(hasMore) || get(loadingOlder)) return false;
  const version = conversationVersion;
  loadingOlder.set(true);
  try {
    const page: { messages: Message[]; hasMore: boolean } = await request(`/messages/${open.id}?before=${oldest.id}`);
    if (version !== conversationVersion) return false;
    hasMore.set(page.hasMore);
    messages.update(list => merge(page.messages, list));
    return page.messages.length > 0;
  } catch {
    if (version === conversationVersion) error.set("Não foi possível carregar mensagens anteriores.");
    return false;
  } finally {
    loadingOlder.set(false);
  }
}

export async function refreshContacts() {
  const current = get(session);
  try {
    const people = await request("/users");
    if (current !== get(session)) return;
    contacts.set(people);
    unread.set(Object.fromEntries(people.map((user: User) => [user.id, user.unread ?? 0])));
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
    if (message.clientId) outbox.update(list => list.filter(item => item.clientId !== message.clientId));
    if (open && [message.senderId, message.receiverId].includes(open.id)) {
      messages.update(list => merge(list, [message]));
      if (message.senderId === open.id) {
        unread.update(counts => ({ ...counts, [open.id]: 1 }));
        markRead();
      }
    } else if (message.senderId !== get(session)?.user.id) {
      unread.update(counts => ({ ...counts, [message.senderId]: (counts[message.senderId] ?? 0) + 1 }));
    }
  });
  connection.on("read", ({ readerId, peerId, upTo, readAt }: { readerId: number; peerId: number; upTo: number; readAt: string }) => {
    const me = get(session)?.user.id;
    if (readerId === me) {
      unread.update(counts => ({ ...counts, [peerId]: 0 })); // outra aba minha leu
    } else {
      // O destinatário leu: marca as minhas mensagens até `upTo` como lidas.
      messages.update(list => list.map(m => m.senderId === me && m.receiverId === readerId && m.id <= upTo ? { ...m, readAt } : m));
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
  hasMore.set(false);
  status.set("");
  error.set("");
  connected.set(false);
  typing.set(false);
  outbox.set([]);
  unread.set({});
  ++conversationVersion;
  clearTimeout(typingTimer);
}

export function notifyTyping() {
  const open = get(peer);
  if (!open || !get(connected) || Date.now() - lastTyping < TYPING_THROTTLE_MS) return;
  lastTyping = Date.now();
  socket?.volatile.emit("typing", { receiverId: open.id });
}

// randomUUID só existe em contexto seguro (https/localhost); o fallback cobre acesso por IP da rede local.
const newId = () => globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function transmit(item: Outgoing) {
  const current = get(session);
  const mark = (status: Outgoing["status"]) => {
    if (current === get(session)) outbox.update(list => list.map(x => x.clientId === item.clientId ? { ...x, status } : x));
  };
  mark("sending");
  error.set("");
  socket?.timeout(5000).emitWithAck("message", {
    receiverId: item.receiverId, content: item.content, clientId: item.clientId,
  }).then(result => {
    if (!result.error) return; // sucesso: o evento "message" já trocou a bolha pela confirmada
    if (current === get(session)) error.set(result.error);
    mark("failed");
  }).catch(() => mark("failed"));
}

/** Envio otimista: a mensagem aparece na hora e é confirmada (ou marcada como falha) depois. */
export function send(content: string) {
  const open = get(peer);
  const text = content.trim();
  if (!socket || !open || !get(connected) || !text) return false;
  const item: Outgoing = { clientId: newId(), receiverId: open.id, content: text, status: "sending" };
  outbox.update(list => [...list, item]);
  transmit(item);
  return true;
}

/** Reenvia com o mesmo clientId: o servidor ignora duplicata se a primeira tentativa chegou. */
export function retry(clientId: string) {
  const item = get(outbox).find(x => x.clientId === clientId);
  if (item && get(connected)) transmit(item);
}

export function discard(clientId: string) {
  outbox.update(list => list.filter(x => x.clientId !== clientId));
}

const DEMO = { ana: { email: "ana@demo.dev", name: "Ana Demo" }, bruno: { email: "bruno@demo.dev", name: "Bruno Demo" } };
export const demoEnabled = env.PUBLIC_DEMO_LOGIN === "true";
export const demoAccounts = Object.values(DEMO);
export const DEMO_PASSWORD = "demo12345";
