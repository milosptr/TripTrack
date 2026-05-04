import { describe, expect, it } from 'vitest';
import { computeTripStats, formatDuration } from '../src/lib/stats';
import type { Point } from '../src/lib/types';

const baseT = new Date('2026-05-06T08:00:00+02:00').getTime();

const mkPoint = (over: Partial<Point>): Point => ({
  id: 0,
  tripId: 't',
  lat: 0,
  lng: 0,
  speed: 0,
  altitude: 0,
  accuracy: 5,
  timestamp: baseT,
  ...over,
});

describe('computeTripStats', () => {
  it('returns zeros for empty input', () => {
    const s = computeTripStats([]);
    expect(s.pointCount).toBe(0);
    expect(s.distanceM).toBe(0);
    expect(s.totalTimeS).toBe(0);
    expect(s.movingTimeS).toBe(0);
    expect(s.pausedTimeS).toBe(0);
    expect(s.overallAvgMps).toBe(0);
    expect(s.movingAvgMps).toBe(0);
    expect(s.elevationGainM).toBe(0);
    expect(s.maxSpeedMps).toBe(0);
  });

  it('returns zeros when given a single point (no deltas)', () => {
    const s = computeTripStats([mkPoint({ speed: 5, altitude: 100 })]);
    expect(s.pointCount).toBe(1);
    expect(s.distanceM).toBe(0);
    expect(s.totalTimeS).toBe(0);
    expect(s.movingTimeS).toBe(0);
    expect(s.maxSpeedMps).toBe(5);
    expect(s.overallAvgMps).toBe(0);
    expect(s.movingAvgMps).toBe(0);
  });

  it('counts only positive altitude deltas as elevation gain', () => {
    const ps = [
      mkPoint({ altitude: 100, timestamp: baseT, lat: 46, lng: 14 }),
      mkPoint({ altitude: 120, timestamp: baseT + 1_000, lat: 46.001, lng: 14 }),
      mkPoint({ altitude: 90, timestamp: baseT + 2_000, lat: 46.002, lng: 14 }),
      mkPoint({ altitude: 150, timestamp: baseT + 3_000, lat: 46.003, lng: 14 }),
    ];
    const s = computeTripStats(ps);
    // +20 from 100→120, +60 from 90→150 = 80
    expect(s.elevationGainM).toBe(80);
  });

  it('separates moving vs paused time using rolling window', () => {
    // First 30s: stopped (speed 0). Next 60s: driving (speed 10 m/s).
    const ps: Point[] = [];
    let lat = 46;
    for (let t = 0; t <= 30; t += 5) {
      ps.push(mkPoint({ lat, lng: 14, speed: 0, timestamp: baseT + t * 1000 }));
    }
    for (let t = 35; t <= 90; t += 5) {
      lat += 0.0005;
      ps.push(mkPoint({ lat, lng: 14, speed: 10, timestamp: baseT + t * 1000 }));
    }
    const s = computeTripStats(ps);
    expect(s.totalTimeS).toBe(90);
    expect(s.pausedTimeS).toBeGreaterThan(0);
    expect(s.movingTimeS).toBeGreaterThan(0);
    // total = moving + paused (within rounding)
    expect(s.movingTimeS + s.pausedTimeS).toBeCloseTo(s.totalTimeS, 6);
    // most of the second half should be moving
    expect(s.movingTimeS).toBeGreaterThan(40);
    expect(s.maxSpeedMps).toBe(10);
  });

  it('overallAvg uses total time, movingAvg uses moving time', () => {
    // Constant 10 m/s, 100s, all moving.
    const ps: Point[] = [];
    let lat = 46;
    for (let t = 0; t <= 100; t += 5) {
      lat += 0.0005;
      ps.push(mkPoint({ lat, lng: 14, speed: 10, timestamp: baseT + t * 1000 }));
    }
    const s = computeTripStats(ps);
    expect(s.movingAvgMps).toBeCloseTo(s.overallAvgMps, 4);
    expect(s.pausedTimeS).toBe(0);
  });

  it('returns 0 for movingAvg when all points are stationary', () => {
    const ps: Point[] = [];
    for (let t = 0; t <= 60; t += 5) {
      ps.push(mkPoint({ lat: 46, lng: 14, speed: 0, timestamp: baseT + t * 1000 }));
    }
    const s = computeTripStats(ps);
    expect(s.movingTimeS).toBe(0);
    expect(s.movingAvgMps).toBe(0);
    expect(s.distanceM).toBe(0);
    expect(s.overallAvgMps).toBe(0);
  });

  it('treats -1 readings as 0 for pause averaging but not for max speed', () => {
    const ps: Point[] = [
      mkPoint({ lat: 46, lng: 14, speed: -1, timestamp: baseT }),
      mkPoint({ lat: 46.0001, lng: 14, speed: -1, timestamp: baseT + 5_000 }),
      mkPoint({ lat: 46.0002, lng: 14, speed: -1, timestamp: baseT + 10_000 }),
    ];
    const s = computeTripStats(ps);
    expect(s.maxSpeedMps).toBe(0); // -1 is never > 0
    // All-zero speed window → all paused, no moving.
    expect(s.movingTimeS).toBe(0);
    expect(s.pausedTimeS).toBeGreaterThan(0);
  });

  it('ignores zero-dt duplicates when accumulating moving/paused time', () => {
    const ps: Point[] = [
      mkPoint({ lat: 46, lng: 14, speed: 10, timestamp: baseT }),
      mkPoint({ lat: 46, lng: 14, speed: 10, timestamp: baseT }),
      mkPoint({ lat: 46.0005, lng: 14, speed: 10, timestamp: baseT + 5_000 }),
    ];
    const s = computeTripStats(ps);
    expect(s.totalTimeS).toBe(5);
    expect(s.movingTimeS + s.pausedTimeS).toBe(5);
  });

  it('updates max speed from the very first point even with no second point', () => {
    const s = computeTripStats([mkPoint({ speed: 33 })]);
    expect(s.maxSpeedMps).toBe(33);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65, '1:05'],
    [3600, '1:00:00'],
    [3661, '1:01:01'],
    [-100, '0:00'],
  ])('formats %d seconds as %s', (sec, expected) => {
    expect(formatDuration(sec)).toBe(expected);
  });
});
