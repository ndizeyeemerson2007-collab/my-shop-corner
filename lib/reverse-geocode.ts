type ReverseGeocodeInput = {
  accuracy?: number | null;
  acceptLanguage?: string | null;
  capturedAt?: string;
  latitude: number;
  longitude: number;
};

type NominatimAddress = {
  borough?: string;
  city?: string;
  city_district?: string;
  country?: string;
  county?: string;
  district?: string;
  hamlet?: string;
  municipality?: string;
  neighbourhood?: string;
  quarter?: string;
  residential?: string;
  state?: string;
  state_district?: string;
  suburb?: string;
  town?: string;
  village?: string;
} | null;

type NominatimResponse = {
  address?: NominatimAddress;
  display_name?: string;
};

export type ResolvedLocation = {
  accuracy: number | null;
  capturedAt: string;
  district: string | null;
  label: string;
  latitude: number;
  longitude: number;
  rawDisplayName: string | null;
  sector: string | null;
};

const geocodeCache = new Map<string, ResolvedLocation>();

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (trimmed) return trimmed;
  }

  return null;
}

function addSuffix(value: string | null, suffix: string) {
  if (!value) return null;
  return value.toLowerCase().includes(suffix.toLowerCase()) ? value : `${value} ${suffix}`;
}

function uniqueParts(parts: Array<string | null | undefined>) {
  const seen = new Set<string>();

  return parts.filter((part): part is string => {
    const trimmed = String(part || '').trim();
    if (!trimmed) return false;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildHumanLocation(address: NominatimAddress, displayName?: string | null) {
  const sector = addSuffix(
    firstNonEmpty(
      address?.suburb,
      address?.city_district,
      address?.borough,
      address?.neighbourhood,
      address?.quarter,
      address?.residential,
      address?.hamlet,
    ),
    'Sector',
  );

  const district = addSuffix(
    firstNonEmpty(
      address?.county,
      address?.state_district,
      address?.district,
      address?.municipality,
    ),
    'District',
  );

  const city = firstNonEmpty(
    address?.city,
    address?.town,
    address?.municipality,
    address?.village,
    address?.state,
  );

  const parts = uniqueParts([sector, district, city]);
  if (parts.length > 0) {
    return {
      district,
      label: parts.join(', '),
      sector,
    };
  }

  const fallback = String(displayName || '').split(',').map((part) => part.trim()).filter(Boolean).slice(0, 3).join(', ');
  return {
    district: district || null,
    label: fallback || 'Live GPS location',
    sector: sector || null,
  };
}

function buildFallbackLocation(input: ReverseGeocodeInput) {
  const accuracyLabel = Number.isFinite(Number(input.accuracy)) ? `${Math.round(Number(input.accuracy))}m` : 'unknown';
  const capturedAt = input.capturedAt || new Date().toISOString();

  return {
    accuracy: Number.isFinite(Number(input.accuracy)) ? Number(input.accuracy) : null,
    capturedAt,
    district: null,
    label: `GPS ${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)} | Accuracy ${accuracyLabel}`,
    latitude: input.latitude,
    longitude: input.longitude,
    rawDisplayName: null,
    sector: null,
  } satisfies ResolvedLocation;
}

function createCacheKey(latitude: number, longitude: number, acceptLanguage?: string | null) {
  return `${latitude.toFixed(5)}:${longitude.toFixed(5)}:${String(acceptLanguage || 'default').toLowerCase()}`;
}

export async function reverseGeocodeLocation(input: ReverseGeocodeInput): Promise<ResolvedLocation> {
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Invalid latitude or longitude');
  }

  const cacheKey = createCacheKey(latitude, longitude, input.acceptLanguage);
  const cached = geocodeCache.get(cacheKey);
  if (cached) {
    return {
      ...cached,
      accuracy: Number.isFinite(Number(input.accuracy)) ? Number(input.accuracy) : cached.accuracy,
      capturedAt: input.capturedAt || cached.capturedAt,
      latitude,
      longitude,
    };
  }

  const fallback = buildFallbackLocation({ ...input, latitude, longitude });

  try {
    const params = new URLSearchParams({
      addressdetails: '1',
      format: 'jsonv2',
      lat: String(latitude),
      lon: String(longitude),
      layer: 'address',
      zoom: '18',
    });

    const response = await fetch(
      `${process.env.REVERSE_GEOCODE_BASE_URL || 'https://nominatim.openstreetmap.org'}/reverse?${params.toString()}`,
      {
        cache: 'no-store',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': input.acceptLanguage || 'en',
          'User-Agent': process.env.REVERSE_GEOCODE_USER_AGENT || 'my-shop-location/1.0',
        },
      },
    );

    if (!response.ok) {
      return fallback;
    }

    const data = await response.json() as NominatimResponse;
    const humanLocation = buildHumanLocation(data.address || null, data.display_name || null);
    const accuracyValue = Number.isFinite(Number(input.accuracy)) ? Number(input.accuracy) : null;
    const accuracyLabel = accuracyValue === null ? null : `Accuracy ${Math.round(accuracyValue)}m`;
    const gpsLabel = `GPS ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

    const resolved = {
      accuracy: accuracyValue,
      capturedAt: input.capturedAt || new Date().toISOString(),
      district: humanLocation.district,
      label: uniqueParts([humanLocation.label, gpsLabel, accuracyLabel]).join(' | '),
      latitude,
      longitude,
      rawDisplayName: data.display_name || null,
      sector: humanLocation.sector,
    } satisfies ResolvedLocation;

    geocodeCache.set(cacheKey, resolved);
    return resolved;
  } catch {
    return fallback;
  }
}
