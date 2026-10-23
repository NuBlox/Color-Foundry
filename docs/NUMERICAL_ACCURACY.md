# Numerical accuracy audit — 23 October 2026

Color Foundry uses established colour mathematics, but **no program can certify aesthetic beauty or universal perceptual distinguishability**.

## Verified references

- CSS Color 4 sRGB, OKLab, OKLCH and D65 Display P3: https://www.w3.org/TR/css-color-4/
- WCAG 2.2 relative luminance and contrast: https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
- CSS source-over compositing: https://www.w3.org/TR/compositing-1/#simplealphacompositing
- Machado, Oliveira and Fernandes (2009) colour-vision simulations: DOI 10.1109/TVCG.2009.113 and https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html

## Corrections made

The former intermediate vision-severity calculation interpolated directly between the identity and full-deficiency matrices. This is numerically wrong for the published model. The correction uses matrices at every tenth severity and linear interpolation between **adjacent deciles**. The full-severity categorical generator remains unchanged.

Non-finite RGB channels and hue/chroma inputs now throw instead of silently emitting malformed HEX.

## Reference vectors and checks

- WCAG: #777777 on white = 4.478089453577215:1; #767676 on white = 4.542224959605253:1; white/black = 21:1.
- Published red, green, blue OKLab values verified within 3e-6.
- D65 linear sRGB red to linear Display P3 = approximately (0.82246197, 0.03319420, 0.01708263).
- Independent Chromium raster check: 50% red over black = RGB (128, 0, 0).
- Test coverage includes 256 grayscale round trips, 1500 seeded gamut samples, source-over compositing and calibrated severity matrices.
- Run with `npm ci && npm run ci`.

## Limits

1. Gamut mapping uses chroma reduction with preserved OKLCH lightness/hue, not the CSS Color 4 local-MINDE gamut algorithm; out-of-gamut browser results can therefore differ.
2. HEX values are rounded to 8-bit sRGB before contrast/distance audits. P3 CSS values are separately rounded to 6 decimals; accessibility audits remain on declared sRGB combinations.
3. WCAG checks only apply to specified foreground/background combinations, not entire interfaces, imagery, thin strokes or antialiasing.
4. ΔEOK and colour-vision simulations are useful engineering proxies without a universal pass/fail discrimination threshold. Categorical selection is greedy, not globally optimal.
5. Severity interpolation approximates a model of observers; it does not reflect every person's colour vision or display conditions.
