import type { Point } from './types';
import { totalDistance } from './distance';
import { PAUSE_THRESHOLD_MPS, PAUSE_WINDOW_MS, sanitizeSpeed } from './speed';

export type TripStats = {
  pointCount: number;
  distanceM: number;
  totalTimeS: number;
  movingTimeS: number;
  pausedTimeS: number;
  /** distance / totalTime, in m/s. 0 if totalTime is 0. */
  overallAvgMps: number;
  /** distance / movingTime, in m/s. 0 if movingTime is 0. */
  movingAvgMps: number;
  /** Sum of positive altitude deltas, in metres. */
  elevationGainM: number;
  maxSpeedMps: number;
};

const EMPTY_STATS: TripStats = {
  pointCount: 0,
  distanceM: 0,
  totalTimeS: 0,
  movingTimeS: 0,
  pausedTimeS: 0,
  overallAvgMps: 0,
  movingAvgMps: 0,
  elevationGainM: 0,
  maxSpeedMps: 0,
};

/**
 * Compute trip-level statistics over a chronologically ordered list of points.
 *
 * Moving-time logic: at each step (i ≥ 1), compute the rolling-window average speed
 * over the last `PAUSE_WINDOW_MS` of points up to and including index i, then add
 * `dt = points[i].timestamp - points[i-1].timestamp` seconds to either movingTime
 * or pausedTime depending on whether avg < PAUSE_THRESHOLD_MPS.
 *
 * Negative speeds (-1 = no fix) are sanitized to 0 for averaging only; they do
 * not count towards `maxSpeedMps`.
 */
export function computeTripStats(points: readonly Point[]): TripStats {
  if (points.length === 0) return { ...EMPTY_STATS };

  const first = points[0];
  const last = points[points.length - 1];

  const distanceM = totalDistance(points);
  const totalTimeS = Math.max(0, (last.timestamp - first.timestamp) / 1000);

  let movingTimeS = 0;
  let pausedTimeS = 0;
  let elevationGainM = 0;
  let maxSpeedMps = first.speed > 0 ? first.speed : 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];

    const dt = (cur.timestamp - prev.timestamp) / 1000;
    if (dt > 0) {
      const cutoff = cur.timestamp - PAUSE_WINDOW_MS;
      let sum = 0;
      let count = 0;
      for (let j = i; j >= 0 && points[j].timestamp >= cutoff; j--) {
        sum += sanitizeSpeed(points[j].speed);
        count += 1;
      }
      const avg = sum / count;
      if (avg < PAUSE_THRESHOLD_MPS) pausedTimeS += dt;
      else movingTimeS += dt;
    }

    const dAlt = cur.altitude - prev.altitude;
    if (dAlt > 0) elevationGainM += dAlt;
    if (cur.speed > maxSpeedMps) maxSpeedMps = cur.speed;
  }

  return {
    pointCount: points.length,
    distanceM,
    totalTimeS,
    movingTimeS,
    pausedTimeS,
    overallAvgMps: totalTimeS > 0 ? distanceM / totalTimeS : 0,
    movingAvgMps: movingTimeS > 0 ? distanceM / movingTimeS : 0,
    elevationGainM,
    maxSpeedMps,
  };
}

/** Format seconds as "h:mm:ss" or "m:ss" if under an hour. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(mins)}:${pad(secs)}`;
  return `${mins}:${pad(secs)}`;
}
