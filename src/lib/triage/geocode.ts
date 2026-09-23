import type { Priority } from "../civic";

export type GeocodeResult = {
  lat: number;
  lng: number;
} | null;

/**
 * Free Nominatim (OpenStreetMap) geocoder — no API key, server-side only.
 * Retries with a country hint before giving up.
 */
export async function geocode(locationText: string): Promise<GeocodeResult> {
  const query = locationText.trim();
  if (!query) return null;

  const attempts = [query, `${query}, India`];
  for (const q of attempts) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "FreebuffCivicLens/1.0 (civic complaint triage demo)",
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) continue;
      const data = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (Array.isArray(data) && data.length > 0) {
        const lat = Number(data[0].lat);
        const lng = Number(data[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      }
    } catch {
      // network/timeout — try next attempt, then give up
    }
  }
  return null;
}
