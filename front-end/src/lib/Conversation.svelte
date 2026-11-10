<script lang="ts">
  import { afterUpdate, createEventDispatcher } from "svelte";
  import { connected, discard, messages, notifyTyping, outbox, peer, retry, send, session, typing } from "$lib/chat";
  import Avatar from "$lib/Avatar.svelte";

  const dispatch = createEventDispatcher<{ back: void }>();
  let draft = "";
  let list: HTMLElement;

  type Row = { key: string; self: boolean; content: string; at?: string; status?: "sending" | "failed"; clientId?: string };

  $: rows = [
    ...$messages.map(m => ({ key: `m${m.id}`, self: m.senderId === $session?.user.id, content: m.content, at: m.timestamp }) as Row),
    ...$outbox.filter(o => o.receiverId === $peer?.id).map(o => ({ key: o.clientId, self: true, content: o.content, status: o.status, clientId: o.clientId }) as Row),
  ];

  const dayOf = (iso: string) => new Date(iso).toDateString();
  function dayLabel(iso: string) {
    const date = new Date(iso);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);
    if (date.toDateString() === today.toDateString()) return "Hoje";
    if (date.toDateString() === yesterday.toDateString()) return "Ontem";
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  }
  const time = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  // Mostra o separador de dia só quando o dia muda em relação à mensagem anterior.
  const newDay = (index: number) => !!rows[index].at && (index === 0 || !rows[index - 1].at || dayOf(rows[index].at!) !== dayOf(rows[index - 1].at!));

  function submit() {
    if (send(draft)) draft = "";
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); }
  }
  // Mantém a última mensagem visível quando chega algo novo.
  afterUpdate(() => { if (list) list.scrollTop = list.scrollHeight; });
</script>

<section aria-label="Conversa">
  {#if $peer}
    <header>
      <button class="ghost back" on:click={() => dispatch("back")} aria-label="Voltar aos contatos">‹</button>
      <Avatar name={$peer.name} online={!!$peer.online} size={38} />
      <div><h2>{$peer.name}</h2><span>{$typing ? "digitando…" : $peer.online ? "online" : "offline"}</span></div>
    </header>

    <div class="scroll" bind:this={list} aria-label="Mensagens" aria-live="polite" role="log">
      {#each rows as row, index (row.key)}
        {#if newDay(index)}<div class="day"><span>{dayLabel(row.at ?? "")}</span></div>{/if}
        <div class="line" class:self={row.self}>
          <div class="bubble" class:pending={row.status === "sending"} class:failed={row.status === "failed"}>
            <span class="text">{row.content}</span>
            <span class="meta">
              {#if row.status === "sending"}enviando…
              {:else if row.status === "failed"}não enviada
              {:else if row.at}{time(row.at)}{/if}
            </span>
          </div>
          {#if row.status === "failed" && row.clientId}
            <span class="actions">
              <button class="ghost" on:click={() => retry(row.clientId ?? "")} disabled={!$connected}>Tentar de novo</button>
              <button class="ghost" on:click={() => discard(row.clientId ?? "")}>Descartar</button>
            </span>
          {/if}
        </div>
      {:else}
        <p class="empty">Sem mensagens nesta conversa. Diga oi! 👋</p>
      {/each}
    </div>

    <form on:submit|preventDefault={submit}>
      <input bind:value={draft} maxlength="2000" placeholder={$connected ? "Escreva uma mensagem" : "Reconectando…"}
        aria-label="Mensagem" on:input={notifyTyping} on:keydown={onKey} autocomplete="off">
      <button class="primary" disabled={!$connected || !draft.trim()}>Enviar</button>
    </form>
  {:else}
    <div class="placeholder">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>
      <p>Escolha um contato para abrir a conversa.</p>
    </div>
  {/if}
</section>

<style>
  section { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--bg); }
  header { display: flex; align-items: center; gap: 12px; padding: 12px 18px; background: var(--surface); border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font-size: 1rem; line-height: 1.2; }
  header span { font-size: .78rem; color: var(--muted); }
  .back { display: none; font-size: 1.6rem; padding: 0 10px; line-height: 1; }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 4px; }
  .day { align-self: center; margin: 10px 0; font-size: .72rem; color: var(--muted); }
  .day span { padding: 3px 12px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); }
  .line { display: flex; flex-direction: column; align-items: flex-start; max-width: 100%; }
  .line.self { align-items: flex-end; }
  .bubble { max-width: min(78%, 560px); padding: 8px 12px 6px; background: var(--bubble); border-radius: 18px 18px 18px 5px; }
  .self .bubble { background: var(--bubble-self); color: #fff; border-radius: 18px 18px 5px 18px; }
  .text { display: block; overflow-wrap: anywhere; white-space: pre-wrap; }
  .meta { display: block; margin-top: 1px; font-size: .68rem; text-align: right; opacity: .7; }
  .bubble.pending { opacity: .65; }
  .bubble.failed { background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger); }
  .actions { display: flex; gap: 2px; }
  .actions .ghost { padding: 2px 8px; font-size: .78rem; color: var(--danger); }
  .empty { margin: auto; color: var(--muted); }
  form { display: flex; gap: 8px; padding: 12px 18px 16px; background: var(--surface); border-top: 1px solid var(--line); }
  form .primary { padding: 0 20px; }
  .placeholder { margin: auto; display: grid; justify-items: center; gap: 6px; color: var(--muted); }
  .placeholder svg { width: 54px; height: 54px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linejoin: round; opacity: .6; }
  @media (max-width: 760px) { .back { display: block; } }
</style>
