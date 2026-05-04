# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

The repository currently contains **only the architecture spec** (`triptracker-architecture.md`). The Expo app itself has not been scaffolded yet. When implementing, follow the spec as the source of truth — it defines stack versions, file layout, data model, and behavioral details (smoothing windows, auto-pause threshold, GPS filtering rules) that the implementation must match.

Scaffold with:

```bash
npx create-expo-app triptracker --template default@sdk-55
```

App code goes in `/src/app` (SDK 55 default). New Architecture is mandatory — do **not** add `newArchEnabled` to `app.json`.

## Project overview

TripTracker is a personal iOS-only speed/distance/route tracker, distributed via EAS dev build. Targets Expo SDK 55, RN 0.83, React 19.2, iOS 17+. Uses Apple Maps natively (no Google Maps key needed).

## Commands

Once scaffolded, the spec defines these scripts:

```bash
npm run start       # expo start
npm run ios         # expo run:ios
npm test            # jest
npm run test:watch
npm run test:cov
npm run lint        # expo lint
npm run typecheck   # tsc --noEmit
npm run check       # typecheck + lint + test (manual pre-commit)
```

Run a single test: `npx jest path/to/file.test.ts` or `npx jest -t "test name"`.

Always install Expo packages with `npx expo install <pkg>` — raw `npm install` will pull SDK-mismatched majors.

## Architecture

### Layering

- **`src/app/`** — expo-router screens, including `(tabs)/` Native Tabs group and `history/[id].tsx` detail. Root `_layout.tsx` is the **single import site** for `lib/locationTask.ts`.
- **`src/lib/`** — pure logic + native wrappers. Pure modules (`distance`, `speed`, `segments`, `gpx`, `stats`) target 100% coverage. Native wrappers (`db.ts`, `locationTask.ts`) are not unit-tested.
- **`src/state/liveStore.ts`** — zustand store. Recompute derived stats in store actions on insert, **not** in component renders.
- **`src/components/`** — presentational only.

### Background location (the load-bearing piece)

`TaskManager.defineTask(LOCATION_TASK, ...)` **must execute at module top level** in `lib/locationTask.ts`, and the module must be imported once from the root `_layout.tsx`. If lazy-imported, iOS wakes will not find the task registered and tracking silently fails.

iOS permission flow is strictly two-step: foreground first, **then** background. Reversing the order shows the wrong system dialog.

`Location.startLocationUpdatesAsync` is configured with `BestForNavigation`, 5s interval, 10m distance, `pausesUpdatesAutomatically: false`, `showsBackgroundLocationIndicator: true`. Setting the indicator false causes iOS to kill background updates more aggressively — leave it on.

### Data model

SQLite via `expo-sqlite` **async API only** (`openDatabaseAsync`, `runAsync`, `getAllAsync`, `withTransactionAsync`). The sync API janks the JS thread on background inserts. Two tables: `points` indexed on `(tripId, timestamp)` and a single-row `meta` for the active trip ID. Schema in `lib/db.ts`. Insert batches inside `withTransactionAsync`.

One trip per vacation — **day segmentation happens at render time** (group points by `yyyy-MM-dd`), not in storage.

### Speed/distance pipeline

GPS readings flow: raw → filter → smooth → display + persist.

- Drop points with `accuracy > 50`.
- Drop GPS jumps where `speed === -1 && distanceFromPrev > 200m`.
- **`speed === -1` means "no fix", not "stopped"** — display as 0, exclude from averages.
- Display speed = rolling mean of last 5 valid readings (raw GPS jitters ±2 km/h at constant speed).
- Auto-pause: 30s rolling window, paused if `avgSpeed < 0.55 m/s` (≈2 km/h).
- `movingTime = sum(dt where !isPaused)`. UI shows both "overall avg" (`distance/total`) and "moving avg" (`distance/movingTime`).

### Maps & export

`expo-maps` `AppleMaps.View` with one `polyline` per day (per-day color). For GPX export, use the new `expo-file-system` 55 `File`/`Paths` API — **not** legacy URI strings.

### React 19 note

`ref` is a regular prop. Do not introduce `forwardRef` for custom components.

## Testing

`jest-expo` preset, tests in `__tests__/`, fixtures in `__fixtures__/`. Coverage target 100% for `src/lib/**`. Don't write tests for `db.ts` or `locationTask.ts`; mock them if writing component tests, but keep component tests minimal — they're flaky with native modules.
