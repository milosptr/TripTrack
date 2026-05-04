import type { Point } from './types';

const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;

/** Maximum acceptable horizontal accuracy in metres. Points worse than this are dropped. */
export const MAX_ACCURACY_M = 50;

/** When speed === -1 (no fix), drop the point if it jumped more than this from the previous one. */
export const MAX_GPS_JUMP_M = 200;

type Coord = { lat: number; lng: number };

/**
 * Great-circle distance between two coordinates in metres, via the Haversine formula.
 */
export function haversine(a: Coord, b: Coord): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Decide whether a candidate point should be kept, given the previous accepted point.
 * Rules (from spec):
 *   - Drop if accuracy > 50m
 *   - Drop "GPS jumps": speed === -1 AND distance from previous > 200m
 *   - First point of a trip: keep iff accuracy is acceptable.
 */
export function shouldKeepPoint<T extends Pick<Point, 'lat' | 'lng' | 'speed' | 'accuracy'>>(
  candidate: T,
  prev: Pick<Point, 'lat' | 'lng'> | null,
): boolean {
  if (candidate.accuracy > MAX_ACCURACY_M) return false;
  if (prev !== null && candidate.speed === -1) {
    const d = haversine(prev, candidate);
    if (d > MAX_GPS_JUMP_M) return false;
  }
  return true;
}

/**
 * Filter a list of points sequentially, dropping any that fail the keep rules.
 * The previous point in the comparison is the last *accepted* point, not the previous index.
 */
export function filterPoints<T extends Pick<Point, 'lat' | 'lng' | 'speed' | 'accuracy'>>(
  points: readonly T[],
): T[] {
  const out: T[] = [];
  let prev: Pick<Point, 'lat' | 'lng'> | null = null;
  for (const p of points) {
    if (shouldKeepPoint(p, prev)) {
      out.push(p);
      prev = { lat: p.lat, lng: p.lng };
    }
  }
  return out;
}

/**
 * Sum of distances along a polyline of points, in metres.
 * Returns 0 for fewer than 2 points.
 */
export function totalDistance(points: readonly Pick<Point, 'lat' | 'lng'>[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversine(points[i - 1], points[i]);
  }
  return total;
}

/** Convert metres to kilometres, formatted to one decimal place. */
export function formatKm(metres: number): string {
  return (metres / 1000).toFixed(1);
}
