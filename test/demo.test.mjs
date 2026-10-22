import test from 'node:test';
import assert from 'node:assert/strict';
import { createPalette } from '../dist/index.js';

class FakeNode {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.listeners = new Map();
    this.props = new Map();
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.style = { setProperty: (key, val) => this.props.set(key, val) };
    this.classList = { add(){}, remove(){}, toggle(){} };
  }
  append(...nodes){ this.children.push(...nodes); }
  replaceChildren(...nodes){ this.children=[...nodes]; }
  addEventListener(event, handler){ this.listeners.set(event,handler); }
  setAttribute(name,value){ this.props.set(name,value); }
  get lastElementChild(){return this.children.at(-1);}
}

test('browser entrypoint initialises controls, builds 143 swatches, and changes theme', async () => {
  const registry = new Map();
  const get = id => {
    if(!registry.has(id)) registry.set(id,new FakeNode(id));
    return registry.get(id);
  };
  globalThis.document = {
    getElementById: get,
    createElement: tag => new FakeNode(tag),
    body: new FakeNode('body'),
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {clipboard: {writeText: async () => {}}} });
  get('theme-select').value = 'light';
  get('category-count').value = '8';
  get('category-contrast').value = '3';
  get('vision-select').value = 'normal';
  await import('../demo/app.js');
  assert.equal(get('scales').children.length,13);
  assert.equal(get('category-colors').children.length,8);
  assert.match(get('category-report').textContent,/weakest ΔEOK/);
  const count=get('scales').children.reduce((total,row)=>total + row.children.at(-1).children.length,0);
  assert.equal(count,143);
  assert.equal(get('audit-rows').children.length,78);
  assert.equal(get('audit-count').textContent,'78 / 78');
  const light=createPalette('#2563EB').light;
  assert.equal(get('preview').props.get('--pv-background'),light.background);
  assert.equal(get('preview').props.get('--pv-primary-hover'),createPalette('#2563EB').interactions.light.primaryHover);
  get('theme-select').value='dark';
  get('theme-select').listeners.get('change')();
  assert.equal(get('preview').props.get('--pv-background'),createPalette('#2563EB').dark.background);
  assert.equal(get('category-colors').children.length,8);
  assert.equal(get('preview').props.get('--pv-primary-pressed'),createPalette('#2563EB').interactions.dark.primaryPressed);
  assert.match(get('css-preview').textContent,/--palette-primary-50:/);
  // Three new DTCG / design-system downloads are wired to real handlers.
  for (const id of ['download-system-button','download-dtcg-light-button','download-dtcg-dark-button']) {
    assert.equal(typeof get(id).listeners.get('click'),'function');
  }
  get('intent-select').value='restrained';
  get('optimize-button').listeners.get('click')();
  await new Promise(resolve=>setTimeout(resolve,1000));
  assert.match(get('optimization-detail').children[0].textContent,/restrained/);
  assert.ok(Number(get('objective-score').textContent)>0);
  assert.equal(get('audit-count').textContent,'78 / 78');
  assert.equal(get('scales').children.length,13);
  get('vision-select').value = 'protanopia';
  get('vision-select').listeners.get('change')();
  assert.notEqual(get('preview').props.get('--pv-primary'), createPalette('#2563EB').dark.primary);
  assert.match(get('vision-report').textContent,/Smallest simulated/);
  get('category-count').value='12';
  get('category-count').listeners.get('change')();
  assert.equal(get('category-colors').children.length,12);
  assert.equal(typeof get('download-category-button').listeners.get('click'),'function');
  // A DOM-API interaction smoke test, not a rendered-browser accessibility audit.
});
