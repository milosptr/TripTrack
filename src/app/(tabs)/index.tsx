import { useEffect, useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SpeedDisplay } from '@/components/SpeedDisplay';
import { StatsRow, type Stat } from '@/components/StatsRow';
import { TripMap } from '@/components/TripMap';
import { formatKm } from '@/lib/distance';
import { mpsToKmh } from '@/lib/speed';
import { formatDuration } from '@/lib/stats';
import { COLORS, RADIUS, SPACING } from '@/lib/theme';
import { useLiveStore } from '@/state/liveStore';

const REFRESH_INTERVAL_MS = 2_000;

export default function LiveScreen() {
  const activeTrip = useLiveStore((s) => s.activeTrip);
  const points = useLiveStore((s) => s.points);
  const distanceM = useLiveStore((s) => s.distanceM);
  const movingTimeS = useLiveStore((s) => s.movingTimeS);
  const elevationGainM = useLiveStore((s) => s.elevationGainM);
  const isPaused = useLiveStore((s) => s.isPaused);
  const currentSpeed = useLiveStore((s) => s.currentSpeed);
  const errorMessage = useLiveStore((s) => s.errorMessage);
  const starting = useLiveStore((s) => s.starting);
  const start = useLiveStore((s) => s.start);
  const stop = useLiveStore((s) => s.stop);
  const refresh = useLiveStore((s) => s.refreshFromDb);
  const setError = useLiveStore((s) => s.setError);

  // Poll the DB every couple of seconds while active so the UI sees background-task inserts.
  useEffect(() => {
    if (!activeTrip) return;
    const id = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [activeTrip, refresh]);

  useEffect(() => {
    if (errorMessage) {
      Alert.alert('TripTracker', errorMessage, [{ text: 'OK', onPress: () => setError(null) }]);
    }
  }, [errorMessage, setError]);

  const primaryStats: Stat[] = useMemo(
    () => [
      { label: 'Distance', value: `${formatKm(distanceM)} km` },
      { label: 'Moving time', value: formatDuration(movingTimeS) },
    ],
    [distanceM, movingTimeS],
  );

  const secondaryStats: Stat[] = useMemo(
    () => [
      {
        label: 'Avg',
        value: movingTimeS > 0 ? `${Math.round(mpsToKmh(distanceM / movingTimeS))} km/h` : '— km/h',
      },
      {
        label: 'Climb',
        value: elevationGainM > 0 ? `+${Math.round(elevationGainM)} m` : '— m',
      },
    ],
    [distanceM, movingTimeS, elevationGainM],
  );

  const onPressPrimary = () => {
    if (activeTrip) {
      Alert.alert('Stop trip?', 'This ends recording and saves the trip.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Stop', style: 'destructive', onPress: () => void stop() },
      ]);
    } else {
      void start();
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <SpeedDisplay speedMps={currentSpeed} isPaused={isPaused} />
        <StatsRow stats={primaryStats} />
        <StatsRow stats={secondaryStats} />
        <View style={styles.mapBox}>
          <TripMap points={points} style={styles.map} />
          {points.length === 0 ? (
            <View style={styles.mapHint}>
              <Text style={styles.mapHintText}>
                {activeTrip ? 'Waiting for first GPS fix…' : 'Tap Start to begin recording.'}
              </Text>
            </View>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onPressPrimary}
          disabled={starting}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: activeTrip ? COLORS.danger : COLORS.accent },
            pressed && styles.buttonPressed,
            starting && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonText}>
            {starting ? 'Starting…' : activeTrip ? 'Stop trip' : 'Start trip'}
          </Text>
        </Pressable>
        {activeTrip ? <Text style={styles.tripName}>{activeTrip.name}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: {
    padding: SPACING.lg,
    gap: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  mapBox: {
    height: 240,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.cardElevated,
    position: 'relative',
  },
  map: { flex: 1 },
  mapHint: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapHintText: { color: COLORS.textDim, fontSize: 14 },
  button: {
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tripName: {
    color: COLORS.textDim,
    fontSize: 14,
    textAlign: 'center',
  },
});
