import { describe, expect, it } from 'vitest';
import { extractPauses, MIN_PAUSE_DURATION_S } from '../src/lib/pauses';
import type { Point } from '../src/lib/types';

const baseT = new Date('2026-05-06T08:00:00+02:00').getTime();

const mkPoint = (over: Partial<Point>): Point => ({
  id: 0,
  tripId: 't',
  lat: 46,
  lng: 14,
  speed: 0,
  altitude: 0,
  accuracy: 5,
  timestamp: baseT,
  ...over,
});

type FillOpts = {
  count: number;
  startT: number;
  intervalMs: number;
  speed: number;
  lat?: number;
  lng?: number;
  latStep?: number;
};

function fill(opts: FillOpts): Point[] {
  const out: Point[] = [];
  let lat = opts.lat ?? 46;
  const lng = opts.lng ?? 14;
  for (let i = 0; i < opts.count; i++) {
    out.push(
      mkPoint({
        lat,
        lng,
        speed: opts.speed,
        timestamp: opts.startT + i * opts.intervalMs,
      }),
    );
    if (opts.latStep) lat += opts.latStep;
  }
  return out;
}

describe('extractPauses', () => {
  it('returns [] for empty input', () => {
    expect(extractPauses([])).toEqual([]);
  });

  it('returns [] for single-point input', () => {
    expect(extractPauses([mkPoint({})])).toEqual([]);
  });

  it('returns [] when motion is constant (no paused window)', () => {
    const pts = fill({
      count: 21,
      startT: baseT,
      intervalMs: 5_000,
      speed: 10,
      latStep: 0.0005,
    });
    expect(extractPauses(pts)).toEqual([]);
  });

  it('drops pauses shorter than minDurationS', () => {
    // 60s drive → 60s stop → 60s drive. Stop interval is ~30s wall-time after the
    // rolling window fills, well below the 120s default.
    const drive1 = fill({
      count: 12,
      startT: baseT,
      intervalMs: 5_000,
      speed: 10,
      lat: 46.0,
      latStep: 0.0005,
    });
    const stop = fill({
      count: 13,
      startT: baseT + 60_000,
      intervalMs: 5_000,
      speed: 0,
      lat: 46.005,
    });
    const drive2 = fill({
      count: 12,
      startT: baseT + 125_000,
      intervalMs: 5_000,
      speed: 10,
      lat: 46.005,
      latStep: 0.0005,
    });
    expect(extractPauses([...drive1, ...stop, ...drive2])).toEqual([]);
  });

  it('emits a single mid-trip pause with centroid near the cluster', () => {
    const drive1 = fill({
      count: 12,
      startT: baseT,
      intervalMs: 5_000,
      speed: 10,
      lat: 46.0,
      latStep: 0.0005,
    });
    const stop = fill({
      count: 61,
      startT: baseT + 60_000,
      intervalMs: 5_000,
      speed: 0,
      lat: 46.005,
    });
    const drive2 = fill({
      count: 12,
      startT: baseT + 365_000,
      intervalMs: 5_000,
      speed: 10,
      lat: 46.005,
      latStep: 0.0005,
    });
    const out = extractPauses([...drive1, ...stop, ...drive2]);
    expect(out).toHaveLength(1);
    expect(out[0].center.lat).toBeCloseTo(46.005, 5);
    expect(out[0].center.lng).toBeCloseTo(14, 5);
    expect(out[0].durationS).toBeGreaterThanOrEqual(MIN_PAUSE_DURATION_S);
  });

  it('emits a trailing pause that runs to the last point', () => {
    const drive = fill({
      count: 12,
      startT: baseT,
      intervalMs: 5_000,
      speed: 10,
      lat: 46.0,
      latStep: 0.0005,
    });
    const stop = fill({
      count: 61,
      startT: baseT + 60_000,
      intervalMs: 5_000,
      speed: 0,
      lat: 46.006,
    });
    const pts = [...drive, ...stop];
    const out = extractPauses(pts);
    expect(out).toHaveLength(1);
    expect(out[0].endMs).toBe(pts[pts.length - 1].timestamp);
  });

  it('emits multiple intervals in chronological order', () => {
    let t = baseT;
    const drive1 = fill({
      count: 12,
      startT: t,
      intervalMs: 5_000,
      speed: 10,
      lat: 46.0,
      latStep: 0.0005,
    });
    t += 60_000;
    const stop1 = fill({ count: 61, startT: t, intervalMs: 5_000, speed: 0, lat: 46.005 });
    t += 305_000;
    const drive2 = fill({
      count: 12,
      startT: t,
      intervalMs: 5_000,
      speed: 10,
      lat: 46.005,
      latStep: 0.0005,
    });
    t += 60_000;
    const stop2 = fill({ count: 61, startT: t, intervalMs: 5_000, speed: 0, lat: 46.01 });
    t += 305_000;
    const drive3 = fill({
      count: 12,
      startT: t,
      intervalMs: 5_000,
      speed: 10,
      lat: 46.01,
      latStep: 0.0005,
    });
    const out = extractPauses([...drive1, ...stop1, ...drive2, ...stop2, ...drive3]);
    expect(out).toHaveLength(2);
    expect(out[0].startMs).toBeLessThan(out[1].startMs);
    expect(out[0].center.lat).toBeCloseTo(46.005, 5);
    expect(out[1].center.lat).toBeCloseTo(46.01, 5);
  });

  it('honors a custom minDurationS', () => {
    // ~30s pause: dropped at default 120, kept at 20
    const drive1 = fill({
      count: 12,
      startT: baseT,
      intervalMs: 5_000,
      speed: 10,
      lat: 46.0,
      latStep: 0.0005,
    });
    const stop = fill({
      count: 13,
      startT: baseT + 60_000,
      intervalMs: 5_000,
      speed: 0,
      lat: 46.005,
    });
    const drive2 = fill({
      count: 12,
      startT: baseT + 125_000,
      intervalMs: 5_000,
      speed: 10,
      lat: 46.005,
      latStep: 0.0005,
    });
    const pts = [...drive1, ...stop, ...drive2];
    expect(extractPauses(pts, 120)).toEqual([]);
    expect(extractPauses(pts, 20).length).toBeGreaterThan(0);
  });

  it('skips zero-dt duplicates without crashing', () => {
    const pts = [
      mkPoint({ lat: 46, lng: 14, speed: 0, timestamp: baseT }),
      mkPoint({ lat: 46, lng: 14, speed: 0, timestamp: baseT }),
      mkPoint({ lat: 46, lng: 14, speed: 0, timestamp: baseT + 200_000 }),
    ];
    const out = extractPauses(pts);
    expect(out).toHaveLength(1);
    expect(out[0].durationS).toBe(200);
  });
});
