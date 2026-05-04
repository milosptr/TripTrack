import { AppleMaps } from 'expo-maps';
import { StyleSheet, View } from 'react-native';
import type { Point } from '@/lib/types';
import { segmentByDay } from '@/lib/segments';
import { COLORS } from '@/lib/theme';

type Props = {
  points: readonly Point[];
  style?: object;
  /** Optional camera target; defaults to the last point if available. */
  followLast?: boolean;
  /** Optional pins (e.g. pause locations). */
  markers?: AppleMaps.Marker[];
};

export function TripMap({ points, style, followLast = true, markers }: Props) {
  const segments = segmentByDay([...points]);
  const polylines = segments.map((s) => ({
    coordinates: s.points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    color: s.color,
    width: 5,
  }));
  const last = points[points.length - 1];
  const cameraPosition =
    followLast && last
      ? { coordinates: { latitude: last.lat, longitude: last.lng }, zoom: 14 }
      : undefined;

  return (
    <View style={[styles.container, style]}>
      <AppleMaps.View
        style={StyleSheet.absoluteFill}
        cameraPosition={cameraPosition}
        polylines={polylines}
        markers={markers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.cardElevated,
    overflow: 'hidden',
  },
});
