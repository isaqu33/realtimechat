<script lang="ts">
  import { error, signIn } from "$lib/chat";

  let signingUp = false;
  let pending = false;
  let name = "";
  let email = "";
  let password = "";

  async function submit() {
    pending = true;
    try {
      await signIn({ name, email, password }, signingUp);
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
  <p class="hint">Abra uma segunda janela anônima, crie outra conta fictícia e troque mensagens entre as duas.</p>
  <form on:submit|preventDefault={submit}>
    {#if signingUp}<label>Nome <input bind:value={name} maxlength="60" autocomplete="name" required></label>{/if}
    <label>E-mail <input type="email" bind:value={email} maxlength="120" autocomplete="email" required></label>
    <label>Senha
      <input type="password" bind:value={password} minlength="8" maxlength="72"
        autocomplete={signingUp ? "new-password" : "current-password"} required>
    </label>
    <button class="primary" disabled={pending}>{signingUp ? "Criar conta" : "Entrar"}</button>
    <button type="button" class="link" disabled={pending} on:click={() => { signingUp = !signingUp; error.set(""); }}>
      {signingUp ? "Já tenho conta" : "Criar conta fictícia"}
    </button>
  </form>
</section>

<style>
  .card { max-width: 400px; margin: 8vh auto 0; padding: 28px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
  h2 { margin: 0 0 6px; font-size: 1.3rem; }
  .hint { margin: 0 0 18px; color: var(--muted); font-size: .9rem; }
  label { display: block; margin: 12px 0; font-size: .85rem; font-weight: 600; }
  input { margin-top: 4px; }
  .primary { width: 100%; margin-top: 8px; }
  .link { display: block; margin: 14px auto 0; background: none; border: 0; color: var(--accent); text-decoration: underline; }
</style>
