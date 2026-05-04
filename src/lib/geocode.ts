import * as Location from 'expo-location';

export type PlaceLabel = {
  city: string | null;
  region: string | null;
  country: string | null;
  isoCountryCode: string | null;
};

const cache = new Map<string, Promise<PlaceLabel | null>>();

function cellKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

/**
 * Reverse-geocode a coordinate to a `PlaceLabel`. Wraps `Location.reverseGeocodeAsync`
 * (Apple's CLGeocoder on iOS — network required, no API key). Results are deduped and
 * cached in-memory by lat/lng rounded to ~110 m. Network/permission errors resolve to
 * null and are cached for the session to avoid hammering.
 */
export function reverseGeocode(lat: number, lng: number): Promise<PlaceLabel | null> {
  const key = cellKey(lat, lng);
  const cached = cache.get(key);
  if (cached) return cached;

  const promise = (async (): Promise<PlaceLabel | null> => {
    try {
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const first = results[0];
      if (!first) return null;
      return {
        city: first.city ?? null,
        region: first.region ?? null,
        country: first.country ?? null,
        isoCountryCode: first.isoCountryCode ?? null,
      };
    } catch {
      return null;
    }
  })();

  cache.set(key, promise);
  return promise;
}

/** Pick the most specific human-readable name available, or null if nothing fits. */
export function formatPlace(p: PlaceLabel | null): string | null {
  if (!p) return null;
  return p.city ?? p.region ?? p.country ?? null;
}
