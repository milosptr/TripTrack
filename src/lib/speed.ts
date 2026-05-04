import type { Point } from './types';

/** Window size for rolling display speed (last N valid readings). */
export const SMOOTH_WINDOW = 5;

/** Auto-pause window in milliseconds (rolling lookback). */
export const PAUSE_WINDOW_MS = 30_000;

/** Auto-pause threshold in m/s (≈2 km/h). Below this, we treat the trip as paused. */
export const PAUSE_THRESHOLD_MPS = 0.55;

/** Convert m/s to km/h. */
export function mpsToKmh(mps: number): number {
  return mps * 3.6;
}

/** Treat -1 (no fix) as 0 for display & averages. */
export function sanitizeSpeed(mps: number): number {
  return mps < 0 ? 0 : mps;
}

/** Whether a reading is "valid" — has a real GPS fix and is non-negative. */
export function isValidSpeed(mps: number): boolean {
  return mps >= 0;
}

type SpeedTimePoint = Pick<Point, 'speed' | 'timestamp'>;

/**
 * Smoothed display speed: rolling mean of the last N *valid* readings (speed >= 0).
 * Returns 0 if no valid readings exist.
 *
 * Implementation note: takes the last N valid readings (in chronological order),
 * regardless of how many invalid readings sit between them.
 */
export function smoothedSpeed(readings: readonly SpeedTimePoint[], window = SMOOTH_WINDOW): number {
  if (window <= 0) return 0;
  const valid: number[] = [];
  for (let i = readings.length - 1; i >= 0 && valid.length < window; i--) {
    if (isValidSpeed(readings[i].speed)) valid.push(readings[i].speed);
  }
  if (valid.length === 0) return 0;
  let sum = 0;
  for (const v of valid) sum += v;
  return sum / valid.length;
}

/**
 * Returns the points whose timestamp is within `windowMs` of the most recent point's timestamp.
 * Empty input → empty output.
 */
export function pointsInWindow<T extends Pick<Point, 'timestamp'>>(
  readings: readonly T[],
  windowMs: number,
): T[] {
  if (readings.length === 0) return [];
  const cutoff = readings[readings.length - 1].timestamp - windowMs;
  return readings.filter((r) => r.timestamp >= cutoff);
}

/**
 * Decide whether the recording is currently auto-paused.
 *
 * Logic: take points within the last `PAUSE_WINDOW_MS`, compute the mean of their
 * sanitized speeds (treating -1 as 0), and compare against `PAUSE_THRESHOLD_MPS`.
 *
 * Boundary: `avgSpeed < threshold` → paused. Exactly equal is NOT paused.
 *
 * Returns false when there are zero readings in the window (we don't auto-pause without data).
 */
export function isAutoPaused(
  readings: readonly SpeedTimePoint[],
  windowMs = PAUSE_WINDOW_MS,
  threshold = PAUSE_THRESHOLD_MPS,
): boolean {
  const recent = pointsInWindow(readings, windowMs);
  if (recent.length === 0) return false;
  let sum = 0;
  for (const r of recent) sum += sanitizeSpeed(r.speed);
  const avg = sum / recent.length;
  return avg < threshold;
}
