export interface RouteEntry {
  destination: string;
  duration: number;
  distance: number;
}

/** Fastest first; if two routes take equally long, the one with short distance wins. */
export function sortRoutes(routes: readonly RouteEntry[]): RouteEntry[] {
  return [...routes].sort((a, b) => a.duration - b.duration || a.distance - b.distance);
}