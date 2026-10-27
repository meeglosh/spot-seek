# App Store screenshot composer (Duo)

Rebuilt from the 1.0 session transcript. 6 slides, flat brand fills, Anton + Space Grotesk, CSS device frame,
text-overlay "stickers". `composer/slides.html?d=outer|inner&s=1..6` renders one slide; `composer/render.sh`
renders all to `../final/{outer,inner}-0N.png` (outer 1398x2034, inner 2007x2853, flattened, no alpha) plus contact sheets.
`composer/slides-1.0-reference.html` is the replayed 1.0 (iPhone/iPad) source for comparison.

Raw captures: `raw/<outer|inner>/{01_discover_live,07_map,04_rsvp_confirmed,08_host_dashboard,06_notifications}.png`.
Captured from a Release simulator build driven by a TEMPORARY DevNav component (never committed) against a LOCAL wrangler
backend and a throwaway Neon branch (seed/*.mjs; every script imports seed/guard.mjs which refuses the live host).
Delete the branch afterwards: `node seed/mkbranch.mjs delete seed/branch.json`.
Paths in scripts point at the original scratchpad; adjust before reuse.
