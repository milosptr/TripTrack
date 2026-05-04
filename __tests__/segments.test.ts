import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DAY_COLORS, colorForDayIndex, dayKey, segmentByDay } from '../src/lib/segments';
import type { Point } from '../src/lib/types';

const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  // Italy/Slovenia is CEST in summer (UTC+2). Lock the test environment to it so
  // midnight-crossing assertions are deterministic.
  process.env.TZ = 'Europe/Ljubljana';
});

afterEach(() => {
  // Defensive in case a test mutates TZ later.
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
});

const pt = (lat: number, lng: number, isoLocal: string): Point => ({
  id: 0,
  tripId: 't',
  lat,
  lng,
  speed: 0,
  altitude: 0,
  accuracy: 5,
  timestamp: new Date(isoLocal).getTime(),
});

describe('dayKey', () => {
  it('formats local-day key in yyyy-MM-dd', () => {
    // 2026-05-06 12:00 CEST (UTC+2) → 10:00 UTC → local key still 2026-05-06.
    expect(dayKey(new Date('2026-05-06T12:00:00+02:00').getTime())).toBe('2026-05-06');
  });

  it('rolls over at local midnight, not UTC midnight', () => {
    // 23:30 local on May 6 → still May 6 in CEST, even though UTC is May 6 21:30.
    expect(dayKey(new Date('2026-05-06T23:30:00+02:00').getTime())).toBe('2026-05-06');
    // 00:30 local on May 7 → May 7 even though UTC is May 6 22:30.
    expect(dayKey(new Date('2026-05-07T00:30:00+02:00').getTime())).toBe('2026-05-07');
  });
});

describe('segmentByDay', () => {
  it('returns empty array for no points', () => {
    expect(segmentByDay([])).toEqual([]);
  });

  it('groups a single-day trip into one segment', () => {
    const pts = [
      pt(46.05, 14.5, '2026-05-06T08:00:00+02:00'),
      pt(46.06, 14.51, '2026-05-06T08:05:00+02:00'),
    ];
    const segs = segmentByDay(pts);
    expect(segs).toHaveLength(1);
    expect(segs[0]?.day).toBe('2026-05-06');
    expect(segs[0]?.points).toHaveLength(2);
    expect(segs[0]?.color).toBe(DAY_COLORS[0]);
  });

  it('splits a midnight crossing into two segments', () => {
    const pts = [
      pt(46.05, 14.5, '2026-05-06T23:55:00+02:00'),
      pt(46.06, 14.51, '2026-05-07T00:05:00+02:00'),
    ];
    const segs = segmentByDay(pts);
    expect(segs).toHaveLength(2);
    expect(segs[0]?.day).toBe('2026-05-06');
    expect(segs[1]?.day).toBe('2026-05-07');
  });

  it('assigns colors in DAY_COLORS order across consecutive days', () => {
    const pts: Point[] = [];
    for (let i = 0; i < DAY_COLORS.length + 2; i++) {
      const day = String(6 + i).padStart(2, '0');
      pts.push(pt(46.05, 14.5, `2026-05-${day}T12:00:00+02:00`));
    }
    const segs = segmentByDay(pts);
    expect(segs).toHaveLength(DAY_COLORS.length + 2);
    segs.forEach((s, i) => {
      expect(s.color).toBe(DAY_COLORS[i % DAY_COLORS.length]);
    });
  });

  it('sorts days chronologically even if points are out of order', () => {
    const pts = [
      pt(46.05, 14.5, '2026-05-08T12:00:00+02:00'),
      pt(46.06, 14.51, '2026-05-06T12:00:00+02:00'),
      pt(46.07, 14.52, '2026-05-07T12:00:00+02:00'),
    ];
    const segs = segmentByDay(pts);
    expect(segs.map((s) => s.day)).toEqual(['2026-05-06', '2026-05-07', '2026-05-08']);
  });

  it('computes a per-day distance in metres', () => {
    const pts = [
      pt(46.05, 14.5, '2026-05-06T08:00:00+02:00'),
      pt(46.06, 14.5, '2026-05-06T08:05:00+02:00'),
      pt(46.07, 14.5, '2026-05-07T08:00:00+02:00'),
      pt(46.08, 14.5, '2026-05-07T08:05:00+02:00'),
    ];
    const segs = segmentByDay(pts);
    expect(segs).toHaveLength(2);
    expect(segs[0]?.distanceM).toBeGreaterThan(0);
    expect(segs[1]?.distanceM).toBeGreaterThan(0);
  });
});

describe('colorForDayIndex', () => {
  it('returns colors at successive indices', () => {
    DAY_COLORS.forEach((c, i) => expect(colorForDayIndex(i)).toBe(c));
  });

  it('cycles when index exceeds the palette length', () => {
    expect(colorForDayIndex(DAY_COLORS.length)).toBe(DAY_COLORS[0]);
    expect(colorForDayIndex(DAY_COLORS.length * 2 + 3)).toBe(DAY_COLORS[3]);
  });
});
