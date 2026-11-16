# 3D view — manual checklist

Run before a demo or after touching `apps/web/src/scene3d/`. WebGL output is not pixel-tested in
CI; the automated part is `npm run test:e2e -w @netsim/web` (canvas mounts and is non-blank,
camera release on drag, no-WebGL fallback, Kenney models load, primitive fallback when they 404).

Setup: `npm run dev`, open http://localhost:5173 in Chrome, Firefox and Safari (one laptop
without a discrete GPU).

## Load and idle

- [ ] The 3D map loads; the overview shows CA, OR, WA, NV and ID with all 27 stations.
- [ ] Ocean, state borders, peaks and forest render; no z-fighting flicker on roads or lots.
- [ ] Labels never overlap; zooming into Los Angeles reveals the hidden ones.
- [ ] "Sender: CSULB parking lot" and "Destination: US-West Data Center, Oregon" are visible.
- [ ] Drag orbits, right-drag pans, scroll zooms; the camera cannot go under the ground.

## Submit → Send

- [ ] Submit (Presets → essay.pdf): Auto camera flies to the CSULB lot; 24 coloured cars parked.
- [ ] Cars are the Kenney sedan, each painted its own colour; station towns are Kenney houses.
- [ ] Hovering a car shows its number, packet range and bytes.
- [ ] Send: camera pulls back; stations light blue in BFS order with an expanding ring and
      "BFS depth N"; the sidebar queue advances in step.
- [ ] Driving: the chosen route glows orange; cars leave one after another and follow the
      roads (no cutting corners through towns); Auto camera chases the lead car.
- [ ] Overview during driving: floating beacons keep every car visible across the map.
- [ ] Delivered: all 24 cars parked in the Oregon lot; Auto camera shows the data center.
- [ ] Pause freezes cars and rings; Resume continues; 0.25× / 2× change speed smoothly.
- [ ] Switching to 2D view mid-drive and back shows the same phase and car counts.

## Route

- [ ] All 24 cars follow the highlighted route selected by BFS or Dijkstra. No random detours.
- [ ] BFS shows hops and no bandwidth/cost editor; Dijkstra additionally shows its cost and Mbps settings.
- [ ] Each route station lights a column in the route colour once the first car passes it, and
      every passing car fires a gold ring and a beacon flash.
- [ ] Cars carry a stalk-mounted beacon and, while driving, a pulsing ground halo.

## Camera

- [ ] Follow lead car chases the furthest car; any drag or scroll switches to "Free".
- [ ] Zoom + / − work; ⟲ returns to the overview.

## Fallbacks

- [ ] With WebGL disabled (`chrome --disable-3d-apis`), the app opens in 2D with
      "3D view needs WebGL…" and the 3D button disabled; no console errors.
- [ ] With `/models/` blocked (DevTools → Network → Block request URL `*/models/*`), stations and
      cars show the primitive shapes, cars still drive, and the console has only one warning per
      model file.
- [ ] With "reduce motion" on in the OS, the app opens in 2D; 3D is still selectable.
- [ ] Frame rate stays smooth (≥ 50 fps) with 24 cars on a laptop (DevTools → Performance).

- Fail a router between two groups: the lead keeps its position/timing, the trailing group retries
  from CSULB. Failing an already completed road does not affect the lead.
- Restore a preferred corridor mid-transfer: queued groups use the best sender route; moving
  groups change direction at their next router without jumping. No extra retry or timer reset.
- Orange segments disappear once the last active group clears them. Per-group completed/remaining
  hops and total completion time agree with the new plans.

## Depth / flicker regression

- Orbit and pan at near, overview and maximum zoom, including the lowest allowed angle: land
  stays above the sea without alternating blue strips or missing terrain wedges.
- After traffic passes, orange discs remain whole; search/pass rings stay readable over the ground.
- Idle/route/offline/preview roads remain continuous when far away. Up close, idle lane paint
  remains visible and cars/buildings still occlude road and halo overlays normally.
- Repeat with the Kenney models blocked to verify the primitive fallback as well.
