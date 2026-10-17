export interface Coordinate {
  /** The text exactly as the caller sent it. We echo this back in the response. */
  raw: string;
  lon: number;
  lat: number;
}

export interface RoutesRequest {
  source: Coordinate;
  destinations: Coordinate[];
}

/** Thrown when the caller's input is wrong. The HTTP layer turns it into a 400. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// Strict on purpose: two plain decimal numbers separated by one comma.
// No spaces, no "1e5", no extra parts.
const COORDINATE_PATTERN = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;

export function parseCoordinate(raw: unknown, paramName: string): Coordinate {
  if (typeof raw !== "string" || !COORDINATE_PATTERN.test(raw)) {
    throw new ValidationError(
      `${paramName} must look like "longitude,latitude", e.g. 13.388860,52.517037`,
    );
  }

  // Safe to assert: the pattern above guarantees exactly two numbers.
  const [lon, lat] = raw.split(",").map(Number) as [number, number];

  if (lon < -180 || lon > 180) {
    throw new ValidationError(`${paramName} longitude must be between -180 and 180`);
  }
  if (lat < -90 || lat > 90) {
    throw new ValidationError(`${paramName} latitude must be between -90 and 90`);
  }

  return { raw, lon, lat };
}

/** A query value can be missing, a single string, or a list (when repeated). */
function toList(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Keep the first occurrence of each distinct point, in the original order. */
function removeDuplicates(coordinates: Coordinate[]): Coordinate[] {
  const unique = new Map<string, Coordinate>();
  for (const coordinate of coordinates) {
    const key = `${coordinate.lon},${coordinate.lat}`;
    if (!unique.has(key)) unique.set(key, coordinate);
  }
  return [...unique.values()];
}

export function parseRoutesRequest(
  query: Record<string, unknown>,
  maxDestinations: number,
): RoutesRequest {
  const sources = toList(query.src);
  if (sources.length !== 1) {
    throw new ValidationError("Exactly one src is required");
  }

  const rawDestinations = toList(query.dst);
  if (rawDestinations.length === 0) {
    throw new ValidationError("At least one dst is required");
  }
  if (rawDestinations.length > maxDestinations) {
    throw new ValidationError(`At most ${maxDestinations} dst values are allowed`);
  }

  const source = parseCoordinate(sources[0], "src");
  const destinations = removeDuplicates(
    rawDestinations.map((value) => parseCoordinate(value, "dst")),
  );

  return { source, destinations };
}