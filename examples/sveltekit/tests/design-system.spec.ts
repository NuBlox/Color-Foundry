import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const names = {
  foundry: 'Foundry Blue',
  forest: 'Evergreen',
  plum: 'Royal Plum',
} as const;

async function navigate(page: Page) {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-cf-hydrated', 'true');
}

test('renders a multi-brand SvelteKit application with accessible controls', async ({page}) => {
  await navigate(page);
  await expect(page.getByRole('heading',{name:'Multiple brands. One design system.'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Status tokens'})).toBeVisible();
  await expect(page.locator('.ramp-cell')).toHaveCount(11);
  await expect(page.getByLabel('Example text field')).toBeVisible();
  await expect(page.getByLabel('Brand')).toHaveValue('foundry');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme','dark');
});

test('explicit themes override OS preference and persist after reload',async({page})=>{
  await navigate(page);
  await page.getByRole('button',{name:'dark',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  const darkBackground=await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByRole('button',{name:'light',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  const lightBackground=await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor);
  expect(lightBackground).not.toBe(darkBackground);
  await page.getByRole('button',{name:'system',exact:true}).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
});

test('brand switching changes computed semantic colours and survives reload',async({page})=>{
  await navigate(page);
  const button = page.getByRole('button',{name:'Primary action'});
  const color=()=>button.evaluate(e=>getComputedStyle(e).backgroundColor);
  const baseline=await color();
  await page.getByLabel('Brand').selectOption('forest');
  await expect(page.locator('html')).toHaveAttribute('data-brand','forest');
  await expect(page.getByRole('heading',{name:'Primary colour family · Evergreen'})).toBeVisible();
  const forest=await color();
  expect(forest).not.toBe(baseline);
  await page.getByRole('button',{name:'dark',exact:true}).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-brand','forest');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByLabel('Brand').selectOption('plum');
  expect(await color()).not.toBe(forest);
  await page.getByLabel('Brand').selectOption('foundry');
  await expect(page.locator('html')).not.toHaveAttribute('data-brand');
});

test('OS dark mode applies the selected brand and manual light takes precedence',async({page})=>{
  await page.emulateMedia({colorScheme:'light'});
  await navigate(page);
  await page.getByLabel('Brand').selectOption('forest');
  const body=page.locator('body');
  const background=()=>body.evaluate(e=>getComputedStyle(e).backgroundColor);
  const forestLight=await background();
  await page.emulateMedia({colorScheme:'dark'});
  const forestDark=await background();
  expect(forestDark).not.toBe(forestLight);
  await page.getByRole('button',{name:'light',exact:true}).click();
  expect(await background()).toBe(forestLight);
  await page.getByRole('button',{name:'system',exact:true}).click();
  expect(await background()).toBe(forestDark);
});

test('controls have keyboard focus and the selection control exposes state',async({page})=>{
  await navigate(page);
  const button=page.getByRole('button',{name:'Primary action'});
  for(let i=0;i<20;i++) {
    if(await button.evaluate(e=>document.activeElement===e)) break;
    await page.keyboard.press('Tab');
  }
  await expect(button).toBeFocused();
  await expect(button).toHaveCSS('outline-style','solid');
  const toggle=page.getByRole('button',{name:'Selectable'});
  await toggle.click();
  await expect(page.getByRole('button',{name:/Selected/})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'Disabled'})).toBeDisabled();
});

for(const brand of Object.keys(names) as Array<keyof typeof names>){
  for(const mode of ['light','dark'] as const) {
    test(`axe WCAG A/AA audit: ${names[brand]}, ${mode}`,async({page})=>{
      await navigate(page);
      await page.getByLabel('Brand').selectOption(brand);
      await page.getByRole('button',{name:mode,exact:true}).click();
      await expect(page.locator('.ramp-cell')).toHaveCount(11);
      const report=await new AxeBuilder({page})
        .withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
      expect(report.violations).toEqual([]);
    });
  }
}


test('a persisted supported brand restores before hydration; invalid brand is discarded', async ({page}) => {
  await page.addInitScript(() => {
    // init scripts run again on reload; seed once so the invalid-brand test is meaningful.
    if (sessionStorage.getItem('cf-test-seeded')) return;
    sessionStorage.setItem('cf-test-seeded', '1');
    localStorage.setItem('color-foundry-brand', 'forest');
    localStorage.setItem('color-foundry-theme', 'dark');
  });
  await navigate(page);
  await expect(page.locator('html')).toHaveAttribute('data-brand', 'forest');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByLabel('Brand')).toHaveValue('forest');
  await page.evaluate(() => localStorage.setItem('color-foundry-brand', 'nonexistent'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-cf-hydrated', 'true');
  await expect(page.locator('html')).not.toHaveAttribute('data-brand');
  await expect(page.getByLabel('Brand')).toHaveValue('foundry');
  expect(await page.evaluate(() => localStorage.getItem('color-foundry-brand'))).toBeNull();
});