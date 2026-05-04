// IMPORTANT: importing locationTask here registers the TaskManager task at
// module top level. This is the single import site for it across the app.
import '@/lib/locationTask';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from '@/lib/theme';
import { useLiveStore } from '@/state/liveStore';

export default function RootLayout() {
  const bootstrap = useLiveStore((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.bg },
          headerTintColor: COLORS.text,
          contentStyle: { backgroundColor: COLORS.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="history/[id]" options={{ title: 'Trip' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
