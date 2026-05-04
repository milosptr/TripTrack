import { create } from 'zustand';
import {
  countPointsForTrip,
  createTrip,
  endTrip,
  getActiveTripId,
  getPointsForTrip,
  getTrip,
  setActiveTripId,
} from '@/lib/db';
import { startTracking, stopTracking } from '@/lib/locationTask';
import { isAutoPaused, smoothedSpeed } from '@/lib/speed';
import { computeTripStats } from '@/lib/stats';
import type { Point, Trip } from '@/lib/types';
import { format } from 'date-fns';

type LiveState = {
  activeTrip: Trip | null;
  points: Point[];
  pointCount: number;
  distanceM: number;
  movingTimeS: number;
  pausedTimeS: number;
  elevationGainM: number;
  isPaused: boolean;
  currentSpeed: number; // smoothed, m/s
  lastTickMs: number | null;
  initializing: boolean;
  starting: boolean;
  errorMessage: string | null;

  bootstrap: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  refreshFromDb: () => Promise<void>;
  appendLivePoint: (p: Point) => void;
  setError: (msg: string | null) => void;
};

const INITIAL: Omit<
  LiveState,
  'bootstrap' | 'start' | 'stop' | 'refreshFromDb' | 'appendLivePoint' | 'setError'
> = {
  activeTrip: null,
  points: [],
  pointCount: 0,
  distanceM: 0,
  movingTimeS: 0,
  pausedTimeS: 0,
  elevationGainM: 0,
  isPaused: false,
  currentSpeed: 0,
  lastTickMs: null,
  initializing: false,
  starting: false,
  errorMessage: null,
};

function recomputeDerived(
  points: Point[],
): Pick<
  LiveState,
  | 'distanceM'
  | 'movingTimeS'
  | 'pausedTimeS'
  | 'elevationGainM'
  | 'isPaused'
  | 'currentSpeed'
  | 'pointCount'
> {
  const stats = computeTripStats(points);
  return {
    pointCount: stats.pointCount,
    distanceM: stats.distanceM,
    movingTimeS: stats.movingTimeS,
    pausedTimeS: stats.pausedTimeS,
    elevationGainM: stats.elevationGainM,
    isPaused: isAutoPaused(points),
    currentSpeed: smoothedSpeed(points),
  };
}

export const useLiveStore = create<LiveState>()((set, get) => ({
  ...INITIAL,

  setError: (msg) => set({ errorMessage: msg }),

  bootstrap: async () => {
    if (get().initializing) return;
    set({ initializing: true });
    try {
      const id = await getActiveTripId();
      if (!id) {
        set({ ...INITIAL, initializing: false });
        return;
      }
      const trip = await getTrip(id);
      if (!trip) {
        await setActiveTripId(null);
        set({ ...INITIAL, initializing: false });
        return;
      }
      const points = await getPointsForTrip(id);
      set({
        activeTrip: trip,
        points,
        ...recomputeDerived(points),
        lastTickMs: Date.now(),
        initializing: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ errorMessage: msg, initializing: false });
    }
  },

  start: async () => {
    if (get().starting || get().activeTrip) return;
    set({ starting: true, errorMessage: null });
    try {
      const name = `Trip - ${format(new Date(), 'MMM d')}`;
      const trip = await createTrip(name);
      await setActiveTripId(trip.id);
      await startTracking();
      set({
        activeTrip: trip,
        points: [],
        ...recomputeDerived([]),
        lastTickMs: Date.now(),
        starting: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Roll back if startTracking threw after createTrip succeeded.
      const trip = get().activeTrip;
      if (trip) await setActiveTripId(null);
      set({ ...INITIAL, errorMessage: msg });
    }
  },

  stop: async () => {
    const trip = get().activeTrip;
    try {
      await stopTracking();
      if (trip) {
        await endTrip(trip.id);
        await setActiveTripId(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ errorMessage: msg });
    } finally {
      set({ ...INITIAL });
    }
  },

  refreshFromDb: async () => {
    const trip = get().activeTrip;
    if (!trip) return;
    const points = await getPointsForTrip(trip.id);
    const count = await countPointsForTrip(trip.id);
    set({
      points,
      ...recomputeDerived(points),
      pointCount: count,
      lastTickMs: Date.now(),
    });
  },

  appendLivePoint: (p) => {
    const points = [...get().points, p];
    set({ points, ...recomputeDerived(points), lastTickMs: Date.now() });
  },
}));
