import { useEffect, useRef, useCallback } from "react";
import api from '@/lib/api';

interface UseLocationTrackingOptions {
  visitId: string | null;
  enabled: boolean;
  intervalMs?: number;
  durationMs?: number;
}

export function useLocationTracking({
  visitId,
  enabled,
  intervalMs = 30000,
  durationMs = 4 * 60 * 60 * 1000,
}: UseLocationTrackingOptions) {
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<number>(0);

  const sendLocation = useCallback(
    async (lat: number, lng: number, accuracy: number) => {
      if (!visitId) return;
      const now = Date.now();
      if (now - lastSentRef.current < 5000) return;
      lastSentRef.current = now;
      try {
        await api.post(`/field-visits/${visitId}/location`, {
          lat,
          lng,
          accuracy,
        });
      } catch {
        // silently fail - tracking continues
      }
    },
    [visitId]
  );

  useEffect(() => {
    if (!enabled || !visitId) return;

    const startTracking = () => {
      if (!navigator.geolocation) return;

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          sendLocation(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.accuracy
          );
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );

      intervalRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            sendLocation(
              pos.coords.latitude,
              pos.coords.longitude,
              pos.coords.accuracy
            );
          },
          () => {},
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }, intervalMs);

      timeoutRef.current = setTimeout(() => {
        stopTracking();
      }, durationMs);
    };

    const stopTracking = () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    startTracking();

    return stopTracking;
  }, [enabled, visitId, intervalMs, durationMs, sendLocation]);

  return null;
}
