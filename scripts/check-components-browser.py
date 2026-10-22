#!/usr/bin/env python3
"""Real Chromium component-state smoke tests against generated brand tokens.

This intentionally does not pretend to compile the SvelteKit application. It
loads the exact shipped application CSS and generated brand stylesheet into a
browser and verifies the component styles for six explicit brand/theme cases.
"""
from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'examples/sveltekit/src'
GENERATED = SRC / 'lib/generated'


def resolve_hex(tokens: dict, path: str) -> str:
    visited = set()
    while True:
        if path in visited:
            raise AssertionError(f'Circular token reference {path}')
        visited.add(path)
        node = tokens
        for segment in path.split('.'):
            node = node[segment]
        assert node['$type'] == 'color', path
        value = node['$value']
        if isinstance(value, str) and value.startswith('{') and value.endswith('}'):
            path = value[1:-1]
            continue
        assert isinstance(value, dict) and value.get('colorSpace') == 'srgb', (path, value)
        return value['hex']


def browser_rgb(hex_value: str) -> str:
    return 'rgb(' + ', '.join(str(int(hex_value[i:i+2], 16)) for i in (1, 3, 5)) + ')'


def main() -> None:
    manifest = json.loads((GENERATED / 'brand-manifest.json').read_text())
    brands = [brand['id'] for brand in manifest['brands']]
    theme_css = (GENERATED / 'color-foundry.css').read_text()
    app_css = (SRC / 'app.css').read_text()
    import_statement = "@import './lib/generated/color-foundry.css';"
    if import_statement not in app_css:
        raise AssertionError('app.css no longer imports the generated stylesheet')
    app_css = app_css.replace(import_statement, '', 1)
    html = f'''<!doctype html><html><head>
    <style>{theme_css}</style><style>{app_css}</style></head><body>
    <button id="primary" class="cf-button-primary">Primary action</button>
    <button id="secondary" class="cf-button-secondary">Secondary action</button>
    <button id="disabled" class="cf-button-primary" disabled>Disabled</button>
    <button id="selected" class="cf-button-secondary cf-selected" aria-pressed="true">Selected</button>
    <input id="field" class="cf-input" aria-label="Field" />
    <div id="success" class="status-chip success">Success</div>
    </body></html>'''
    results: list[dict] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium',
                                     args=['--no-sandbox', '--disable-dev-shm-usage'])
        try:
            page = browser.new_page(reduced_motion='reduce')
            page.set_content(html)
            for brand in brands:
                for mode in ('light', 'dark'):
                    page.emulate_media(color_scheme='light')
                    page.evaluate('''({brand,mode})=>{
                        document.documentElement.dataset.brand=brand;
                        document.documentElement.dataset.theme=mode;
                    }''', {'brand': brand, 'mode': mode})
                    tokens = json.loads((GENERATED / 'brands' / f'{brand}-{mode}.json').read_text())
                    expected = lambda path: browser_rgb(resolve_hex(tokens, path))
                    props = lambda selector, prop: page.locator(selector).evaluate(
                        '(el,prop)=>getComputedStyle(el).getPropertyValue(prop).trim()', prop)

                    def verify(label: str, selector: str, prop: str, token_path: str) -> None:
                        actual = props(selector, prop)
                        want = expected(token_path)
                        results.append({'case': f'{brand}/{mode}/{label}', 'passed': actual == want,
                                        'expected': want, 'actual': actual})

                    page.mouse.move(900, 750)
                    verify('primary-default', '#primary', 'background-color', 'color.component.button.primary.background')
                    verify('primary-text', '#primary', 'color', 'color.component.button.primary.foreground')
                    page.locator('#primary').hover()
                    verify('primary-hover', '#primary', 'background-color', 'color.component.button.primary.hover')
                    page.mouse.down()
                    verify('primary-pressed', '#primary', 'background-color', 'color.component.button.primary.pressed')
                    page.mouse.up()
                    page.mouse.move(900, 750)
                    verify('secondary-default', '#secondary', 'background-color', 'color.component.button.secondary.background')
                    page.locator('#secondary').hover()
                    verify('secondary-hover', '#secondary', 'background-color', 'color.component.button.secondary.hover')
                    verify('secondary-hover-border', '#secondary', 'border-top-color', 'color.component.button.secondary.hoverBorder')
                    page.mouse.move(900, 750)
                    verify('disabled-bg', '#disabled', 'background-color', 'color.component.button.primary.disabledBackground')
                    verify('disabled-fg', '#disabled', 'color', 'color.component.button.primary.disabledForeground')
                    verify('selected-bg', '#selected', 'background-color', 'color.component.selection.background')
                    verify('selected-fg', '#selected', 'color', 'color.component.selection.foreground')
                    verify('success-bg', '#success', 'background-color', 'color.component.status.success.background')
                    verify('success-fg', '#success', 'color', 'color.component.status.success.foreground')
                    page.locator('#field').focus()
                    verify('field-focus', '#field', 'outline-color', 'color.component.input.focus')
                    page.locator('#field').blur()
        finally:
            browser.close()
    failed = [r for r in results if not r['passed']]
    summary = {'browser': 'Chromium', 'scope': 'Rendered app CSS, not SvelteKit hydration',
               'cases': len(results), 'passed': len(results)-len(failed), 'failed': failed}
    (ROOT / 'browser-components-report.json').write_text(json.dumps(summary, indent=2)+'\n')
    print(json.dumps(summary, indent=2))
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
