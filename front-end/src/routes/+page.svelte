<script lang="ts">
  import { onDestroy } from "svelte";
  import AuthForm from "$lib/AuthForm.svelte";
  import ContactList from "$lib/ContactList.svelte";
  import Conversation from "$lib/Conversation.svelte";
  import { connected, error, session, signOut, status } from "$lib/chat";

  onDestroy(signOut);
</script>

<svelte:head><title>RealTimeChat · Demo local</title></svelte:head>

<main>
  <p class="eyebrow">PORTFÓLIO / MENSAGENS EM TEMPO REAL</p>
  <h1>RealTimeChat</h1>
  {#if $error}<p class="error" role="alert">{$error}</p>{/if}

  {#if !$session}
    <AuthForm />
  {:else}
    <div class="bar">
      <p><strong>{$session.user.name}</strong> ·
        <span role="status" class:ok={$connected}>{$status}</span></p>
      <button class="ghost" on:click={signOut}>Sair</button>
    </div>
    <div class="chat"><ContactList /><Conversation /></div>
  {/if}
</main>

<style>
  main { max-width: 920px; margin: auto; padding: clamp(20px, 5vw, 56px); }
  h1 { font: 400 clamp(2.4rem, 7vw, 4.2rem)/1 Georgia, serif; margin: 6px 0 22px; }
  .eyebrow { margin: 0; font-size: .72rem; font-weight: 700; letter-spacing: .12em; color: var(--accent); }
  .error { padding: 10px 14px; border-radius: 10px; background: var(--danger-soft); color: var(--danger); }
  .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .bar p { margin: 0; }
  .ok { color: #22a559; }
  .chat { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 16px; align-items: start; }
  @media (max-width: 640px) { .chat { grid-template-columns: 1fr; } }
</style>
