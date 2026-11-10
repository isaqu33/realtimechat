<script lang="ts">
  import { contacts, peer, choose, refreshContacts } from "$lib/chat";
</script>

<aside aria-label="Contatos">
  <header><h2>Contatos</h2><button class="ghost" on:click={refreshContacts}>Atualizar</button></header>
  <ul>
    {#each $contacts as user (user.id)}
      <li>
        <button class="contact" aria-pressed={$peer?.id === user.id} on:click={() => choose(user)}>
          <span class="dot" class:on={user.online} aria-hidden="true"></span>
          <span class="name">{user.name}</span>
          <span class="state">{user.online ? "online" : "offline"}</span>
        </button>
      </li>
    {:else}<li class="empty">Nenhum outro usuário cadastrado ainda. Crie uma segunda conta e clique em Atualizar.</li>{/each}
  </ul>
</aside>

<style>
  aside { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 1rem; }
  ul { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 4px; }
  .contact { width: 100%; display: flex; align-items: center; gap: 10px; text-align: left; background: transparent; color: inherit; border: 1px solid transparent; }
  .contact[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); }
  .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .state { font-size: .75rem; color: var(--muted); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); opacity: .5; }
  .dot.on { background: #22a559; opacity: 1; }
  .empty { color: var(--muted); font-size: .88rem; padding: 6px; }
</style>
