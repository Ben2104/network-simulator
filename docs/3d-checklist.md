# 3D view — manual checklist

Run before a demo or after touching `apps/web/src/scene3d/`. WebGL output is not pixel-tested in
CI; the automated part is `npm run test:e2e -w @netsim/web` (canvas mounts and is non-blank,
camera release on drag, no-WebGL fallback).

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
- [ ] With "reduce motion" on in the OS, the app opens in 2D; 3D is still selectable.
- [ ] Frame rate stays smooth (≥ 50 fps) with 24 cars on a laptop (DevTools → Performance).
