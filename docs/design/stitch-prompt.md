# Stitch UI prompt

Paste into Google Stitch to generate layout and state mockups. Stitch produces flat UI, so treat
the map as a placeholder illustration; the real scene is built in React Three Fiber.

```
Design a web app called "Packet Highway — Network Route Simulator", an educational tool that
shows how a file travels across a network. Light theme (white + green), modern, presentation-ready, high
contrast for projectors. Desktop first (1440px) plus a mobile layout (390px).

CONCEPT: A 3D low-poly map of the US West Coast (California, Oregon) seen from a tilted
top-down camera. The sender is a parking lot at "CSULB, Long Beach". The destination is a
parking lot at "US-West Data Center, Oregon". Between them are ~20 "stations" (routers) in
real cities (Los Angeles, Bakersfield, San Luis Obispo, Fresno, San Jose, Oakland, Sacramento,
Reno, Redding, Medford, Eugene, Portland) connected by glowing curved roads. A file is split
into small colorful 3D cars (packets) that drive along the chosen route.
Small persistent label: "Illustrative network — not real internet routing".

MAIN SCREEN LAYOUT (desktop):
- Top bar: app name, a 3D / 2D view toggle, a "Guided demo" button, a help icon.
- Center (70% width): the 3D map scene, the hero of the page.
- Right sidebar (30%), stacked cards:
  1. "Your file" card: drag-and-drop file zone OR a short text message input (140 chars,
     with counter), and a primary "Submit" button. After submit, show a summary:
     "essay.pdf · 1.0 MB → 700 packets → 24 cars" with small car icons.
  2. "Send" card: large primary "Send" button (disabled until a file is submitted),
     playback controls (pause/resume, speed 0.5x/1x/2x, skip search).
  3. "BFS search" card: current queue as chips, numbered visit list with hop depth
     ("Depth 2 · Sacramento"), final route as a breadcrumb (CSULB → LA → ... → Oregon),
     hop count.
  4. "Network status" card: list of broken stations/roads with "Restore" buttons and a
     "Reset network" secondary button.
- Bottom status banner: progress "18 / 24 cars arrived" with a progress bar.

STATES TO DESIGN (separate frames):
1. Idle: empty map, file card prompting to choose a file.
2. Loaded: 24 cars parked in the CSULB lot, Send enabled.
3. Searching: stations lighting up in expanding rings (blue glow) in BFS order, the BFS card
   updating.
4. Driving: chosen route highlighted amber, other roads dimmed, cars in motion along the route.
5. Delivered: cars parked in the Oregon lot, success banner "Delivered via 9 hops".
6. Broken station: one station red with a warning icon and crossed-out roads; a tooltip
   "Sacramento — offline. Click to restore."
7. No route: red banner "No route available — BFS explored 14 stations", cars still in
   CSULB lot.
8. Error: API unreachable toast with "Retry".
9. 2D view: same layout but the map is a flat 2D node graph with cars as dots.

MOBILE: map on top (60% height), sidebar cards become a bottom sheet with tabs
(File / Send / BFS / Network).

VISUAL STYLE: light theme, white page background (#ffffff), cards in pale green (#f5faf6)
with soft green-gray borders (#d5e5d9), dark green-black text (#0f1f17). Brand green (#15803d)
for primary buttons and "delivered", always with a check icon; blue (#0369a1) for exploration,
amber (#d97706, text #92400e) for the chosen route, red (#dc2626, text #991b1b) for broken. Map
ground is a very light green (#eef5ef). White text only on dark green. Rounded 12px cards,
Inter font, clear labels, generous spacing, visible 2px green keyboard focus rings, never use
color alone (add icons and text). Gold is not used.
Legend in the map corner: parking lot, station, road, car, broken.
```
