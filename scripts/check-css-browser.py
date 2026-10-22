#!/usr/bin/env python3
"""Chromium validation of shipped multi-brand CSS without a SvelteKit build.

Optional prerequisites: `python3 -m pip install playwright` and
`python3 -m playwright install chromium`.
Runs against *generated output* and the six DTCG token documents, comparing
resolved browser pixels with the independent token graph per mode.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / 'examples/sveltekit/src/lib/generated'
PROPERTIES = {
    'background': ('color.semantic.background', 'backgroundColor'),
    'text': ('color.semantic.text', 'color'),
    'primary': ('color.component.button.primary.background', 'backgroundColor'),
    'onPrimary': ('color.component.button.primary.foreground', 'color'),
    'hover': ('color.component.button.primary.hover', 'backgroundColor'),
    'card': ('color.component.card.background', 'backgroundColor'),
    'inputBorder': ('color.component.input.border', 'borderTopColor'),
    'status': ('color.component.status.success.background', 'backgroundColor'),
    'onStatus': ('color.component.status.success.foreground', 'color'),
    'focus': ('color.component.focus.ring', 'outlineColor'),
}


def token_hex(tree: dict, path: str) -> str:
    """Resolve an emitted colour alias to the stored sRGB HEX value."""
    seen = set()
    while True:
        if path in seen:
            raise AssertionError(f'Circular token reference: {path}')
        seen.add(path)
        leaf = tree
        for part in path.split('.'):
            leaf = leaf[part]
        if leaf['$type'] != 'color':
            raise AssertionError(f'Expected colour token at {path}')
        value = leaf['$value']
        if isinstance(value, str) and value.startswith('{') and value.endswith('}'):
            path = value[1:-1]
            continue
        if isinstance(value, dict) and value.get('colorSpace') == 'srgb':
            return value['hex']
        raise AssertionError(f'Unexpected value at {path}: {value!r}')


def css_rgb(hex_value: str) -> str:
    return 'rgb(' + ', '.join(str(int(hex_value[i:i+2], 16)) for i in (1, 3, 5)) + ')'


def main() -> None:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise SystemExit('Install optional Python dependency: python3 -m pip install playwright') from exc

    manifest = json.loads((GENERATED / 'brand-manifest.json').read_text())
    css = (GENERATED / 'color-foundry.css').read_text()
    default = manifest['defaultBrand']
    brands = [item['id'] for item in manifest['brands']]
    expected = {}
    for brand in brands:
        expected[brand] = {}
        for mode in ('light', 'dark'):
            tree = json.loads((GENERATED / 'brands' / f'{brand}-{mode}.json').read_text())
            expected[brand][mode] = {key: css_rgb(token_hex(tree, path))
                                     for key, (path, _) in PROPERTIES.items()}

    html = '<!doctype html><html><head><style>' + css + '</style></head><body>'
    for key, (_, property_name) in PROPERTIES.items():
        varname = {
            'background': 'color-semantic-background',
            'text': 'color-semantic-text',
            'primary': 'color-component-button-primary-background',
            'onPrimary': 'color-component-button-primary-foreground',
            'hover': 'color-component-button-primary-hover',
            'card': 'color-component-card-background',
            'inputBorder': 'color-component-input-border',
            'status': 'color-component-status-success-background',
            'onStatus': 'color-component-status-success-foreground',
            'focus': 'color-component-focus-ring',
        }[key]
        css_prop = {
            'backgroundColor': 'background-color',
            'color': 'color',
            'borderTopColor': 'border-top-color',
            'outlineColor': 'outline-color',
        }[property_name]
        html += f'<span id="c-{key}" style="{css_prop}:var(--cf-{varname})">a</span>'
    html += '</body></html>'

    results = []
    with sync_playwright() as playwright:
        opts = dict(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'])
        path = os.getenv('CHROMIUM_BIN')
        if path:
            opts['executable_path'] = path
        else:
            from shutil import which
            if which('chromium'):
                opts['executable_path'] = which('chromium')
        browser = playwright.chromium.launch(**opts)
        try:
            page = browser.new_page()
            page.set_content(html, wait_until='load')

            def run(label: str, brand: str, target_mode: str, scheme: str,
                    theme: str | None, brand_attribute: str | None) -> None:
                page.emulate_media(color_scheme=scheme)
                page.evaluate('''({brand,theme}) => {
                    if (brand === null) delete document.documentElement.dataset.brand;
                    else document.documentElement.dataset.brand = brand;
                    if (theme === null) delete document.documentElement.dataset.theme;
                    else document.documentElement.dataset.theme = theme;
                }''', {'brand': brand_attribute, 'theme': theme})
                properties = {key: prop for key, (_, prop) in PROPERTIES.items()}
                actual = page.evaluate('''props => Object.fromEntries(Object.entries(props).map(
                    ([key,prop]) => [key, getComputedStyle(document.getElementById('c-'+key))[prop]]
                ))''', properties)
                want = expected[brand][target_mode]
                differences = {key: {'expected': want[key], 'actual': actual[key]}
                               for key in PROPERTIES if actual[key] != want[key]}
                results.append({'case': label, 'passed': not differences, 'differences': differences})

            for brand in brands:
                attr = None if brand == default else brand
                for mode in ('light', 'dark'):
                    run(f'{brand}-manual-{mode}', brand, mode, 'light', mode, attr)
                    run(f'{brand}-os-{mode}', brand, mode, mode, None, attr)
                    other = 'dark' if mode == 'light' else 'light'
                    run(f'{brand}-manual-{mode}-over-os-{other}', brand, mode, other, mode, attr)
            # Unknown selections must not suppress default brand / OS behaviour.
            for mode in ('light', 'dark'):
                run(f'unknown-brand-os-{mode}', default, mode, mode, None, 'nonexistent')
        finally:
            browser.close()

    failures = [case for case in results if not case['passed']]
    report = {
        'release': '0.8.0',
        'browser': 'Chromium (Playwright Python)',
        'brandCount': len(brands),
        'cases': len(results),
        'pixelComparisons': len(results) * len(PROPERTIES),
        'passed': len(results) - len(failures),
        'failed': failures,
        'scope': 'Generated CSS only; NOT a SvelteKit build or complete WCAG audit',
    }
    report_path = ROOT / 'browser-css-report.json'
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
