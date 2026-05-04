import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { listTrips, countPointsForTrip } from '@/lib/db';
import { COLORS, RADIUS, SPACING } from '@/lib/theme';
import type { Trip } from '@/lib/types';

type TripRow = Trip & { pointCount: number };

export default function HistoryScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const items = await listTrips();
    const withCounts = await Promise.all(
      items.map(async (t) => ({ ...t, pointCount: await countPointsForTrip(t.id) })),
    );
    setTrips(withCounts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void load().finally(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  if (loading && trips.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Trips</Text>
            <Text style={styles.subtitle}>
              {trips.length} {trips.length === 1 ? 'trip' : 'trips'}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No trips yet</Text>
            <Text style={styles.emptyBody}>
              Start a trip from the Live tab to record your first route.
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/history/${item.id}`)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <View style={styles.cardLeft}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardMeta}>
                {format(new Date(item.startedAt), 'EEE d MMM yyyy, HH:mm')}
              </Text>
              <Text style={styles.cardMeta}>
                {item.pointCount} {item.pointCount === 1 ? 'point' : 'points'}
                {item.endedAt ? '' : ' • recording'}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  header: { marginBottom: SPACING.md },
  title: {
    color: COLORS.text,
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: { color: COLORS.textDim, fontSize: 14, marginTop: 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  cardPressed: { opacity: 0.7 },
  cardLeft: { flex: 1, gap: 2 },
  cardTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardMeta: { color: COLORS.textDim, fontSize: 13 },
  chevron: { color: COLORS.textDim, fontSize: 24, marginLeft: SPACING.md },
  empty: {
    paddingVertical: SPACING.xxl,
    alignItems: 'center',
  },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: '600', marginBottom: SPACING.sm },
  emptyBody: {
    color: COLORS.textDim,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
});
