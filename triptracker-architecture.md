# TripTracker — Architecture Spec (Expo SDK 55)

Personal speed/distance/route tracker. **iOS only**, dev build via EAS, paid Apple Dev account.
Targets: Expo SDK 55, React Native 0.83, React 19.2, iOS 17+, New Architecture (mandatory).

## Stack

```
expo                          ^55.0.0
expo-router                   ^7.x          # Native Tabs API
expo-location                 ^55.0.0
expo-task-manager             ^55.0.0
expo-sqlite                   ^55.0.0       # async API
expo-maps                     ^55.0.0       # Apple Maps native, iOS 17+
expo-file-system              ^55.0.0       # File/Paths API
expo-sharing                  ^55.0.0
zustand                       ^5.x
date-fns                      ^4.x

# dev
vitest                        ^2.x
@vitest/coverage-v8           ^2.x
@testing-library/react-native ^13.x         # only if writing component tests
```

Install everything with `npx expo install` (raw npm will mismatch SDK majors).

## Project setup

```bash
npx create-expo-app triptracker --template default@sdk-55
```

App code lives in `/src/app` (new SDK 55 default). New Arch is on, can't be disabled, do **not** put `newArchEnabled` in app.json.

## File structure

```
src/
  app/
    _layout.tsx
    (tabs)/
      _layout.tsx          # NativeTabs
      index.tsx            # Live screen
      history.tsx          # Trips list
    history/
      [id].tsx             # Trip detail
  lib/
    db.ts                  # SQLite open + schema + active trip helpers
    locationTask.ts        # TaskManager.defineTask + start/stop
    distance.ts            # Haversine, GPS filtering
    speed.ts               # Smoothing, auto-pause
    segments.ts            # Day segmentation
    gpx.ts                 # GPX export
    stats.ts               # Moving time, averages
  state/
    liveStore.ts           # zustand store
  components/
    SpeedDisplay.tsx
    StatsRow.tsx
    TripMap.tsx
__tests__/
  distance.test.ts
  speed.test.ts
  segments.test.ts
  gpx.test.ts
  stats.test.ts
__fixtures__/
  sample-trip.json         # array of Point objects (drive across Reykjavík)
  sample-trip.gpx          # expected GPX output
```

## Data model

Two tables, `points` indexed on `(tripId, timestamp)`, plus a single-row `meta` table for active trip ID.

```ts
type Trip = {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number | null;
};

type Point = {
  id: number;
  tripId: string;
  lat: number;
  lng: number;
  speed: number;       // m/s, -1 = invalid
  altitude: number;
  accuracy: number;
  timestamp: number;
};
```

Use `expo-sqlite` async API (`openDatabaseAsync`, `runAsync`, `getAllAsync`, `withTransactionAsync`). Sync API exists but causes JS thread jank on background inserts.

## Background tracking

`TaskManager.defineTask` **must run at module top level**, evaluated on app boot. Put in `/src/lib/locationTask.ts`, import once from root layout `_layout.tsx`.

```ts
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { db, getActiveTripId } from './db';

const LOCATION_TASK = 'triptracker-location';

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const tripId = await getActiveTripId();
  if (!tripId) return;

  await db.withTransactionAsync(async () => {
    for (const loc of locations) {
      await db.runAsync(
        `INSERT INTO points (tripId, lat, lng, speed, altitude, accuracy, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tripId, loc.coords.latitude, loc.coords.longitude,
         loc.coords.speed ?? -1, loc.coords.altitude ?? 0,
         loc.coords.accuracy ?? 0, loc.timestamp]
      );
    }
  });
});

export async function startTracking() {
  // Two-step iOS 14+ flow
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new Error('Foreground denied');
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') throw new Error('Background denied');

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 5000,
    distanceInterval: 10,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.AutomotiveNavigation,
  });
}
```

## app.json

```json
{
  "expo": {
    "name": "TripTracker",
    "slug": "triptracker",
    "ios": {
      "bundleIdentifier": "dev.milosptr.triptracker",
      "supportsTablet": false,
      "infoPlist": {
        "UIBackgroundModes": ["location", "fetch"],
        "NSLocationAlwaysAndWhenInUseUsageDescription": "TripTracker records your route and speed during trips, including when the app is backgrounded.",
        "NSLocationWhenInUseUsageDescription": "TripTracker records your route and speed during trips.",
        "ITSAppUsesNonExemptEncryption": false
      }
    },
    "plugins": [
      ["expo-location", {
        "locationAlwaysAndWhenInUsePermission": "TripTracker needs background access to record your full route while driving.",
        "isIosBackgroundLocationEnabled": true
      }],
      "expo-maps",
      "expo-sqlite"
    ]
  }
}
```

No Google Maps API key needed — `expo-maps` uses Apple Maps natively on iOS.

## Navigation — Native Tabs

```tsx
// src/app/(tabs)/_layout.tsx
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

export default function TabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf="location.fill" />
        <Label>Live</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        <Icon sf="map.fill" />
        <Label>Trips</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
```

## State — zustand

```ts
type LiveState = {
  activeTripId: string | null;
  pointCount: number;
  distanceM: number;
  movingTimeS: number;
  pausedTimeS: number;
  isPaused: boolean;
  currentSpeed: number;  // smoothed
};
```

Recompute on insert via store action, not on every render.

## Auto-pause

```ts
// rolling 30s window
const recent = lastNPoints(points, 30_000);
const avgSpeed = mean(recent.map(p => Math.max(0, p.speed)));
const isPaused = avgSpeed < 0.55;  // 2 km/h
```

`movingTime = sum(dt where !isPaused)`. Show both "overall avg" (`distance / total`) and "moving avg" (`distance / movingTime`).

## Distance & smoothing

Haversine between consecutive points, with filtering:

- Drop `accuracy > 50`
- Drop GPS jumps: `speed === -1 && distanceFromPrev > 200m`
- Display speed = rolling avg of last 5 valid readings (raw GPS jitters ±2 km/h even at constant speed)

## Day segmentation

One trip per vacation, segment at render time:

```ts
const days = Object.groupBy(points, p =>
  format(new Date(p.timestamp), 'yyyy-MM-dd')
);
```

Color polyline per day, dashboard shows per-day breakdown.

## Map rendering — expo-maps

```tsx
import { AppleMaps } from 'expo-maps';

<AppleMaps.View
  style={{ flex: 1 }}
  cameraPosition={{ coordinates: { latitude, longitude }, zoom: 14 }}
  polylines={[{
    coordinates: points.map(p => ({ latitude: p.lat, longitude: p.lng })),
    color: '#FF6B00',
    width: 5,
  }]}
/>
```

Per-day polylines: array, one per day, each colored differently.

## GPX export

```ts
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

async function exportGpx(trip: Trip, points: Point[]) {
  const xml = buildGpxXml(trip, points);
  const file = new File(Paths.cache, `${trip.name}.gpx`);
  file.create();
  file.write(xml);
  await Sharing.shareAsync(file.uri);
}
```

Use new `File`/`Paths` API in expo-file-system 55, not legacy URI strings.

## Screens

1. **Live** (`/`) — huge speed display, distance, moving time, elevation gain, mini AppleMaps with current polyline. Start/stop button.
2. **Trips** (`/history`) — list with thumbnail map preview per trip.
3. **Trip detail** (`/history/[id]`) — full map, stats dashboard, per-day breakdown, GPX export, delete.

React 19 note: `ref` is a regular prop now — no `forwardRef` needed for any custom components.

## Testing

```json
// package.json additions
{
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "lint": "expo lint",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "check": "npm run typecheck && npm run lint && npm test"
  }
}
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
    },
  },
});
```

Vitest runs the pure-logic suite in plain Node — no Expo/RN preset needed because nothing in `src/lib` imports native modules. If you ever write component tests, isolate them in a separate project with `jsdom` and stub out `expo-*` imports; do **not** try to load native modules under vitest.

**Test pure logic in `/src/lib` with vitest. Coverage target: 100%.**

- `distance.test.ts` — Haversine accuracy, point filtering, GPS jump detection
- `speed.test.ts` — smoothing window, auto-pause threshold edges, `-1` handling
- `segments.test.ts` — day grouping across midnight, timezone correctness
- `gpx.test.ts` — snapshot vs fixture, escaping, empty trip
- `stats.test.ts` — moving time, both averages, elevation gain

Don't test native module wrappers (`db.ts`, `locationTask.ts`). Mock them in component tests if you write any. Keep component tests minimal — they're flaky with native modules and not load-bearing for a personal app.

## Tooling

Use Expo template defaults: ESLint via `eslint-config-expo`, Prettier. TypeScript `strict: true`. Skip Husky/lint-staged for a personal app.

Pre-commit (manual): `npm run check`.

## Gotchas

- **iOS permission flow is two-step.** Foreground first, then background. Skip the order and the OS shows the wrong dialog.
- **`TaskManager.defineTask` must be at module top-level**, evaluated on app boot. Lazy-imported = won't register when iOS wakes the app.
- **Speed `-1` ≠ stopped.** Means "no fix." Treat as 0 in display, exclude from averages.
- **Battery: 15-20%/hr** with BestForNavigation + screen on. Always on car USB-C.
- **Blue status indicator is unavoidable** with `showsBackgroundLocationIndicator: true`. Setting it false makes iOS kill background updates more aggressively.
- **EAS build dev client BEFORE you leave.** Internal distribution profile, install once, then ship JS-only OTA updates via `eas update` during the trip.
- **Test on a real drive** — simulator GPS doesn't simulate jitter, accuracy drops, or background suspension.

## Build order

1. Scaffold + foreground tracking + draw polyline → verify GPS in hand around Reykjavík
2. SQLite + trip persistence → verify survives kill/restart
3. Background task + permissions → drive Akranes loop, verify with screen locked
4. Stats dashboard + auto-pause + smoothing
5. GPX export + share
6. Trip history + detail screens
7. Polish, install via internal distribution, full Reykjavík → Akranes round trip before May 6

Steps 1-3 are the only risky bits. Everything after is pure logic over the points array.
