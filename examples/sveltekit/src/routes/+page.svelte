<script lang="ts">
  import { onMount } from 'svelte';
  import brandManifest from '$lib/generated/brand-manifest.json';

  type ThemePreference = 'system' | 'light' | 'dark';
  let preference = $state<ThemePreference>('system');
  let active = $state(false);
  let email = $state('');
  const availableBrands = brandManifest.brands;
  let brand = $state(brandManifest.defaultBrand);
  const selectedBrand = $derived(availableBrands.find(item => item.id === brand) ?? availableBrands[0]);
  const primary = $derived(selectedBrand.primary);
  const statuses = [
    { name: 'Success', key: 'success', symbol: '✓' },
    { name: 'Warning', key: 'warning', symbol: '!' },
    { name: 'Danger', key: 'danger', symbol: '×' },
    { name: 'Information', key: 'info', symbol: 'i' }
  ];

  onMount(() => {
    try {
      const stored = localStorage.getItem('color-foundry-theme');
      if (stored === 'light' || stored === 'dark') preference = stored;
      const storedBrand = localStorage.getItem('color-foundry-brand');
      if (availableBrands.some(item => item.id === storedBrand)) {
        brand = storedBrand!;
      } else if (storedBrand) {
        localStorage.removeItem('color-foundry-brand');
        delete document.documentElement.dataset.brand;
      }
    } catch { /* Use system preference when storage is unavailable. */ }
    // Expose a deterministic hydration signal for browser tests and clients.
    document.documentElement.dataset.cfHydrated = 'true';
  });

  function setBrand(value: string) {
    if (!availableBrands.some(item => item.id === value)) return;
    brand = value;
    if (value === brandManifest.defaultBrand) delete document.documentElement.dataset.brand;
    else document.documentElement.dataset.brand = value;
    try { localStorage.setItem('color-foundry-brand', value); }
    catch { /* Functional without persistent storage. */ }
  }

  function setTheme(value: ThemePreference) {
    preference = value;
    if (value === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = value;
    try {
      if (value === 'system') localStorage.removeItem('color-foundry-theme');
      else localStorage.setItem('color-foundry-theme', value);
    } catch { /* Theme works without storage, but will not persist. */ }
  }
</script>

<svelte:head>
  <title>Color Foundry — Design Token Starter</title>
  <meta name="description" content="SvelteKit example driven entirely by generated, contrast-audited Color Foundry design tokens." />
</svelte:head>

<div class="shell">
  <header class="header cf-card">
    <div class="brand"><span class="brand-mark">C</span><div><b>Color Foundry</b><small>Multi-brand design system</small></div></div>
    <div class="design-controls">
      <div class="brand-picker">
        <label for="brand-choice">Brand</label>
        <select id="brand-choice" value={brand} onchange={(event) => setBrand(event.currentTarget.value)}>
          {#each availableBrands as option (option.id)}
            <option value={option.id}>{option.name}</option>
          {/each}
        </select>
      </div>
      <fieldset class="theme-switch" aria-label="Choose colour scheme">
      <legend>Theme</legend>
      {#each ['system','light','dark'] as mode}
        <button type="button" class:chosen={preference === mode} aria-pressed={preference === mode} onclick={() => setTheme(mode as ThemePreference)}>{mode}</button>
      {/each}
      </fieldset>
    </div>
  </header>

  <main>
    <section class="hero">
      <p class="eyebrow">COLOR FOUNDRY / v0.8</p>
      <h1>Multiple brands. One design system.</h1>
      <p>Switch between independently generated and contrast-audited brands, each with light and dark modes, without changing a single component class.</p>
      <div class="actions">
        <button class="cf-button-primary" onclick={() => active = !active}>{active ? 'Selection enabled' : 'Explore the system'}</button>
        <button class="cf-button-secondary" onclick={() => setTheme(preference === 'dark' ? 'light' : 'dark')}>Switch theme</button>
      </div>
    </section>

    <section class="cf-card demo-card" aria-labelledby="sample-title">
      <div class="section-heading"><div><p class="eyebrow">COMPONENT TOKENS</p><h2 id="sample-title">Interactive states</h2></div><span class="label">Accessible roles</span></div>
      <div class="actions">
        <button class="cf-button-primary">Primary action</button>
        <button class="cf-button-secondary">Secondary action</button>
        <button class="cf-button-primary" disabled>Disabled</button>
        <button class={active ? 'cf-button-secondary cf-selected' : 'cf-button-secondary'} aria-pressed={active} onclick={() => active = !active}>{active ? '✓ Selected' : 'Selectable'}</button>
      </div>
      <label class="field-label" for="email">Example text field</label>
      <input id="email" class="cf-input" type="email" bind:value={email} placeholder="name@example.com" autocomplete="off" />
      <p class="muted">The generated focus ring, button states, input border and selection marker use named component tokens.</p>
    </section>

    <section class="cf-card demo-card" aria-labelledby="palette-title">
      <div class="section-heading"><div><p class="eyebrow">PERCEPTUAL SCALE</p><h2 id="palette-title">Primary colour family · {selectedBrand.name}</h2></div><span class="label">11 steps</span></div>
      <div class="palette-ramp">
        {#each primary as swatch}
          <div class="ramp-cell" style:background={swatch.hex} title={swatch.hex}><span>{swatch.step}</span></div>
        {/each}
      </div>
      <p class="muted">The shown raw colours are sRGB. Semantic tokens stay independently contrast-audited when Display P3 enhancements are available.</p>
    </section>

    <section class="cf-card demo-card" aria-labelledby="status-title">
      <div class="section-heading"><div><p class="eyebrow">SEMANTIC COLOURS</p><h2 id="status-title">Status tokens</h2></div></div>
      <div class="status-row">
        {#each statuses as status}
          <div class="status-chip" class:success={status.key === 'success'} class:warning={status.key === 'warning'} class:danger={status.key === 'danger'} class:info={status.key === 'info'}>
            <span aria-hidden="true">{status.symbol}</span> {status.name}
          </div>
        {/each}
      </div>
    </section>
  </main>
  <footer>Built using Color Foundry v0.8 · WCAG checks apply only to the declared token pairs, not the entire app.</footer>
</div>