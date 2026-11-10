<script lang="ts">
  import { DEMO_PASSWORD, demoAccounts, demoEnabled, error, signIn } from "$lib/chat";
  import Avatar from "$lib/Avatar.svelte";

  let signingUp = false;
  let pending = false;
  let name = "";
  let email = "";
  let password = "";

  async function run(creds: { name: string; email: string; password: string }, up: boolean) {
    pending = true;
    try {
      await signIn(creds, up);
      password = "";
    } catch (cause) {
      error.set(cause instanceof Error ? cause.message : "Falha ao entrar.");
    } finally {
      pending = false;
    }
  }
</script>

<section class="card">
  <h2>{signingUp ? "Criar conta" : "Entrar"}</h2>
  <form on:submit|preventDefault={() => run({ name, email, password }, signingUp)}>
    {#if signingUp}<label>Nome <input bind:value={name} maxlength="60" autocomplete="name" required></label>{/if}
    <label>E-mail <input type="email" bind:value={email} maxlength="120" autocomplete="email" required></label>
    <label>Senha
      <input type="password" bind:value={password} minlength="8" maxlength="72"
        autocomplete={signingUp ? "new-password" : "current-password"} required>
    </label>
    <button class="primary" disabled={pending}>{signingUp ? "Criar conta" : "Entrar"}</button>
  </form>
  <button type="button" class="ghost toggle" disabled={pending} on:click={() => { signingUp = !signingUp; error.set(""); }}>
    {signingUp ? "Já tenho conta" : "Criar conta fictícia"}
  </button>

  {#if demoEnabled}
    <div class="demo">
      <p>Ou entre direto com uma conta de demonstração:</p>
      {#each demoAccounts as account}
        <button type="button" class="demo-btn" disabled={pending}
          on:click={() => run({ name: "", email: account.email, password: DEMO_PASSWORD }, false)}>
          <Avatar name={account.name} size={30} /> Entrar como {account.name}
        </button>
      {/each}
      <small>Dica: use uma conta numa janela normal e a outra numa janela anônima.</small>
    </div>
  {/if}
</section>

<style>
  .card { width: 100%; max-width: 390px; padding: 28px; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: var(--shadow); }
  h2 { margin: 0 0 14px; font-size: 1.3rem; }
  label { display: block; margin: 0 0 12px; font-size: .8rem; font-weight: 600; color: var(--muted); }
  input { margin-top: 5px; color: var(--text); }
  form .primary { width: 100%; margin-top: 4px; padding: 11px; }
  .toggle { display: block; margin: 10px auto 0; font-size: .85rem; }
  .demo { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); display: grid; gap: 8px; }
  .demo p { margin: 0; font-size: .82rem; color: var(--muted); }
  .demo-btn { display: flex; align-items: center; gap: 10px; text-align: left; }
  small { color: var(--muted); font-size: .75rem; }
</style>
