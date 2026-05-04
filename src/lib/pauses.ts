import type { Point } from './types';
import { PAUSE_THRESHOLD_MPS, PAUSE_WINDOW_MS, sanitizeSpeed } from './speed';

/** Minimum pause duration (seconds) to surface as a marker. Filters traffic lights. */
export const MIN_PAUSE_DURATION_S = 120;

export type PauseInterval = {
  startMs: number;
  endMs: number;
  durationS: number;
  center: { lat: number; lng: number };
};

/**
 * Extract paused intervals from a trip's points using the same rolling-window logic
 * as `computeTripStats` (30s window, <0.55 m/s avg). Contiguous "paused" steps merge
 * into one interval; intervals shorter than `minDurationS` are dropped.
 *
 * The interval covers `points[startIdx..endIdx]` inclusive — when step i triggers a
 * pause, both `points[i-1]` and `points[i]` are part of the cluster (the dt between
 * them is the paused time).
 */
export function extractPauses(
  points: readonly Point[],
  minDurationS = MIN_PAUSE_DURATION_S,
): PauseInterval[] {
  if (points.length < 2) return [];
  const intervals: PauseInterval[] = [];
  let startIdx: number | null = null;
  let endIdx = 0;

  const flush = () => {
    if (startIdx === null) return;
    const startMs = points[startIdx].timestamp;
    const endMs = points[endIdx].timestamp;
    const durationS = (endMs - startMs) / 1000;
    if (durationS >= minDurationS) {
      intervals.push({
        startMs,
        endMs,
        durationS,
        center: centroid(points.slice(startIdx, endIdx + 1)),
      });
    }
    startIdx = null;
  };

  for (let i = 1; i < points.length; i++) {
    const cur = points[i];
    const dt = (cur.timestamp - points[i - 1].timestamp) / 1000;
    if (dt <= 0) continue;
    const cutoff = cur.timestamp - PAUSE_WINDOW_MS;
    let sum = 0;
    let count = 0;
    for (let j = i; j >= 0 && points[j].timestamp >= cutoff; j--) {
      sum += sanitizeSpeed(points[j].speed);
      count += 1;
    }
    const avg = sum / count;
    if (avg < PAUSE_THRESHOLD_MPS) {
      if (startIdx === null) startIdx = i - 1;
      endIdx = i;
    } else {
      flush();
    }
  }
  flush();
  return intervals;
}

function centroid(
  pts: readonly Pick<Point, 'lat' | 'lng'>[],
): { lat: number; lng: number } {
  let lat = 0;
  let lng = 0;
  for (const p of pts) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / pts.length, lng: lng / pts.length };
}
