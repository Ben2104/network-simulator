# Design tokens — Light theme (white + green)

Source of truth for the Figma `Color` variable collection (single mode `Light`) and the CSS custom
properties. Spec: `docs/superpowers/specs/2026-10-20-light-theme-team-kickoff-design.md` §2.

## 1. Tokens (final hex)

| Token           | Hex       | Changed from spec | Use                                      |
| --------------- | --------- | ----------------- | ---------------------------------------- |
| `bg`            | `#FFFFFF` |                   | page background                          |
| `surface`       | `#F5FAF6` |                   | cards, panels                            |
| `surface-2`     | `#EAF4EC` |                   | insets, table rows, chips                |
| `border`        | `#D5E5D9` |                   | card and input borders                   |
| `text`          | `#0F1F17` |                   | body text                                |
| `text-muted`    | `#4A5D51` |                   | secondary text                           |
| `primary`       | `#157F3D` | was `#15803D`     | brand, primary buttons, success (+ icon) |
| `primary-hover` | `#166534` |                   | hover / pressed                          |
| `primary-soft`  | `#DCFCE7` |                   | badges, selected toggles                 |
| `on-primary`    | `#FFFFFF` |                   | text on `primary`                        |
| `explore`       | `#0369A1` |                   | BFS frontier, visited stations           |
| `explore-soft`  | `#E0F2FE` |                   | frontier chips, search rings fill        |
| `route`         | `#D47406` | was `#D97706`     | chosen path line (≥ 4 px, with outline)  |
| `route-text`    | `#92400E` |                   | route text, route badges                 |
| `route-soft`    | `#FEF3C7` |                   | route chip background                    |
| `danger`        | `#DC2626` |                   | broken station / road marks              |
| `danger-text`   | `#991B1B` |                   | error text                               |
| `danger-soft`   | `#FEE2E2` |                   | error banner background                  |
| `map-ground`    | `#EEF5EF` |                   | 3D ground plane / 2D map background      |
| `focus`         | `#157F3D` | was `#15803D`     | 2 px focus ring, 2 px offset (= primary) |

`focus` follows `primary` (`#157F3D`) so there is a single green. Figma `Color` holds exactly the hex
in this table; the CSS custom properties must match it.

### Hex changes and why

- `primary` `#15803D` → `#157F3D`: `primary` as text on `surface-2` was 4.45:1 (< 4.5). Now 4.51:1.
- `route` `#D97706` → `#D47406`: route line on `map-ground` was 2.87:1 (< 3:1 UI mark). Now 3.01:1.
  Margin is thin; keep the white 11 px outline under the line.

### Type styles

Inter for all UI (Title/20, Heading/16, Body/14, Body-strong/14, Caption/12, Label/12). JetBrains Mono
only for IDs, byte counts and the BFS trace (Mono/12, Mono-strong/12).

## 2. Contrast results (WCAG 2.x, computed)

Text pairs need 4.5:1. UI marks need 3:1.

| Pair                              | Ratio   | Needed | Result |
| --------------------------------- | ------- | ------ | ------ |
| `text` on `bg`                    | 17.09:1 | 4.5:1  | PASS   |
| `text` on `surface`               | 16.19:1 | 4.5:1  | PASS   |
| `text` on `surface-2`             | 15.18:1 | 4.5:1  | PASS   |
| `text` on `map-ground`            | 15.42:1 | 4.5:1  | PASS   |
| `text` on `primary-soft`          | 15.56:1 | 4.5:1  | PASS   |
| `text-muted` on `bg`              | 7.06:1  | 4.5:1  | PASS   |
| `text-muted` on `surface`         | 6.68:1  | 4.5:1  | PASS   |
| `text-muted` on `surface-2`       | 6.27:1  | 4.5:1  | PASS   |
| `text-muted` on `map-ground`      | 6.37:1  | 4.5:1  | PASS   |
| `on-primary` on `primary`         | 5.08:1  | 4.5:1  | PASS   |
| `on-primary` on `primary-hover`   | 7.13:1  | 4.5:1  | PASS   |
| `primary` on `bg`                 | 5.08:1  | 4.5:1  | PASS   |
| `primary` on `surface`            | 4.81:1  | 4.5:1  | PASS   |
| `primary` on `surface-2`          | 4.51:1  | 4.5:1  | PASS   |
| `primary` on `primary-soft`       | 4.62:1  | 4.5:1  | PASS   |
| `primary-hover` on `primary-soft` | 6.49:1  | 4.5:1  | PASS   |
| `explore` on `bg`                 | 5.93:1  | 4.5:1  | PASS   |
| `explore` on `explore-soft`       | 5.17:1  | 4.5:1  | PASS   |
| `route-text` on `bg`              | 7.09:1  | 4.5:1  | PASS   |
| `route-text` on `route-soft`      | 6.37:1  | 4.5:1  | PASS   |
| `danger-text` on `bg`             | 8.31:1  | 4.5:1  | PASS   |
| `danger-text` on `danger-soft`    | 6.80:1  | 4.5:1  | PASS   |
| `route` on `bg` (line)            | 3.33:1  | 3:1    | PASS   |
| `route` on `map-ground` (line)    | 3.01:1  | 3:1    | PASS   |
| `danger` on `bg` (mark)           | 4.83:1  | 3:1    | PASS   |
| `danger` on `danger-soft`         | 3.95:1  | 3:1    | PASS   |
| `danger` on `map-ground`          | 4.36:1  | 3:1    | PASS   |
| `primary` on `surface` (mark)     | 4.81:1  | 3:1    | PASS   |
| `primary` on `map-ground`         | 4.58:1  | 3:1    | PASS   |

Known gap: `border` `#D5E5D9` on `bg` is 1.31:1. It is decorative only (card edges). Every control
that needs a visible boundary must use `text-muted` (switch outline) or fill contrast instead.
Disabled controls (`text-muted` on `surface-2`) pass 6.27:1 on their own, so disabled state is
conveyed by fill + lock icon + text, not by low contrast.

## 3. Figma

File: https://www.figma.com/design/u4ACay8xnM4DS6dyovzf47/network-simulator

| Item                                        | Node ID | Link                                                                                |
| ------------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| Page `v2 Light`                             | `4:827` | https://www.figma.com/design/u4ACay8xnM4DS6dyovzf47/network-simulator?node-id=4-827 |
| Frame `v2 · Broken Station (between sends)` | `4:31`  | https://www.figma.com/design/u4ACay8xnM4DS6dyovzf47/network-simulator?node-id=4-31  |
| Frame `v2 · Driving`                        | `4:390` | https://www.figma.com/design/u4ACay8xnM4DS6dyovzf47/network-simulator?node-id=4-390 |
| Variable collection `Color`                 | `4:2`   | (Local variables panel)                                                             |
| Component `Header` (shared)                 | `5:2`   | https://www.figma.com/design/u4ACay8xnM4DS6dyovzf47/network-simulator?node-id=5-2   |
| Component `File card` (shared)              | `5:34`  | https://www.figma.com/design/u4ACay8xnM4DS6dyovzf47/network-simulator?node-id=5-34  |
| Component `Map legend` (shared)             | `5:51`  | https://www.figma.com/design/u4ACay8xnM4DS6dyovzf47/network-simulator?node-id=5-51  |
| Map, Broken frame                           | `8:2`   | https://www.figma.com/design/u4ACay8xnM4DS6dyovzf47/network-simulator?node-id=8-2   |
| Map, Driving frame                          | `8:152` | https://www.figma.com/design/u4ACay8xnM4DS6dyovzf47/network-simulator?node-id=8-152 |

Page 1 (`0:1`, dark Stitch originals `1:2` and `1:361`) is untouched.

Both frames are 1280×960. Layout: header 64 px, state banner 44 px, map 864×804 (left), right column
384 px (File card → Send & Playback → Route (BFS) → Network Status), status bar 48 px. Network Status
ends at y=858 (Driving) / y=888 (Broken), above the 912 px status bar and the fold.

Audit (scripted): 0 unbound solid fills or strokes in both frames and the 3 shared components.
Fonts used: Inter (Regular, Medium, Semi Bold), JetBrains Mono Regular.

## 4. What changed per frame (spec §3 corrections)

Both frames:

- #7 Removed invented metrics (egress, integrity, latency, throughput, velocity, step N/82,
  auto-heal, diagnostic log). Only real facts remain: 1,048,576 B, 700 packets, 24 cars, hop count.
- #8 Map fills the left canvas (864×804). Right column reflows; Network Status is above the fold.
- #9 Screen-aligned labels with collision-checked placement, no rotated iso text. Camera chip, zoom
  controls and compass are overlays in reserved zones.
- #10 One shared `Header`, `File card` and `Map legend` (component instances in both frames).
  "Illustrative network — not real internet routing" label kept in the header.
- #3 FIFO "Queue (FIFO, in visit order)" chips replace "Priority Queue" and Q1/Q2 badges.
  Chips are real BFS visit order (neighbours sorted by ID, as in the plan-1 tests).
- #4 "9 hops" badge plus "BFS = fewest hops, not shortest distance."
- #5 Destination is "US-West Data Center, Oregon" (parking lot). Sender is "CSULB parking lot".
- #6 Real topology from `docs/architecture.md` (19 stations, 24 roads), no invented route.
- Every state uses icon + text: Offline (x icon), Online (check icon), Locked (lock icon).

`v2 · Broken Station (between sends)` (`4:31`):

- #1 Between-sends state: 24 cars parked in the CSULB lot, destination lot empty, no halted cars.
- Oakland offline (x icon, "Oakland — offline" label, dashed `danger` roads). BFS recomputed:
  `csulb → lb-isp → la-wilshire → bakersfield → fresno → sacramento → reno → klamath-falls → bend →
oregon-dc` (9 hops). Banner says so in text.
- Failure switches enabled, hint "Toggle failures only between sends."; Send enabled, Pause/Reset disabled.

`v2 · Driving` (`4:390`):

- #6 Default route from `docs/architecture.md`:
  `csulb → el-segundo → slo → san-jose → oakland → redding → medford → eugene → bend → oregon-dc`
  (9 hops). All 19 stations visited (explore ring), 12 cars on the road, 6 in each lot.
- #2 Network controls (both switches) disabled, with "Locked while sending" (lock icon). Send shows
  "Sending…" disabled; Pause/Reset enabled.

## 5. Liberties and open issues

- Map is a schematic, not true geography: equirectangular at cos 39.5°, rotated 68° clockwise so it
  fills the canvas, and the four Los Angeles stations are spread ×9 so they do not collapse into one
  point. The compass shows the rotated north. The "Illustrative network" label covers this.
- Los Angeles cluster (Long Beach ISP, Riverside, One Wilshire, CSULB lot) is still dense. Labels do
  not overlap each other but a few sit over road lines.
- Queue chips show the first 8 stations plus "+N more"; the full 19/18-station order is not drawn.
- Legend swatches are shared, so "Visited by BFS" appears in the Broken frame where nothing is visited.
- 2D view, idle, loaded, searching, delivered, no route, error and mobile states are not drawn
  (separate issue).
