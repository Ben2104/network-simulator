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

All 3D models (cars, stations, towns, parking lots, campus building, data center, trees, shrubs,
cacti, rocks, peaks, lakes)
are procedural three.js primitives written in `src/scene3d/`; there are no model files.

Swapping in the Kenney Car Kit / City Kit (CC0) is tracked in #22. Model components keep their
props, so a glTF loader can replace the primitives behind `Cars`, `Station` and `ParkingLot`
without touching the scene. Record the kit name, version and download URL here when that lands.
