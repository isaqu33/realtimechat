<script lang="ts">
  import { contacts, peer, choose, refreshContacts, unread } from "$lib/chat";
  import Avatar from "$lib/Avatar.svelte";

  let query = "";
  $: shown = $contacts.filter(user => user.name.toLowerCase().includes(query.trim().toLowerCase()));
  $: onlineFirst = [...shown].sort((a, b) => Number(!!b.online) - Number(!!a.online));
</script>

<aside aria-label="Contatos">
  <div class="search">
    <input type="search" bind:value={query} placeholder="Buscar contato" aria-label="Buscar contato">
    <button class="ghost" on:click={refreshContacts} title="Atualizar contatos" aria-label="Atualizar contatos">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg>
    </button>
  </div>
  <ul>
    {#each onlineFirst as user (user.id)}
      <li>
        <button class="contact" aria-pressed={$peer?.id === user.id} on:click={() => choose(user)}>
          <Avatar name={user.name} online={!!user.online} />
          <span class="info">
            <span class="name">{user.name}</span>
            <span class="state">{user.online ? "online" : "offline"}</span>
          </span>
          {#if $unread[user.id]}<span class="badge" aria-label="{$unread[user.id]} não lidas">{$unread[user.id]}</span>{/if}
        </button>
      </li>
    {:else}
      <li class="empty">{query ? "Nenhum contato encontrado." : "Ninguém por aqui ainda. Crie outra conta em uma janela anônima e atualize."}</li>
    {/each}
  </ul>
</aside>

<style>
  aside { display: flex; flex-direction: column; min-height: 0; background: var(--surface); border-right: 1px solid var(--line); }
  .search { display: flex; gap: 6px; padding: 14px; }
  .search .ghost { padding: 0 10px; }
  svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  ul { list-style: none; margin: 0; padding: 0 8px 12px; overflow-y: auto; display: grid; gap: 2px; align-content: start; }
  .contact { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px; text-align: left; background: transparent; border-color: transparent; border-radius: 14px; }
  .contact[aria-pressed="true"] { background: var(--accent-soft); }
  .info { flex: 1; min-width: 0; display: grid; }
  .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .state { font-size: .78rem; color: var(--muted); }
  .badge { min-width: 22px; padding: 1px 7px; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-size: .75rem; font-weight: 700; text-align: center; }
  .empty { color: var(--muted); font-size: .88rem; padding: 14px 10px; }
</style>
