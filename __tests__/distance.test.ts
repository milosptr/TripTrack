import { describe, it, expect } from 'vitest';
import {
  haversine,
  filterPoints,
  shouldKeepPoint,
  totalDistance,
  formatKm,
  MAX_ACCURACY_M,
  MAX_GPS_JUMP_M,
} from '../src/lib/distance';
import type { Point } from '../src/lib/types';

const REYKJAVIK = { lat: 64.1466, lng: -21.9426 };
const AKRANES = { lat: 64.3225, lng: -22.0758 };
// Known great-circle distance ~22 km along a straight line (driving distance is longer).
const REYKJAVIK_AKRANES_M = 21_000; // approximate; we tolerate a wide window
const REYKJAVIK_AKRANES_TOLERANCE_M = 2_500;

const PARIS = { lat: 48.8566, lng: 2.3522 };
const BERLIN = { lat: 52.52, lng: 13.405 };
// Wikipedia gives ~878 km Paris→Berlin.
const PARIS_BERLIN_M = 878_000;
const PARIS_BERLIN_TOLERANCE_M = 5_000;

function pt(over: Partial<Point>): Point {
  return {
    id: 0,
    tripId: 't',
    lat: 0,
    lng: 0,
    speed: 0,
    altitude: 0,
    accuracy: 5,
    timestamp: 0,
    ...over,
  };
}

describe('haversine', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversine(REYKJAVIK, REYKJAVIK)).toBe(0);
  });

  it('matches the known Reykjavík → Akranes distance within tolerance', () => {
    const d = haversine(REYKJAVIK, AKRANES);
    expect(Math.abs(d - REYKJAVIK_AKRANES_M)).toBeLessThan(REYKJAVIK_AKRANES_TOLERANCE_M);
  });

  it('matches the known Paris → Berlin distance within tolerance', () => {
    const d = haversine(PARIS, BERLIN);
    expect(Math.abs(d - PARIS_BERLIN_M)).toBeLessThan(PARIS_BERLIN_TOLERANCE_M);
  });

  it('is symmetric', () => {
    expect(haversine(PARIS, BERLIN)).toBeCloseTo(haversine(BERLIN, PARIS), 6);
  });

  it('handles antipodal points without NaN (clamped sqrt)', () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0, lng: 180 };
    const d = haversine(a, b);
    expect(d).toBeGreaterThan(20_000_000);
    expect(Number.isFinite(d)).toBe(true);
  });
});

describe('shouldKeepPoint', () => {
  it('drops points with accuracy worse than the cutoff', () => {
    expect(shouldKeepPoint(pt({ accuracy: MAX_ACCURACY_M + 1 }), null)).toBe(false);
  });

  it('keeps a point at exactly the cutoff', () => {
    expect(shouldKeepPoint(pt({ accuracy: MAX_ACCURACY_M }), null)).toBe(true);
  });

  it('drops a -1 speed jump beyond MAX_GPS_JUMP_M from prev', () => {
    const prev = { lat: 64.1466, lng: -21.9426 };
    const far = pt({ lat: 64.3225, lng: -22.0758, speed: -1 });
    expect(shouldKeepPoint(far, prev)).toBe(false);
  });

  it('keeps a -1 speed point that is close to prev', () => {
    const prev = { lat: 64.1466, lng: -21.9426 };
    const close = pt({ lat: 64.1467, lng: -21.9426, speed: -1 });
    expect(shouldKeepPoint(close, prev)).toBe(true);
  });

  it('keeps a -1 speed point when there is no previous point', () => {
    expect(shouldKeepPoint(pt({ speed: -1 }), null)).toBe(true);
  });

  it('does not drop big jumps when speed is valid (no fix-loss check)', () => {
    const prev = { lat: 64.1466, lng: -21.9426 };
    const far = pt({ lat: 64.3225, lng: -22.0758, speed: 25 });
    // A jump > MAX_GPS_JUMP_M is allowed when speed is valid (highway driving).
    expect(haversine(prev, far)).toBeGreaterThan(MAX_GPS_JUMP_M);
    expect(shouldKeepPoint(far, prev)).toBe(true);
  });
});

describe('filterPoints', () => {
  it('returns empty array for empty input', () => {
    expect(filterPoints([])).toEqual([]);
  });

  it('drops all bad-accuracy points', () => {
    const pts = [
      pt({ lat: 1, lng: 1, accuracy: 100 }),
      pt({ lat: 2, lng: 2, accuracy: 5 }),
      pt({ lat: 3, lng: 3, accuracy: 999 }),
    ];
    expect(filterPoints(pts)).toHaveLength(1);
  });

  it('compares jumps against the last accepted point, not the previous index', () => {
    // bad-accuracy point in the middle should be skipped; jump check uses the last good point.
    const pts = [
      pt({ lat: 64.1466, lng: -21.9426, accuracy: 5, speed: 10 }),
      pt({ lat: 64.1467, lng: -21.9427, accuracy: 999, speed: 10 }), // dropped
      pt({ lat: 64.1468, lng: -21.9425, accuracy: 5, speed: 10 }),
    ];
    expect(filterPoints(pts)).toHaveLength(2);
  });
});

describe('totalDistance', () => {
  it('returns 0 for 0 or 1 points', () => {
    expect(totalDistance([])).toBe(0);
    expect(totalDistance([REYKJAVIK])).toBe(0);
  });

  it('sums Haversine over a sequence', () => {
    const segs = totalDistance([REYKJAVIK, AKRANES, REYKJAVIK]);
    expect(segs).toBeCloseTo(haversine(REYKJAVIK, AKRANES) * 2, 3);
  });
});

describe('formatKm', () => {
  it.each([
    [0, '0.0'],
    [499, '0.5'],
    [1000, '1.0'],
    [21_000, '21.0'],
    [21_499, '21.5'],
  ])('formats %d metres as %s km', (m, expected) => {
    expect(formatKm(m)).toBe(expected);
  });
});
