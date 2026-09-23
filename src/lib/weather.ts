/**
 * Open-Meteo current-weather client — free, no API key.
 *
 * Used by the risk engine (rainfall is a feature of the Civic Incident Neural
 * Network). Falls back gracefully: any failure just means rainfall = 0 and the
 * risk prediction is labeled as running without weather data.
 *
 * Docs: https://open-meteo.com/en/docs
 */
export type WeatherSnapshot = {
  temperatureC: number | null;
  humidity: number | null;
  /** Sum of precipitation over the next 24h in mm (0 when unavailable). */
  rainfall24hMm: number;
  fetchedAt: string;
};

type CacheEntry = { data: WeatherSnapshot; expires: number };

const CACHE_TTL_MS = 15 * 60_000; // Open-Meteo updates hourly; 15 min is plenty
const globalCache = globalThis as unknown as { __civicWeather?: CacheEntry };

const FALLBACK: WeatherSnapshot = {
  temperatureC: null,
  humidity: null,
  rainfall24hMm: 0,
  fetchedAt: new Date(0).toISOString(),
};

/**
 * Fetch weather for a lat/lng. Never throws. Results are cached in-process.
 * Demo locations cluster in Bengaluru, so one fetch serves most requests.
 */
export async function getWeather(
  lat: number,
  lng: number,
  precision = 0.25
): Promise<WeatherSnapshot> {
  // Quantize to ~25km so nearby complaints share a cache entry.
  const qLat = Math.round(lat / precision) * precision;
  const qLng = Math.round(lng / precision) * precision;
  const key = `${qLat.toFixed(2)},${qLng.toFixed(2)}`;

  const cached = globalCache.__civicWeather;
  if (cached && cached.expires > Date.now() && (cached as CacheEntry & { key?: string }).key === key) {
    return cached.data;
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${qLat}&longitude=${qLng}` +
      `&current=temperature_2m,relative_humidity_2m` +
      `&hourly=precipitation&forecast_days=2&timezone=auto`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return FALLBACK;
    const json = (await res.json()) as {
      current?: { temperature_2m?: number; relative_humidity_2m?: number };
      hourly?: { time?: string[]; precipitation?: number[] };
    };

    // Sum the next 24 hourly precipitation values from "now".
    let rainfall24hMm = 0;
    const times = json.hourly?.time ?? [];
    const precip = json.hourly?.precipitation ?? [];
    const nowIdx = times.findIndex((t) => new Date(t).getTime() >= Date.now() - 3_600_000);
    const start = nowIdx >= 0 ? nowIdx : 0;
    for (let i = start; i < Math.min(start + 24, precip.length); i++) {
      rainfall24hMm += precip[i] ?? 0;
    }

    const data: WeatherSnapshot = {
      temperatureC: json.current?.temperature_2m ?? null,
      humidity: json.current?.relative_humidity_2m ?? null,
      rainfall24hMm: Math.round(rainfall24hMm * 10) / 10,
      fetchedAt: new Date().toISOString(),
    };
    globalCache.__civicWeather = { key, data, expires: Date.now() + CACHE_TTL_MS } as CacheEntry & { key?: string };
    return data;
  } catch {
    return FALLBACK;
  }
}

/** Weather for the demo's home city when no coordinates exist yet. */
export async function getCityWeather(): Promise<WeatherSnapshot> {
  return getWeather(12.9716, 77.5946); // Bengaluru
}
