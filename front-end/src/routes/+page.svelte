<script lang="ts">
  import { onDestroy } from "svelte";
  import { env } from "$env/dynamic/public";
  import { io, type Socket } from "socket.io-client";

  type User = { id: number; name: string; online?: boolean };
  type Message = { id: number; senderId: number; receiverId: number; content: string; timestamp: string };
  const api = env.PUBLIC_API_URL || "http://127.0.0.1:3000";

  let session: { token: string; user: User } | null = null;
  let socket: Socket | undefined;
  let contacts: User[] = [];
  let peer: User | undefined;
  let messages: Message[] = [];
  let error = "";
  let status = "";
  let name = "";
  let email = "";
  let password = "";
  let draft = "";
  let signingUp = false;
  let pending = false;
  let connected = false;
  let typing = false;
  let sending = false;
  let typingTimer: ReturnType<typeof setTimeout>;
  let lastTyping = 0;
  let conversationVersion = 0;

  async function request(path: string, body?: object) {
    const response = await fetch(api + path, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }

  function merge(history: Message[], incoming: Message[]) {
    return [...new Map([...history, ...incoming].map(message => [message.id, message])).values()]
      .sort((a, b) => a.id - b.id);
  }

  async function choose(user: User) {
    if (peer?.id !== user.id) messages = [];
    peer = user;
    typing = false;
    const version = ++conversationVersion;
    try {
      const history: Message[] = await request(`/messages/${user.id}`);
      if (version === conversationVersion) messages = merge(history, messages);
    } catch {
      if (version === conversationVersion) error = "Não foi possível carregar o histórico.";
    }
  }

  async function refreshContacts() {
    const current = session;
    try {
      const people = await request("/users");
      if (current === session) contacts = people;
    } catch {
      if (current === session) error = "Não foi possível carregar os contatos.";
    }
  }

  async function signIn() {
    pending = true;
    error = "";
    try {
      if (signingUp) await request("/register", { name, email, password });
      const account = await request("/login", { email, password });
      session = account;
      password = "";
      const connection = io(api, { auth: { token: account.token } });
      socket = connection;
      connection.on("connect", () => {
        connected = true;
        status = "Conectado";
        void refreshContacts();
        if (peer) void choose(peer);
      });
      connection.on("disconnect", () => {
        connected = false;
        status = "Conexão encerrada. Entre novamente se a sessão expirou.";
      });
      connection.on("connect_error", () => {
        connected = false;
        status = "Sem conexão com a API ou sessão expirada.";
      });
      connection.on("presence", ({ userId, online }) => {
        contacts = contacts.map(user => user.id === userId ? { ...user, online } : user);
      });
      connection.on("message", (message: Message) => {
        if (peer && [message.senderId, message.receiverId].includes(peer.id)) messages = merge(messages, [message]);
      });
      connection.on("typing", ({ senderId }) => {
        if (peer?.id !== senderId) return;
        typing = true;
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => typing = false, 1800);
      });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Falha ao entrar.";
    } finally {
      pending = false;
    }
  }

  function signOut() {
    socket?.disconnect();
    session = null;
    peer = undefined;
    contacts = [];
    messages = [];
    draft = "";
    status = "";
    error = "";
    connected = false;
    typing = false;
    ++conversationVersion;
    clearTimeout(typingTimer);
  }

  function notifyTyping() {
    if (!peer || !connected || Date.now() - lastTyping < 750) return;
    lastTyping = Date.now();
    socket?.volatile.emit("typing", { receiverId: peer.id });
  }

  async function send() {
    if (!socket || !peer || !connected || !draft.trim() || sending) return;
    const version = conversationVersion;
    const current = session;
    const content = draft;
    sending = true;
    error = "";
    try {
      const result = await socket.timeout(5000).emitWithAck("message", { receiverId: peer.id, content });
      if (current !== session) return;
      if (result.error) error = result.error;
      else if (version === conversationVersion && draft === content) draft = "";
    } catch {
      if (current === session) error = "Envio sem confirmação. Confira o histórico antes de tentar novamente.";
    } finally {
      sending = false;
    }
  }

  onDestroy(() => {
    socket?.disconnect();
    clearTimeout(typingTimer);
  });
</script>

<svelte:head><title>RealTimeChat · Demo local</title></svelte:head>

<main>
  <p class="eyebrow">PORTFÓLIO / MENSAGENS EM TEMPO REAL</p>
  <h1>RealTimeChat</h1>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if !session}
    <p>Abra duas sessões do navegador e cadastre contas fictícias para trocar mensagens.</p>
    <form class="auth" on:submit|preventDefault={signIn}>
      {#if signingUp}<label>Nome <input bind:value={name} maxlength="60" required></label>{/if}
      <label>E-mail <input type="email" bind:value={email} maxlength="120" required></label>
      <label>Senha <input type="password" bind:value={password} minlength="8" maxlength="72" required></label>
      <button disabled={pending}>{signingUp ? "Criar conta" : "Entrar"}</button>
      <button type="button" class="secondary" disabled={pending} on:click={() => signingUp = !signingUp}>
        {signingUp ? "Já tenho conta" : "Criar conta fictícia"}
      </button>
    </form>
  {:else}
    <div class="bar"><p>{session.user.name} · <span role="status">{status}</span></p><button on:click={signOut}>Sair</button></div>
    <div class="chat">
      <aside>
        <h2>Contatos</h2>
        {#each contacts as user (user.id)}
          <button class="secondary" aria-pressed={peer?.id === user.id} on:click={() => choose(user)}>
            {user.name} · {user.online ? "online" : "offline"}
          </button>
        {:else}<p>Nenhum outro usuário cadastrado.</p>{/each}
        <button class="secondary" on:click={refreshContacts}>Atualizar contatos</button>
      </aside>
      <section aria-label="Conversa">
        {#if peer}
          <h2>{peer.name}</h2>
          <ul aria-label="Mensagens" aria-live="polite">
            {#each messages as message (message.id)}
              <li class:self={message.senderId === session.user.id}>{message.content}</li>
            {:else}<li>Sem mensagens nesta conversa.</li>{/each}
          </ul>
          <p role="status">{typing ? "Digitando…" : ""}</p>
          <form on:submit|preventDefault={send}>
            <label>Mensagem <input bind:value={draft} maxlength="2000" on:input={notifyTyping} required></label>
            <button disabled={!connected || sending}>Enviar</button>
          </form>
        {:else}<p>Escolha um contato para abrir a conversa.</p>{/if}
      </section>
    </div>
  {/if}
</main>

<style>
  :global(body) { margin: 0; font: 1rem/1.55 system-ui, sans-serif; color: #152b32; background: #f8f7f2; }
  main { max-width: 900px; margin: auto; padding: clamp(20px, 5vw, 60px); }
  h1 { font: 400 clamp(2.6rem, 7vw, 5rem)/1 Georgia, serif; margin: 10px 0; }
  h2 { font-size: 1.15rem; }
  .eyebrow { font-size: .72rem; font-weight: 700; letter-spacing: .12em; color: #536744; }
  .auth { max-width: 400px; }
  label { display: block; margin: 8px 0; }
  input, button { font: inherit; padding: 8px 12px; }
  input { box-sizing: border-box; display: block; width: 100%; border: 1px solid #859480; }
  button { cursor: pointer; margin: 3px 3px 3px 0; background: #152b32; color: white; border: 1px solid #152b32; }
  button:disabled { cursor: default; opacity: .55; }
  .secondary { background: transparent; color: #152b32; }
  .secondary[aria-pressed="true"] { background: #e0e8d1; }
  .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .chat { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 18px; }
  aside, section { padding: 15px; border: 1px solid #c6d0bc; }
  aside button { display: block; }
  ul { list-style: none; padding: 0; display: grid; gap: 8px; max-height: 45vh; overflow: auto; }
  li { background: #e8ede2; padding: 8px 12px; overflow-wrap: anywhere; white-space: pre-wrap; }
  li.self { background: #dce8c7; }
  @media (max-width: 600px) { .chat { grid-template-columns: 1fr; } }
</style>
