# TripTracker

Personal iOS-only speed/distance/route tracker for road trips. Records GPS in
the foreground and background using `expo-location` and `expo-task-manager`,
persists points to SQLite, and renders the route per day on Apple Maps. Built
with Expo SDK 55, React Native 0.83, React 19.2, and the New Architecture.
Distributed via EAS internal builds — no app store, no auth, no sync, no
analytics.

## Stack

- Expo SDK 55, React Native 0.83, React 19.2
- expo-router (Native Tabs API)
- expo-location + expo-task-manager (background GPS)
- expo-sqlite (async API only)
- expo-maps (`AppleMaps.View`, native iOS, no API key needed)
- expo-file-system 55 `File`/`Paths` API for GPX export
- zustand for state, date-fns for formatting
- Vitest in Node mode for the pure-logic test suite

## Install

```bash
npm install
```

## Run on iOS

You need a paid Apple Developer account, Xcode installed, and a real device or
simulator.

```bash
npx expo prebuild         # generates the iOS project
npx expo run:ios          # build & launch on simulator/device
```

For first-time setup on a real device, build the dev client via EAS:

```bash
eas build --profile development --platform ios
```

After the dev client is installed, JS-only changes can be shipped as OTA
updates with `eas update`.

## Test

```bash
npm test                  # vitest run
npm run test:watch        # vitest watch mode
npm run test:cov          # vitest with coverage; expects 100% on src/lib/**
```

Pure-logic modules in `src/lib/` (distance, speed, segments, gpx, stats) are
tested at 100% coverage. Native wrappers (`db.ts`, `locationTask.ts`) are not
unit-tested — they are thin pass-throughs to native modules.

## Type-check & lint

```bash
npm run typecheck
npm run lint
npm run format
npm run check             # all three together
```

## Project layout

```
src/
  app/                # expo-router screens
    _layout.tsx       # single import site for lib/locationTask.ts
    (tabs)/
      _layout.tsx     # NativeTabs
      index.tsx       # Live screen
      history.tsx     # Trips list
    history/[id].tsx  # Trip detail
  lib/
    db.ts             # SQLite open + schema + helpers
    locationTask.ts   # TaskManager.defineTask + start/stop
    distance.ts       # Haversine + filtering
    speed.ts          # Smoothing + auto-pause
    segments.ts       # Day grouping + colors
    gpx.ts            # GPX export
    stats.ts          # Moving time, averages, elevation
    theme.ts          # Colors, spacing
    types.ts          # Shared types
  state/
    liveStore.ts      # zustand store
  components/         # SpeedDisplay, StatsRow, TripMap
__tests__/            # vitest pure-logic tests
__fixtures__/         # GPX golden file + sample points
```

## Recording rules

- GPS points dropped if `accuracy > 50m`.
- GPS points dropped on jump: `speed === -1 && distanceFromPrev > 200m`.
- Display speed = rolling mean of last 5 valid readings.
- Auto-pause: 30s rolling window, paused when avg speed `< 0.55 m/s` (≈2 km/h).
- `-1` speed = "no fix", treated as 0 in display, excluded from averages but
  zeroed for pause math.
- One trip per vacation. Day segmentation is render-time, not stored.

## Build profiles (eas.json)

- `development` — dev client, internal distribution, real-device install for
  the trip.
- `preview` — internal distribution.
- `production` — defined for completeness; not used for personal builds.

## CI/CD

`.github/workflows/eas-preview.yml` runs on push to `main`, on PRs against
`main`, and via manual `workflow_dispatch`. The `verify` job runs typecheck,
lint, and tests; on success it gates a `build-preview` job that triggers
`eas build --profile preview --platform ios --no-wait` so the runner doesn't
block on the EAS queue. Requires an `EXPO_TOKEN` repo secret with build
permissions.

## Gotchas (do not violate)

- `TaskManager.defineTask` is registered at module top level in
  `lib/locationTask.ts` and imported once from `app/_layout.tsx`. Lazy-loading
  it will silently break background updates.
- iOS permission flow is foreground-then-background. Reversing the order
  prompts the wrong dialog.
- `showsBackgroundLocationIndicator: true` is mandatory — the blue indicator
  is unavoidable, but turning it off makes iOS kill background tracking
  aggressively.
- Use the `expo-sqlite` async API only; the sync API janks the JS thread
  during background inserts.
- React 19 makes `ref` a regular prop. Do not introduce `forwardRef`.
- Use the `expo-file-system` 55 `File`/`Paths` API, not legacy URI strings.

## License

Personal use, no license granted.
