import { format } from 'date-fns';
import type { Point } from './types';
import { totalDistance } from './distance';

/** Per-day color cycle for polylines. */
export const DAY_COLORS = [
  '#FF6B00',
  '#FFB800',
  '#00C2FF',
  '#9D4EDD',
  '#06D6A0',
  '#EF476F',
  '#118AB2',
] as const;

/** Format a timestamp as a local "yyyy-MM-dd" key. */
export function dayKey(timestamp: number): string {
  return format(new Date(timestamp), 'yyyy-MM-dd');
}

export type DaySegment = {
  /** "yyyy-MM-dd" in the device's local timezone. */
  day: string;
  points: Point[];
  color: string;
  distanceM: number;
};

/**
 * Group points into per-day segments, in chronological day order, and assign each day
 * a color from `DAY_COLORS` (cycling when there are more days than colors).
 */
export function segmentByDay(points: readonly Point[]): DaySegment[] {
  const groups = new Map<string, Point[]>();
  for (const p of points) {
    const k = dayKey(p.timestamp);
    const existing = groups.get(k);
    if (existing) existing.push(p);
    else groups.set(k, [p]);
  }
  const days = Array.from(groups.keys()).sort();
  return days.map((day, i) => {
    const dayPoints = groups.get(day) as Point[];
    return {
      day,
      points: dayPoints,
      color: colorForDayIndex(i),
      distanceM: totalDistance(dayPoints),
    };
  });
}

/** Pick the color for the i-th day of a trip (0-indexed), cycling through DAY_COLORS. */
export function colorForDayIndex(index: number): string {
  return DAY_COLORS[index % DAY_COLORS.length];
}
