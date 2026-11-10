<script lang="ts">
  import { onMount } from "svelte";
  import { cycleTheme, initTheme, theme } from "$lib/theme";

  onMount(initTheme);
  const label = { system: "Tema: automático", light: "Tema: claro", dark: "Tema: escuro" };
</script>

<button class="icon" on:click={() => cycleTheme($theme)} aria-label="{label[$theme]}. Clique para alternar" title={label[$theme]}>
  {#if $theme === "light"}
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
  {:else if $theme === "dark"}
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 13.5A9 9 0 1 1 10.5 3a7 7 0 0 0 10.5 10.5z"/></svg>
  {:else}
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
  {/if}
</button>

<style>
  .icon { display: grid; place-items: center; width: 38px; height: 38px; padding: 0; border-radius: 10px; }
  svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
</style>
