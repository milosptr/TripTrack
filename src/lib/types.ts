export type Trip = {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number | null;
};

export type Point = {
  id: number;
  tripId: string;
  lat: number;
  lng: number;
  /** speed in m/s, -1 means "no GPS fix" (NOT stopped) */
  speed: number;
  altitude: number;
  accuracy: number;
  /** epoch ms */
  timestamp: number;
};

/** A point that has not yet been persisted (no id, no tripId). Used in pure logic & tests. */
export type RawPoint = Omit<Point, 'id' | 'tripId'>;
