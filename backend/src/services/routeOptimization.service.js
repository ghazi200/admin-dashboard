/**
 * Route optimization for supervisors visiting multiple sites.
 * Uses nearest-neighbor (Haversine distance) when no Google API key is set.
 * Optional: Google Directions API with optimize:true when GOOGLE_MAPS_API_KEY is set on backend.
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine distance in km between two points.
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 */
function haversineKm(a, b) {
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return EARTH_RADIUS_KM * c;
}

/**
 * Nearest-neighbor route: start from origin (or first site), then repeatedly pick the closest unvisited site.
 * @param {Array<{ id: string, name: string, latitude: number, longitude: number, address?: string }>} sites
 * @param {{ lat: number, lng: number } | null} origin - optional start point
 * @returns {{ orderedSites: typeof sites, legs: Array<{ from: string, to: string, distanceKm: number }>, totalDistanceKm: number }}
 */
function optimizeOrderNearestNeighbor(sites, origin) {
  if (!sites || sites.length === 0) {
    return { orderedSites: [], legs: [], totalDistanceKm: 0 };
  }

  const withCoords = sites
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => ({
      ...s,
      lat: parseFloat(s.latitude),
      lng: parseFloat(s.longitude),
    }));

  if (withCoords.length === 0) return { orderedSites: [], legs: [], totalDistanceKm: 0 };
  if (withCoords.length === 1) return { orderedSites: withCoords, legs: [], totalDistanceKm: 0 };

  const remaining = new Set(withCoords.map((s) => s.id));
  const orderedSites = [];
  const legs = [];
  let totalDistanceKm = 0;

  let current = origin
    ? { lat: origin.lat, lng: origin.lng, id: "__origin__", name: "Start" }
    : withCoords[0];
  if (!origin) {
    orderedSites.push(withCoords[0]);
    remaining.delete(withCoords[0].id);
  }

  while (remaining.size > 0) {
    let best = null;
    let bestDist = Infinity;
    for (const id of remaining) {
      const site = withCoords.find((s) => s.id === id);
      if (!site) continue;
      const d = haversineKm(
        { lat: current.lat, lng: current.lng },
        { lat: site.lat, lng: site.lng }
      );
      if (d < bestDist) {
        bestDist = d;
        best = site;
      }
    }
    if (!best) break;
    legs.push({
      from: current.id,
      to: best.id,
      fromName: current.name,
      toName: best.name,
      distanceKm: Math.round(bestDist * 100) / 100,
    });
    totalDistanceKm += bestDist;
    orderedSites.push(best);
    remaining.delete(best.id);
    current = best;
  }

  return {
    orderedSites,
    legs,
    totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
  };
}

/**
 * Normalize ID for comparison (UUID may come as string with varying case).
 */
function normId(id) {
  if (id == null) return "";
  return String(id).trim().toLowerCase();
}

/**
 * Optimize visit order for the given site IDs and optional origin.
 * @param {Array<{ id: string, name: string, latitude: number, longitude: number, address?: string }>} sites - all sites (will filter by siteIds)
 * @param {string[]} siteIds - IDs to include in the route
 * @param {{ lat: number, lng: number } | null} origin
 */
function optimizeRoute(sites, siteIds, origin = null) {
  const rawIds = Array.isArray(siteIds) ? siteIds : [];
  const idSet = new Set(rawIds.map((id) => normId(id)));
  const toVisit = (sites || []).filter((s) => idSet.has(normId(s.id)));
  return optimizeOrderNearestNeighbor(toVisit, origin);
}

module.exports = {
  haversineKm,
  optimizeOrderNearestNeighbor,
  optimizeRoute,
};
