import * as SQLite from 'expo-sqlite';
import type { Point, Trip } from './types';

const DB_NAME = 'triptracker.db';
const ACTIVE_TRIP_KEY = 'activeTripId';

let _db: SQLite.SQLiteDatabase | null = null;

/** Lazy-open the database and ensure schema. Idempotent. */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      startedAt INTEGER NOT NULL,
      endedAt INTEGER
    );
    CREATE TABLE IF NOT EXISTS points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tripId TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      speed REAL NOT NULL,
      altitude REAL NOT NULL,
      accuracy REAL NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_points_trip_time ON points(tripId, timestamp);
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );
  `);
  _db = db;
  return db;
}

/** Used internally by the location task; keeps a stable reference once opened. */
export const db = {
  async runAsync(sql: string, params: SQLite.SQLiteBindParams = []) {
    const d = await getDb();
    return d.runAsync(sql, params);
  },
  async getAllAsync<T>(sql: string, params: SQLite.SQLiteBindParams = []): Promise<T[]> {
    const d = await getDb();
    return d.getAllAsync<T>(sql, params);
  },
  async getFirstAsync<T>(sql: string, params: SQLite.SQLiteBindParams = []): Promise<T | null> {
    const d = await getDb();
    return d.getFirstAsync<T>(sql, params);
  },
  async withTransactionAsync(fn: () => Promise<void>) {
    const d = await getDb();
    return d.withTransactionAsync(fn);
  },
};

export async function getActiveTripId(): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM meta WHERE key = ?',
    [ACTIVE_TRIP_KEY],
  );
  return row?.value ?? null;
}

export async function setActiveTripId(tripId: string | null): Promise<void> {
  if (tripId === null) {
    await db.runAsync('DELETE FROM meta WHERE key = ?', [ACTIVE_TRIP_KEY]);
    return;
  }
  await db.runAsync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [ACTIVE_TRIP_KEY, tripId],
  );
}

export async function createTrip(name: string): Promise<Trip> {
  const id = `trip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  await db.runAsync('INSERT INTO trips (id, name, startedAt, endedAt) VALUES (?, ?, ?, NULL)', [
    id,
    name,
    startedAt,
  ]);
  return { id, name, startedAt, endedAt: null };
}

export async function endTrip(tripId: string, endedAt = Date.now()): Promise<void> {
  await db.runAsync('UPDATE trips SET endedAt = ? WHERE id = ?', [endedAt, tripId]);
}

export async function deleteTrip(tripId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM points WHERE tripId = ?', [tripId]);
    await db.runAsync('DELETE FROM trips WHERE id = ?', [tripId]);
  });
}

export async function renameTrip(tripId: string, name: string): Promise<void> {
  await db.runAsync('UPDATE trips SET name = ? WHERE id = ?', [name, tripId]);
}

export async function listTrips(): Promise<Trip[]> {
  return db.getAllAsync<Trip>(
    'SELECT id, name, startedAt, endedAt FROM trips ORDER BY startedAt DESC',
  );
}

export async function getTrip(tripId: string): Promise<Trip | null> {
  return db.getFirstAsync<Trip>('SELECT id, name, startedAt, endedAt FROM trips WHERE id = ?', [
    tripId,
  ]);
}

export async function getPointsForTrip(tripId: string): Promise<Point[]> {
  return db.getAllAsync<Point>(
    'SELECT id, tripId, lat, lng, speed, altitude, accuracy, timestamp FROM points WHERE tripId = ? ORDER BY timestamp ASC',
    [tripId],
  );
}

export async function countPointsForTrip(tripId: string): Promise<number> {
  const row = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM points WHERE tripId = ?',
    [tripId],
  );
  return row?.c ?? 0;
}

export async function insertPoint(p: {
  tripId: string;
  lat: number;
  lng: number;
  speed: number;
  altitude: number;
  accuracy: number;
  timestamp: number;
}): Promise<void> {
  await db.runAsync(
    `INSERT INTO points (tripId, lat, lng, speed, altitude, accuracy, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [p.tripId, p.lat, p.lng, p.speed, p.altitude, p.accuracy, p.timestamp],
  );
}
