import { StyleSheet, Text, View } from 'react-native';
import { mpsToKmh } from '@/lib/speed';
import { COLORS, SPACING } from '@/lib/theme';

type Props = {
  /** Smoothed current speed in m/s. */
  speedMps: number;
  /** Whether the recording is auto-paused. */
  isPaused: boolean;
};

export function SpeedDisplay({ speedMps, isPaused }: Props) {
  const kmh = Math.max(0, Math.round(mpsToKmh(speedMps)));
  return (
    <View style={styles.container}>
      <Text style={styles.value}>{kmh}</Text>
      <Text style={styles.unit}>km/h</Text>
      {isPaused ? <Text style={styles.paused}>paused</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  value: {
    fontSize: 128,
    fontWeight: '700',
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
    lineHeight: 128,
  },
  unit: {
    color: COLORS.textDim,
    fontSize: 18,
    marginTop: -8,
  },
  paused: {
    color: COLORS.accent,
    fontSize: 14,
    marginTop: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '600',
  },
});
