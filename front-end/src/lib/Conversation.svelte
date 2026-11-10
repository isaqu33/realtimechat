<script lang="ts">
  import { afterUpdate } from "svelte";
  import { connected, messages, notifyTyping, peer, send, sending, session, typing } from "$lib/chat";

  let draft = "";
  let list: HTMLUListElement;

  const time = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  async function submit() {
    const content = draft;
    if (await send(content) && draft === content) draft = "";
  }

  // Mantém a última mensagem visível quando chega algo novo.
  afterUpdate(() => { if (list) list.scrollTop = list.scrollHeight; });
</script>

<section aria-label="Conversa">
  {#if $peer}
    <header>
      <h2>{$peer.name}</h2>
      <span class="state">{$peer.online ? "online" : "offline"}</span>
    </header>
    <ul bind:this={list} aria-label="Mensagens" aria-live="polite">
      {#each $messages as message (message.id)}
        <li class:self={message.senderId === $session?.user.id}>
          <span class="text">{message.content}</span>
          <time datetime={message.timestamp}>{time(message.timestamp)}</time>
        </li>
      {:else}<li class="empty">Sem mensagens nesta conversa. Diga oi!</li>{/each}
    </ul>
    <p class="typing" role="status">{$typing ? `${$peer.name} está digitando…` : ""}</p>
    <form on:submit|preventDefault={submit}>
      <input bind:value={draft} maxlength="2000" placeholder="Escreva uma mensagem" aria-label="Mensagem"
        on:input={notifyTyping} required>
      <button class="primary" disabled={!$connected || $sending}>Enviar</button>
    </form>
  {:else}
    <p class="empty">Escolha um contato para abrir a conversa.</p>
  {/if}
</section>

<style>
  section { display: flex; flex-direction: column; min-height: 420px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; }
  header { display: flex; align-items: baseline; gap: 10px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
  h2 { margin: 0; font-size: 1rem; }
  .state { font-size: .78rem; color: var(--muted); }
  ul { flex: 1; list-style: none; margin: 10px 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 50vh; overflow-y: auto; }
  li { align-self: flex-start; max-width: 78%; background: var(--bubble); padding: 7px 12px; border-radius: 14px 14px 14px 4px; }
  .text { overflow-wrap: anywhere; white-space: pre-wrap; }
  li.self { align-self: flex-end; background: var(--accent); color: #fff; border-radius: 14px 14px 4px 14px; }
  li.empty { align-self: center; background: none; color: var(--muted); }
  time { display: block; font-size: .68rem; opacity: .7; text-align: right; }
  .typing { min-height: 1.3em; margin: 0 0 6px; font-size: .8rem; color: var(--muted); }
  .empty { color: var(--muted); margin: auto; }
  form { display: flex; gap: 8px; }
</style>
