/**
 * Equirectangular projection for the West Coast map, shared by the 2D (SVG) and 3D views so
 * both place nodes identically. Distortion is negligible at this scale.
 * Output: x grows east, y grows south. In 3D use x → x and y → z.
 */
export const MAP_BOUNDS = { minLat: 32.5, maxLat: 46.5, minLon: -125, maxLon: -116 } as const;

const midLatRad = (((MAP_BOUNDS.minLat + MAP_BOUNDS.maxLat) / 2) * Math.PI) / 180;
const lonScale = Math.cos(midLatRad);

export const MAP_WIDTH = 600;
const unitsPerDegree = MAP_WIDTH / ((MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon) * lonScale);
export const MAP_HEIGHT = (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat) * unitsPerDegree;

export function project(lat: number, lon: number): { x: number; y: number } {
  return {
    x: (lon - MAP_BOUNDS.minLon) * lonScale * unitsPerDegree,
    y: (MAP_BOUNDS.maxLat - lat) * unitsPerDegree,
  };
}
