<script lang="ts">
  export let name = "";
  export let online: boolean | undefined = undefined;
  export let size = 40;

  // Cor estável por nome: o mesmo usuário tem sempre o mesmo avatar.
  $: hue = [...name].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7);
  $: initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
</script>

<span class="avatar" style="--hue: {hue}; --size: {size}px" aria-hidden="true">
  {initials}
  {#if online !== undefined}<i class:on={online}></i>{/if}
</span>

<style>
  .avatar {
    position: relative; flex: none; display: grid; place-items: center;
    width: var(--size); height: var(--size); border-radius: 50%;
    font-size: calc(var(--size) * .36); font-weight: 650; letter-spacing: .02em;
    color: hsl(var(--hue) 55% 28%); background: hsl(var(--hue) 70% 88%);
  }
  :global([data-theme="dark"]) .avatar { color: hsl(var(--hue) 80% 85%); background: hsl(var(--hue) 40% 25%); }
  i { position: absolute; right: -1px; bottom: -1px; width: 28%; height: 28%; border-radius: 50%; background: var(--muted); border: 2px solid var(--surface); }
  i.on { background: var(--ok); }
</style>
