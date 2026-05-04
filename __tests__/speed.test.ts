import { describe, it, expect } from 'vitest';
import {
  isAutoPaused,
  isValidSpeed,
  mpsToKmh,
  pointsInWindow,
  sanitizeSpeed,
  smoothedSpeed,
  PAUSE_THRESHOLD_MPS,
  PAUSE_WINDOW_MS,
  SMOOTH_WINDOW,
} from '../src/lib/speed';

const reading = (speed: number, timestamp: number) => ({ speed, timestamp });

describe('mpsToKmh', () => {
  it('multiplies by 3.6', () => {
    expect(mpsToKmh(10)).toBeCloseTo(36, 6);
    expect(mpsToKmh(0)).toBe(0);
  });
});

describe('sanitizeSpeed', () => {
  it('clamps negative values (no-fix sentinel) to 0', () => {
    expect(sanitizeSpeed(-1)).toBe(0);
    expect(sanitizeSpeed(-0.5)).toBe(0);
  });
  it('passes through non-negative values', () => {
    expect(sanitizeSpeed(0)).toBe(0);
    expect(sanitizeSpeed(12.7)).toBe(12.7);
  });
});

describe('isValidSpeed', () => {
  it('treats >= 0 as valid', () => {
    expect(isValidSpeed(0)).toBe(true);
    expect(isValidSpeed(0.001)).toBe(true);
  });
  it('treats -1 as invalid', () => {
    expect(isValidSpeed(-1)).toBe(false);
  });
});

describe('smoothedSpeed', () => {
  it('returns 0 for an empty array', () => {
    expect(smoothedSpeed([])).toBe(0);
  });

  it('returns 0 when window is 0', () => {
    expect(smoothedSpeed([reading(10, 0)], 0)).toBe(0);
  });

  it('averages the last N readings when fewer than window are present', () => {
    const out = smoothedSpeed([reading(10, 0), reading(12, 1), reading(14, 2)]);
    expect(out).toBeCloseTo((10 + 12 + 14) / 3, 6);
  });

  it('averages exactly the last SMOOTH_WINDOW readings when more are present', () => {
    const readings = [
      reading(0, 0), // should be dropped
      reading(0, 1), // should be dropped
      reading(10, 2),
      reading(11, 3),
      reading(12, 4),
      reading(13, 5),
      reading(14, 6),
    ];
    const out = smoothedSpeed(readings);
    expect(out).toBeCloseTo((10 + 11 + 12 + 13 + 14) / SMOOTH_WINDOW, 6);
  });

  it('skips -1 readings entirely (does not let them dilute the average)', () => {
    const readings = [reading(10, 0), reading(-1, 1), reading(12, 2), reading(-1, 3)];
    expect(smoothedSpeed(readings)).toBeCloseTo(11, 6);
  });

  it('returns 0 when all readings are invalid', () => {
    expect(smoothedSpeed([reading(-1, 0), reading(-1, 1)])).toBe(0);
  });
});

describe('pointsInWindow', () => {
  it('returns empty for empty input', () => {
    expect(pointsInWindow([], 1000)).toEqual([]);
  });

  it('keeps points whose timestamp ≥ last.timestamp - windowMs', () => {
    const ps = [
      reading(0, 0),
      reading(0, 5_000),
      reading(0, 10_000),
      reading(0, 30_000),
      reading(0, 60_000),
    ];
    const w = pointsInWindow(ps, 30_000);
    expect(w).toEqual([reading(0, 30_000), reading(0, 60_000)]);
  });

  it('boundary point at exactly windowMs back is included', () => {
    const ps = [reading(0, 0), reading(0, 30_000)];
    expect(pointsInWindow(ps, 30_000)).toHaveLength(2);
  });
});

describe('isAutoPaused', () => {
  // Build a stream where every reading sits inside the rolling window.
  const stream = (speeds: number[]) => speeds.map((s, i) => reading(s, i * 1_000)); // 1s apart, all within 30s

  it('is false when there are no readings', () => {
    expect(isAutoPaused([])).toBe(false);
  });

  it('is true when avg sanitized speed is well below threshold', () => {
    expect(isAutoPaused(stream([0, 0, 0, 0]))).toBe(true);
  });

  it('is false when avg is well above threshold', () => {
    expect(isAutoPaused(stream([5, 5, 5, 5]))).toBe(false);
  });

  it('treats -1 readings as 0 in the average', () => {
    // Three readings at -1 and one at 0 → avg = 0, paused.
    expect(isAutoPaused(stream([-1, -1, -1, 0]))).toBe(true);
    // Three at -1 and one at 5 → avg = 1.25, not paused.
    expect(isAutoPaused(stream([-1, -1, -1, 5]))).toBe(false);
  });

  it('avg exactly at the threshold is NOT paused (< is strict)', () => {
    // Single reading at exactly the threshold.
    expect(isAutoPaused(stream([PAUSE_THRESHOLD_MPS]))).toBe(false);
  });

  it('avg just below the threshold IS paused', () => {
    expect(isAutoPaused(stream([PAUSE_THRESHOLD_MPS - 0.01]))).toBe(true);
  });

  it('only considers points inside PAUSE_WINDOW_MS', () => {
    // First 5 readings far in the past at 0; last reading recent at high speed.
    // Window contains only the last reading → avg high → not paused.
    const old = [reading(0, 0), reading(0, 1_000)];
    const recent = [reading(10, PAUSE_WINDOW_MS + 60_000)];
    expect(isAutoPaused([...old, ...recent])).toBe(false);
  });
});
