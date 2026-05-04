import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { deleteTrip, getPointsForTrip, getTrip } from '@/lib/db';
import { TripMap } from '@/components/TripMap';
import { StatsRow, type Stat } from '@/components/StatsRow';
import { formatKm } from '@/lib/distance';
import { mpsToKmh } from '@/lib/speed';
import { computeTripStats, formatDuration } from '@/lib/stats';
import { segmentByDay } from '@/lib/segments';
import { buildGpxXml, gpxFilename } from '@/lib/gpx';
import { COLORS, RADIUS, SPACING } from '@/lib/theme';
import type { Point, Trip } from '@/lib/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'ready'; trip: Trip; points: Point[] };

export default function TripDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setState({ kind: 'missing' });
      return;
    }
    const trip = await getTrip(id);
    if (!trip) {
      setState({ kind: 'missing' });
      return;
    }
    const points = await getPointsForTrip(id);
    setState({ kind: 'ready', trip, points });
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    if (state.kind !== 'ready') return null;
    return computeTripStats(state.points);
  }, [state]);

  const segments = useMemo(() => {
    if (state.kind !== 'ready') return [];
    return segmentByDay(state.points);
  }, [state]);

  const onExport = useCallback(async () => {
    if (state.kind !== 'ready') return;
    setExporting(true);
    try {
      const xml = buildGpxXml(state.trip, state.points);
      const file = new File(Paths.cache, gpxFilename(state.trip));
      if (file.exists) file.delete();
      file.create();
      file.write(xml);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/gpx+xml' });
      } else {
        Alert.alert('Export', `Saved to ${file.uri}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Export failed', msg);
    } finally {
      setExporting(false);
    }
  }, [state]);

  const onDelete = useCallback(() => {
    if (state.kind !== 'ready') return;
    Alert.alert('Delete trip?', `"${state.trip.name}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTrip(state.trip.id);
          router.back();
        },
      },
    ]);
  }, [router, state]);

  if (state.kind === 'loading') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      </SafeAreaView>
    );
  }
  if (state.kind === 'missing') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.missing}>Trip not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { trip, points } = state;
  const tripStats = stats;
  const summaryStats: Stat[] = tripStats
    ? [
        { label: 'Distance', value: `${formatKm(tripStats.distanceM)} km` },
        { label: 'Moving', value: formatDuration(tripStats.movingTimeS) },
        {
          label: 'Avg moving',
          value:
            tripStats.movingAvgMps > 0
              ? `${Math.round(mpsToKmh(tripStats.movingAvgMps))} km/h`
              : '—',
        },
        {
          label: 'Max',
          value:
            tripStats.maxSpeedMps > 0 ? `${Math.round(mpsToKmh(tripStats.maxSpeedMps))} km/h` : '—',
        },
      ]
    : [];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: trip.name }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.mapBox}>
          <TripMap points={points} style={StyleSheet.absoluteFill} followLast={false} />
        </View>

        <Text style={styles.heading}>{trip.name}</Text>
        <Text style={styles.subheading}>
          Started {format(new Date(trip.startedAt), 'EEE d MMM, HH:mm')}
          {trip.endedAt ? ` • Ended ${format(new Date(trip.endedAt), 'HH:mm')}` : ' • In progress'}
        </Text>

        <StatsRow stats={summaryStats.slice(0, 2)} />
        <StatsRow stats={summaryStats.slice(2, 4)} />

        {tripStats && tripStats.elevationGainM > 0 ? (
          <Text style={styles.elev}>+{Math.round(tripStats.elevationGainM)} m elevation gain</Text>
        ) : null}

        {segments.length > 0 ? (
          <View style={styles.daysSection}>
            <Text style={styles.sectionTitle}>Per day</Text>
            {segments.map((s) => (
              <View key={s.day} style={styles.dayRow}>
                <View style={[styles.dayDot, { backgroundColor: s.color }]} />
                <Text style={styles.dayLabel}>
                  {format(new Date(`${s.day}T00:00:00`), 'EEE d MMM')}
                </Text>
                <Text style={styles.dayValue}>{formatKm(s.distanceM)} km</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.buttonRow}>
          <Pressable
            onPress={onExport}
            disabled={exporting || points.length === 0}
            style={({ pressed }) => [
              styles.button,
              styles.primary,
              pressed && styles.pressed,
              (exporting || points.length === 0) && styles.disabled,
            ]}
          >
            <Text style={styles.buttonText}>{exporting ? 'Exporting…' : 'Export GPX'}</Text>
          </Pressable>
          <Pressable
            onPress={onDelete}
            style={({ pressed }) => [styles.button, styles.danger, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>Delete</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missing: { color: COLORS.textDim, fontSize: 16 },
  container: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  mapBox: {
    height: 280,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.cardElevated,
  },
  heading: { color: COLORS.text, fontSize: 24, fontWeight: '700', marginTop: SPACING.sm },
  subheading: { color: COLORS.textDim, fontSize: 14, marginBottom: SPACING.sm },
  elev: { color: COLORS.textDim, fontSize: 13 },
  daysSection: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  sectionTitle: {
    color: COLORS.textDim,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.xs,
  },
  dayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.xs },
  dayDot: { width: 10, height: 10, borderRadius: 5, marginRight: SPACING.md },
  dayLabel: { color: COLORS.text, flex: 1, fontSize: 14 },
  dayValue: { color: COLORS.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  buttonRow: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md },
  button: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
  },
  primary: { backgroundColor: COLORS.accent },
  danger: { backgroundColor: COLORS.danger },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
