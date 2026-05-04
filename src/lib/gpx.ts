import type { Point, Trip } from './types';

/**
 * Escape a string for safe inclusion as XML text or an attribute value.
 * We escape the XML 1.0 predefined entities only.
 */
export function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format a JS epoch ms as ISO 8601 with Z (UTC), the form GPX expects. */
export function isoTime(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Build a GPX 1.1 document for a trip and its points.
 *
 * The output is a single `<trk>` containing one `<trkseg>` with all points in
 * chronological order. Trip name is XML-escaped. Points with speed === -1
 * (no fix) are written without a <speed> element.
 *
 * The output is byte-stable for a given input, suitable for fixture diffs.
 */
export function buildGpxXml(trip: Trip, points: readonly Point[]): string {
  const name = escapeXml(trip.name);
  const meta = `<metadata><name>${name}</name><time>${isoTime(trip.startedAt)}</time></metadata>`;
  const segs = points
    .map((p) => {
      const time = `<time>${isoTime(p.timestamp)}</time>`;
      const ele = `<ele>${formatNumber(p.altitude)}</ele>`;
      const speed = p.speed >= 0 ? `<speed>${formatNumber(p.speed)}</speed>` : '';
      return `<trkpt lat="${formatNumber(p.lat)}" lon="${formatNumber(p.lng)}">${ele}${time}${speed}</trkpt>`;
    })
    .join('');
  const trkBody = `<trk><name>${name}</name><trkseg>${segs}</trkseg></trk>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="TripTracker" xmlns="http://www.topografix.com/GPX/1/1">',
    meta,
    trkBody,
    '</gpx>',
    '',
  ].join('\n');
}

/**
 * Format a finite number with up to 6 decimals, trailing zeros trimmed,
 * to keep GPX output compact and stable.
 */
function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  // 6 dp ≈ 11 cm at the equator — enough for our purposes.
  const rounded = Math.round(n * 1_000_000) / 1_000_000;
  // toString avoids the scientific-notation pitfall for very small numbers.
  if (Number.isInteger(rounded)) return rounded.toString();
  return rounded.toString();
}

/** Convenience: filename-safe version of a trip name (used for the .gpx file). */
export function gpxFilename(trip: Trip): string {
  const safe = trip.name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${safe || 'trip'}.gpx`;
}
