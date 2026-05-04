// IMPORTANT: TaskManager.defineTask MUST run at module top-level so iOS can
// register the task on app boot. Import this module exactly once from the root
// app layout — never lazy-import it.

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { db, getActiveTripId } from './db';
import { shouldKeepPoint } from './distance';
import type { Point } from './types';

export const LOCATION_TASK = 'triptracker-location';

type TaskBody = {
  data?: { locations?: Location.LocationObject[] };
  error?: TaskManager.TaskManagerError | null;
};

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: TaskBody) => {
  if (error) {
    // No userland recovery — iOS will retry. Surface to console for dev builds.
    console.warn('[locationTask] error:', error.message);
    return;
  }
  const locations = data?.locations ?? [];
  if (locations.length === 0) return;

  const tripId = await getActiveTripId();
  if (!tripId) return;

  // Pull last accepted point for jump-detection across batches.
  const lastRow = await db.getFirstAsync<Pick<Point, 'lat' | 'lng'>>(
    'SELECT lat, lng FROM points WHERE tripId = ? ORDER BY timestamp DESC LIMIT 1',
    [tripId],
  );
  let prev: Pick<Point, 'lat' | 'lng'> | null = lastRow ?? null;

  await db.withTransactionAsync(async () => {
    for (const loc of locations) {
      const candidate = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        speed: loc.coords.speed ?? -1,
        altitude: loc.coords.altitude ?? 0,
        accuracy: loc.coords.accuracy ?? 0,
      };
      if (!shouldKeepPoint(candidate, prev)) continue;
      await db.runAsync(
        `INSERT INTO points (tripId, lat, lng, speed, altitude, accuracy, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          tripId,
          candidate.lat,
          candidate.lng,
          candidate.speed,
          candidate.altitude,
          candidate.accuracy,
          loc.timestamp,
        ],
      );
      prev = { lat: candidate.lat, lng: candidate.lng };
    }
  });
});

/**
 * Kick off background tracking. Performs the strict iOS two-step permission
 * flow: foreground first, then background. Throws with a user-readable message
 * on any failure.
 */
export async function startTracking(): Promise<void> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    throw new Error('Foreground location permission denied');
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    throw new Error('Background location permission denied');
  }

  // Verify the JS task body was loaded. isTaskRegisteredAsync only flips true
  // after startLocationUpdatesAsync, so checking it here would always fail on
  // first launch — isTaskDefined is the correct sync check that the
  // module-top-level defineTask() ran.
  if (!TaskManager.isTaskDefined(LOCATION_TASK)) {
    throw new Error('Location task is not registered');
  }

  const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (isRunning) return;

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 5_000,
    distanceInterval: 10,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.AutomotiveNavigation,
    foregroundService: undefined, // iOS-only build; ignored on iOS
  });
}

export async function stopTracking(): Promise<void> {
  const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

export async function isTracking(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
}
