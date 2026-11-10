# Assets

Third-party data and models used by the web app, with sources and licenses.

| Asset                                                       | Source                                                                                                                                                         | License       | Used in                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------- |
| State outlines (CA, OR, WA, NV, ID, AZ, UT, MT, WY, CO, NM) | [Natural Earth](https://www.naturalearthdata.com/) 1:50m Admin 1 – States, Provinces, via the [GitHub mirror](https://github.com/nvkelso/natural-earth-vector) | Public domain | `src/scene3d/westcoast.json` |
| Mexico outline                                              | Natural Earth 1:50m Admin 0 – Countries, same mirror                                                                                                           | Public domain | `src/scene3d/westcoast.json` |

`westcoast.json` is generated once by `node scripts/build-westcoast.mjs` (mapshaper: filter the
eleven US states and Mexico, clip to lon −127…−104 / lat 30…48, simplify to 40 %, 0.001°
precision) and committed. The script is not part of the build; rerun it only to change the
outline.

## 3D models

| Asset                                                       | Source                                                                       | License | Used in                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- | ------- | ------------------------------------------------ |
| `sedan.glb` + `Textures/colormap.png`                       | [Kenney Car Kit](https://kenney.nl/assets/car-kit) 3.1                       | CC0 1.0 | `public/models/car/`, `src/scene3d/Cars.tsx`     |
| `building-type-{a,c,f,h,k,n}.glb` + `Textures/colormap.png` | [Kenney City Kit (Suburban)](https://kenney.nl/assets/city-kit-suburban) 2.0 | CC0 1.0 | `public/models/city/`, `src/scene3d/Station.tsx` |

Copied unchanged from the kits' `Models/GLB format/` folders (the `.glb` files reference
`Textures/colormap.png` next to them). Kenney's license: "You can use this content for personal,
educational, and commercial purposes." Crediting Kenney (www.kenney.nl) is optional; we do.

`scene3d/models.tsx` loads each file once. Every model has its procedural primitive as a fallback,
shown while it loads and kept if the file is missing or broken, so the scene never depends on it.
Cars split the sedan into paint (tinted per car), trim and wheels and keep one drei `<Instances>`
per part. Station towns show the houses only within 220 units of the camera and the primitive
boxes further out, which keeps the overview (and software-rendered CI) as fast as before. Lots (campus, data center), station pads, roads and scenery (trees, shrubs, cacti, rocks,
peaks, lakes) are still procedural primitives in `src/scene3d/`.
