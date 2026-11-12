/**
 * Google Maps Geocoding adapter.
 * If the key is not configured, the application keeps manually entered coordinates.
 */
export async function geocodeAddress(address) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !address?.trim()) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", key);
  url.searchParams.set("region", "id");

  const response = await fetch(url);
  if (!response.ok) throw new Error("Google Maps Geocoding tidak dapat dihubungi.");
  const data = await response.json();
  const point = data.results?.[0]?.geometry?.location;
  if (data.status !== "OK" || !point) return null;
  return { latitude: Number(point.lat), longitude: Number(point.lng) };
}

export function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function localTimeHHmm(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: process.env.APP_TIME_ZONE || "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
