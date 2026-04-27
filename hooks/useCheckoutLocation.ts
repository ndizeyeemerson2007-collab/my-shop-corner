'use client';

import { useState } from 'react';
import { safeFetch } from '../services/api';

export type CheckoutLocation = {
  accuracy: number | null;
  capturedAt: string;
  district?: string | null;
  label: string;
  latitude: number;
  longitude: number;
  rawDisplayName?: string | null;
  sector?: string | null;
};

function formatFallbackLabel(location: CheckoutLocation) {
  const accuracyLabel = location.accuracy ? `Accuracy ${Math.round(location.accuracy)}m` : 'Accuracy unavailable';
  return `GPS ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} | ${accuracyLabel}`;
}

export function useCheckoutLocation() {
  const [currentLocation, setCurrentLocation] = useState<CheckoutLocation | null>(null);
  const [locationError, setLocationError] = useState('');
  const [requestingLocation, setRequestingLocation] = useState(false);

  const requestCurrentLocation = async () => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      const message = 'This device does not support live location sharing.';
      setLocationError(message);
      return null;
    }

    setRequestingLocation(true);
    setLocationError('');

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      const nextLocation: CheckoutLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        capturedAt: new Date().toISOString(),
        label: '',
      };

      try {
        const response = await safeFetch<{ success: boolean; location?: CheckoutLocation; message?: string }>('/api/location/reverse', {
          method: 'POST',
          body: JSON.stringify(nextLocation),
        });

        if (response.success && response.location) {
          setCurrentLocation(response.location);
          return response.location;
        }
      } catch {
        // Fall back to GPS-only label when reverse geocoding is unavailable.
      }

      nextLocation.label = formatFallbackLabel(nextLocation);
      setCurrentLocation(nextLocation);

      return nextLocation;
    } catch (error) {
      let message = 'We could not get your live location.';

      if (error instanceof GeolocationPositionError) {
        if (error.code === error.PERMISSION_DENIED) {
          message = 'Location access was denied. Please allow location access so we can attach your live shipping location to the order.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = 'Your live location is unavailable right now. Try again in a moment.';
        } else if (error.code === error.TIMEOUT) {
          message = 'Location request timed out. Please try again.';
        }
      }

      setLocationError(message);
      return null;
    } finally {
      setRequestingLocation(false);
    }
  };

  return {
    currentLocation,
    hasLocation: Boolean(currentLocation),
    locationError,
    requestCurrentLocation,
    requestingLocation,
  };
}
