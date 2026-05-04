import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGpxXml, escapeXml, gpxFilename, isoTime } from '../src/lib/gpx';
import type { Point, Trip } from '../src/lib/types';

const FIXTURE_JSON = JSON.parse(
  readFileSync(join(__dirname, '..', '__fixtures__', 'sample-trip.json'), 'utf8'),
) as { trip: Trip; points: Point[] };

const FIXTURE_GPX = readFileSync(join(__dirname, '..', '__fixtures__', 'sample-trip.gpx'), 'utf8');

describe('escapeXml', () => {
  it('escapes the five XML predefined entities', () => {
    expect(escapeXml('a & b < c > d "e\' f')).toBe('a &amp; b &lt; c &gt; d &quot;e&apos; f');
  });

  it('passes through ordinary characters and Unicode', () => {
    expect(escapeXml('Reykjavík ✈')).toBe('Reykjavík ✈');
  });

  it('escapes ampersand first so existing entities are preserved correctly', () => {
    expect(escapeXml('&lt;')).toBe('&amp;lt;');
  });
});

describe('isoTime', () => {
  it('emits an ISO-8601 Z timestamp', () => {
    expect(isoTime(0)).toBe('1970-01-01T00:00:00.000Z');
    expect(isoTime(1714982400000)).toBe('2024-05-06T08:00:00.000Z');
  });
});

describe('buildGpxXml', () => {
  it('matches the fixture exactly (special chars + -1 speed handling)', () => {
    const out = buildGpxXml(FIXTURE_JSON.trip, FIXTURE_JSON.points);
    expect(out).toBe(FIXTURE_GPX);
  });

  it('handles an empty trip with zero points', () => {
    const trip: Trip = {
      id: 'empty',
      name: 'Empty trip',
      startedAt: 1714982400000,
      endedAt: null,
    };
    const out = buildGpxXml(trip, []);
    expect(out).toContain('<trkseg></trkseg>');
    expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(out.endsWith('</gpx>\n')).toBe(true);
  });

  it('omits <speed> for points whose speed is the -1 sentinel', () => {
    const trip: Trip = { id: 't', name: 't', startedAt: 0, endedAt: null };
    const out = buildGpxXml(trip, [
      {
        id: 1,
        tripId: 't',
        lat: 0,
        lng: 0,
        speed: -1,
        altitude: 0,
        accuracy: 0,
        timestamp: 0,
      },
    ]);
    expect(out).not.toContain('<speed>');
  });

  it('keeps <speed>0</speed> for valid zero-speed readings (stationary with fix)', () => {
    const trip: Trip = { id: 't', name: 't', startedAt: 0, endedAt: null };
    const out = buildGpxXml(trip, [
      {
        id: 1,
        tripId: 't',
        lat: 0,
        lng: 0,
        speed: 0,
        altitude: 0,
        accuracy: 0,
        timestamp: 0,
      },
    ]);
    expect(out).toContain('<speed>0</speed>');
  });

  it('escapes special characters in the trip name (in both <metadata> and <trk>)', () => {
    const trip: Trip = {
      id: 't',
      name: 'A & B <C>',
      startedAt: 0,
      endedAt: null,
    };
    const out = buildGpxXml(trip, []);
    expect(out).toContain('<metadata><name>A &amp; B &lt;C&gt;</name>');
    expect(out).toContain('<trk><name>A &amp; B &lt;C&gt;</name>');
  });

  it('handles non-finite altitude/speed gracefully', () => {
    const trip: Trip = { id: 't', name: 't', startedAt: 0, endedAt: null };
    const out = buildGpxXml(trip, [
      {
        id: 1,
        tripId: 't',
        lat: 0,
        lng: 0,
        speed: Number.NaN,
        altitude: Number.POSITIVE_INFINITY,
        accuracy: 0,
        timestamp: 0,
      },
    ]);
    // NaN is not >= 0 (the speed-emit guard), so no <speed>.
    expect(out).not.toContain('<speed>');
    expect(out).toContain('<ele>0</ele>');
  });
});

describe('gpxFilename', () => {
  it('replaces unsafe characters with underscores', () => {
    expect(gpxFilename({ id: 't', name: 'Trip - May 6', startedAt: 0, endedAt: null })).toBe(
      'Trip_-_May_6.gpx',
    );
  });

  it('falls back to "trip" if the name has no safe characters', () => {
    expect(gpxFilename({ id: 't', name: '!!!', startedAt: 0, endedAt: null })).toBe('trip.gpx');
  });

  it('preserves dots and dashes', () => {
    expect(gpxFilename({ id: 't', name: 'a.b-c', startedAt: 0, endedAt: null })).toBe('a.b-c.gpx');
  });
});
