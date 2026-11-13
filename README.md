# PlanCraft — Floorplan Studio

Design your home in 2D, walk it in 3D. PlanCraft turns a millimetre-accurate floor plan into a live 3D interior — walls grow, furniture drops in, sunlight moves. Everything runs in the browser, no install, no plugins.

## Features

- **Precise 2D plan editor** — draw walls, place doors and windows, add dimensions. Millimetre units, grid snapping, wall attachment; load-bearing walls are protected automatically.
- **One-click 3D walkthrough** — the plan grows into a full 3D home with walls, ceilings, glass and shadows. Orbit it, cut walls open, or walk through first-person, day or night.
- **55-item furniture library** — beds, sofas, kitchen islands, appliances and more, each modelled at real dimensions. Drag onto the plan and the 3D scene updates instantly.
- **Materials & daylight** — switch floor and wall materials, move the sun across the sky from 7:00 to 18:00, or switch to a night scene with lamps that actually light up.
- **Export & share** — export the plan as a scaled PNG or the whole design as JSON (re-importable). Works offline; plans are stored locally on your device.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Vue 3 (`<script setup>`) + vue-router (hash history, static-hosting friendly) |
| Build | Vite |
| 3D engine | [`@ptahjs/tri-3d`](https://www.npmjs.com/package/@ptahjs/tri-3d) kernel over three/webgpu (WebGPU with WebGL2 fallback) |
| 2D editor | Hand-rolled SVG plan renderer (innerHTML fragments, mm domain, pan/zoom view transform) |
| State | Custom plan store — reactive state, JSON-snapshot undo stack (150 steps), localStorage persistence |
| Tests | Playwright (e2e) |

## Getting started

Requires Node 20+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev        # dev server at http://localhost:5173
pnpm build      # production build to dist/
pnpm test:e2e   # Playwright e2e suite (starts its own dev server on :5180)
```

## Architecture

```
src/
├── main.js                  # app bootstrap + router
├── App.vue                  # router outlet
├── views/
│   ├── HomeView.vue         # marketing pages (home / pricing / login / signup)
│   └── EditorView.vue       # /app — the editor UI: toolbars, panels, library, stats
├── stores/
│   └── plan.js              # plan state: rooms/walls/furniture/measures, undo, localStorage
├── styles/
│   ├── index.css            # editor theme (warm-paper variables, layout)
│   └── site.css             # marketing-site styles
└── engine/
    ├── index.js             # engine assembly: plan store → world → interact → view2d → viewmode
    ├── view2d.js            # SVG plan editor (render + drag/resize/measure interaction)
    ├── viewmode.js          # 2D↔3D switching (cross-fade + camera arc + wall growth)
    ├── interact.js          # pointer picking, ground raycast, keyboard shortcuts
    ├── camera.js            # camera rig (orbit / iso / top / room fly-to)
    ├── walk.js              # first-person walkthrough mode
    └── floorplan/
        ├── data.js          # default floor plan, materials, furniture catalog
        ├── world.js         # 3D world assembly (lights, ground, arch, furniture)
        ├── arch.js          # walls/doors/windows/ceilings mesh building
        ├── furniture.js     # procedural furniture meshes
        ├── materials.js     # floor/wall material library
        └── helpers.js       # polygon math (area, perimeter, bbox, push-out)
```

The plan store (`stores/plan.js`) is the single source of truth: the SVG editor, the properties panels and the 3D world all read it, and 3D rebuilds are triggered incrementally via `onChange` subscribers with signature comparison. View switching (press `T`) is orchestrated by `engine/viewmode.js` — a 420 ms cross-fade plus a 1700 ms camera arc while walls grow.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `V` | Select / move |
| `M` | Measure (Shift: lock horizontal/vertical) |
| `X` | Demolish non-bearing walls (black = bearing, cannot be removed) |
| `R` | Rotate furniture 90° (Shift reverses) |
| Arrow keys | Nudge 10 mm (Shift: 100 mm) |
| `⌘/Ctrl + D` | Duplicate |
| `⌘/Ctrl + Z` / `⌘/Ctrl + Shift + Z` | Undo / redo |
| `T` | Toggle 2D / 3D |
| `F` | Fit plan to window |
| `Esc` | Deselect |

## Storage & privacy

Plans persist to `localStorage` under the key `floorplan-studio` (the earlier `pub-floorplan-v1` key, whose saved names were Chinese, is intentionally ignored). Nothing leaves the browser; JSON export/import is the way to move a design between devices.

## Browser support

Rendering uses WebGPU where available and falls back to WebGL2 automatically. The Playwright config launches Chromium with `--enable-unsafe-webgpu`; serial workers + retries keep GPU-heavy pages stable headless.

## Credits

This project is a ground-up rewrite inspired by and built with reference to [floorplan-3d](https://github.com/wy51ai/floorplan-3d) — its 2D plan editing model (mm domain, wall/door/window representation, wall-demolition rules) and the 2D↔3D interaction flow shaped the design of this codebase. Huge thanks to the original author for sharing the work publicly; this repository stands on its shoulders.

Differences from the original: the rendering layer is rebuilt on the `@ptahjs/tri-3d` kernel (three/webgpu) with a plugin architecture, the state layer is a Vue-reactive store with snapshot undo, the UI is fully redesigned with English copy throughout, and the marketing site, i18n layer and e2e suite are new.
