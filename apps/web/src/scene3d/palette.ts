/** Light-theme tokens (docs/design/tokens.md) plus scenery colours used only by the 3D view. */
export const C = {
  primary: '#157f3d',
  explore: '#0369a1',
  exploreSoft: '#e0f2fe',
  route: '#d47406',
  danger: '#dc2626',
  mapGround: '#eef5ef',
  border: '#d5e5d9',
  text: '#0f1f17',
  // Scenery (not UI tokens).
  sky: '#e8f3f8',
  ocean: '#bcdcea',
  groundSide: '#c9dccd',
  outside: '#e2ebe4',
  stateLine: '#a9c4b0',
  asphalt: '#4b5563',
  asphaltLot: '#5b6472',
  paint: '#f8fafc',
  rock: '#8b9a8f',
  snow: '#ffffff',
  pine: '#2f7a4a',
  pineDark: '#22603a',
  trunk: '#7c5a3a',
  building: '#f1f5f2',
  buildingAlt: '#dfe9e2',
  glass: '#1e3a5f',
} as const;

/**
 * One body colour per car, cycled by `seq`. Saturated enough to read on the pale ground, none of
 * them the route orange or danger red so state colours stay unambiguous.
 */
export const CAR_COLORS = [
  '#157f3d',
  '#0369a1',
  '#7c3aed',
  '#0f766e',
  '#2563eb',
  '#be185d',
  '#4d7c0f',
  '#334155',
] as const;
