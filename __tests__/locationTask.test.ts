import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the native modules so the SUT can be imported under Node.
const mocks = vi.hoisted(() => ({
  defineTask: vi.fn(),
  isTaskDefined: vi.fn<(name: string) => boolean>(),
  isTaskRegisteredAsync: vi.fn<(name: string) => Promise<boolean>>(),
  requestForegroundPermissionsAsync: vi.fn(),
  requestBackgroundPermissionsAsync: vi.fn(),
  hasStartedLocationUpdatesAsync: vi.fn<() => Promise<boolean>>(),
  startLocationUpdatesAsync: vi.fn<() => Promise<void>>(),
  stopLocationUpdatesAsync: vi.fn<() => Promise<void>>(),
}));

vi.mock('expo-task-manager', () => ({
  defineTask: mocks.defineTask,
  isTaskDefined: mocks.isTaskDefined,
  isTaskRegisteredAsync: mocks.isTaskRegisteredAsync,
}));

vi.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  ActivityType: { AutomotiveNavigation: 2 },
  requestForegroundPermissionsAsync: mocks.requestForegroundPermissionsAsync,
  requestBackgroundPermissionsAsync: mocks.requestBackgroundPermissionsAsync,
  hasStartedLocationUpdatesAsync: mocks.hasStartedLocationUpdatesAsync,
  startLocationUpdatesAsync: mocks.startLocationUpdatesAsync,
  stopLocationUpdatesAsync: mocks.stopLocationUpdatesAsync,
}));

vi.mock('../src/lib/db', () => ({
  db: {},
  getActiveTripId: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  mocks.requestBackgroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  mocks.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
  mocks.startLocationUpdatesAsync.mockResolvedValue(undefined);
  mocks.isTaskDefined.mockReturnValue(true);
});

describe('startTracking gating', () => {
  it('starts location updates on first call even though OS-level isTaskRegisteredAsync is still false', async () => {
    // Regression: previously gated on `isTaskRegisteredAsync` which only flips
    // true after `startLocationUpdatesAsync`, so the first Start trip always
    // threw "Location task is not registered" before tracking could begin.
    mocks.isTaskRegisteredAsync.mockResolvedValue(false);

    const { startTracking } = await import('../src/lib/locationTask');
    await expect(startTracking()).resolves.toBeUndefined();

    expect(mocks.isTaskRegisteredAsync).not.toHaveBeenCalled();
    expect(mocks.startLocationUpdatesAsync).toHaveBeenCalledOnce();
  });

  it('throws when the JS task body was never loaded (defineTask did not run)', async () => {
    mocks.isTaskDefined.mockReturnValue(false);

    const { startTracking } = await import('../src/lib/locationTask');
    await expect(startTracking()).rejects.toThrow('Location task is not registered');
    expect(mocks.startLocationUpdatesAsync).not.toHaveBeenCalled();
  });

  it('throws on denied foreground permission before touching background', async () => {
    mocks.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);

    const { startTracking } = await import('../src/lib/locationTask');
    await expect(startTracking()).rejects.toThrow('Foreground location permission denied');
    expect(mocks.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('throws on denied background permission', async () => {
    mocks.requestBackgroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);

    const { startTracking } = await import('../src/lib/locationTask');
    await expect(startTracking()).rejects.toThrow('Background location permission denied');
    expect(mocks.startLocationUpdatesAsync).not.toHaveBeenCalled();
  });

  it('does not re-start if updates are already running', async () => {
    mocks.hasStartedLocationUpdatesAsync.mockResolvedValue(true);

    const { startTracking } = await import('../src/lib/locationTask');
    await startTracking();

    expect(mocks.startLocationUpdatesAsync).not.toHaveBeenCalled();
  });
});

describe('module load', () => {
  it('registers the JS task body at module top level', async () => {
    vi.resetModules();
    mocks.defineTask.mockClear();
    await import('../src/lib/locationTask');
    expect(mocks.defineTask).toHaveBeenCalledWith('triptracker-location', expect.any(Function));
  });
});
