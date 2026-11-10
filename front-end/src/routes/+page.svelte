<script lang="ts">
  import { onDestroy } from "svelte";
  import AuthForm from "$lib/AuthForm.svelte";
  import Avatar from "$lib/Avatar.svelte";
  import ContactList from "$lib/ContactList.svelte";
  import Conversation from "$lib/Conversation.svelte";
  import ThemeToggle from "$lib/ThemeToggle.svelte";
  import { connected, error, peer, session, signOut, status } from "$lib/chat";

  onDestroy(signOut);
  // No celular mostramos ou a lista ou a conversa; no desktop, as duas.
  $: showChat = !!$peer;
  const features = ["Socket.IO", "JWT no socket", "AES-256-GCM", "Envio otimista", "Docker"];
</script>

<svelte:head><title>RealTimeChat · Demo</title></svelte:head>

{#if !$session}
  <main class="landing">
    <div class="top"><ThemeToggle /></div>
    <div class="hero">
      <section>
        <p class="eyebrow">Projeto de portfólio</p>
        <h1>Mensagens privadas<br>em tempo real.</h1>
        <p class="lead">Chat com presença online, "digitando…", envio otimista com reenvio seguro e mensagens cifradas no banco.</p>
        <ul class="chips">{#each features as feature}<li>{feature}</li>{/each}</ul>
        {#if $error}<p class="error" role="alert">{$error}</p>{/if}
      </section>
      <AuthForm />
    </div>
  </main>
{:else}
  <div class="app" class:chat-open={showChat}>
    <header class="topbar">
      <strong class="brand">RealTimeChat</strong>
      <span class="who"><Avatar name={$session.user.name} size={28} /> {$session.user.name}</span>
      <span class="status" class:ok={$connected} role="status">
        <i aria-hidden="true"></i>{$connected ? "Conectado" : $status || "Conectando…"}
      </span>
      <ThemeToggle />
      <button class="ghost" on:click={signOut}>Sair</button>
    </header>
    {#if $error}<p class="error banner" role="alert">{$error}</p>{/if}
    <div class="panes">
      <ContactList />
      <Conversation on:back={() => peer.set(undefined)} />
    </div>
  </div>
{/if}

<style>
  .landing { min-height: 100dvh; padding: 18px clamp(18px, 5vw, 56px) 40px; }
  .top { display: flex; justify-content: flex-end; }
  .hero { max-width: 1040px; margin: 6vh auto 0; display: flex; flex-wrap: wrap; gap: 48px; align-items: center; justify-content: space-between; }
  .hero section { flex: 1 1 380px; }
  .eyebrow { margin: 0 0 14px; font-size: .78rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--accent); }
  h1 { margin: 0; font-size: clamp(2.3rem, 6vw, 3.8rem); line-height: 1.05; letter-spacing: -.03em; }
  .lead { margin: 18px 0; max-width: 460px; color: var(--muted); font-size: 1.05rem; }
  .chips { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .chips li { padding: 4px 12px; font-size: .8rem; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--muted); }
  .error { padding: 10px 14px; border-radius: 12px; background: var(--danger-soft); color: var(--danger); }

  .app { height: 100dvh; display: flex; flex-direction: column; }
  .topbar { display: flex; align-items: center; gap: 14px; padding: 10px 18px; background: var(--surface); border-bottom: 1px solid var(--line); }
  .brand { letter-spacing: -.02em; margin-right: auto; }
  .who { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: .9rem; }
  .status { display: flex; align-items: center; gap: 6px; font-size: .8rem; color: var(--muted); }
  .status i { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
  .status.ok i { background: var(--ok); }
  .banner { margin: 8px 18px 0; }
  .panes { flex: 1; min-height: 0; display: grid; grid-template-columns: 320px minmax(0, 1fr); }
  @media (max-width: 760px) {
    .panes { grid-template-columns: 1fr; }
    .app:not(.chat-open) .panes > :global(section) { display: none; }
    .app.chat-open .panes > :global(aside) { display: none; }
    .who, .status { display: none; }
  }
</style>
