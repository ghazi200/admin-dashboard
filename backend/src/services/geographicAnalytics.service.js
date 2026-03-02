/**
 * Geographic analytics from sites data.
 * Computes aggregate stats for the Map dashboard.
 */

const EARTH_RADIUS_KM = 6371;

function toRad(x) {
  return (x * Math.PI) / 180;
}

function haversineKm(a, b) {
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
 * Compute geographic analytics from a list of sites.
 * @param {Array<{ latitude: number | null, longitude: number | null, id?: string }>} sites
 * @returns {{
 *   totalSites: number,
 *   withCoordinates: number,
 *   withoutCoordinates: number,
 *   boundingBox: { north: number, south: number, east: number, west: number } | null,
 *   center: { lat: number, lng: number } | null,
 *   averageDistanceBetweenSitesKm: number | null,
 *   maxDistanceBetweenAnyTwoKm: number | null
 * }}
 */
function computeAnalytics(sites) {
  const list = Array.isArray(sites) ? sites : [];
  const withCoords = list.filter(
    (s) => s.latitude != null && s.longitude != null && !Number.isNaN(parseFloat(s.latitude)) && !Number.isNaN(parseFloat(s.longitude))
  );
  const points = withCoords.map((s) => ({
    lat: parseFloat(s.latitude),
    lng: parseFloat(s.longitude),
  }));

  const totalSites = list.length;
  const withCoordinates = withCoords.length;
  const withoutCoordinates = totalSites - withCoordinates;

  let boundingBox = null;
  let center = null;
  let averageDistanceBetweenSitesKm = null;
  let maxDistanceBetweenAnyTwoKm = null;

  if (points.length > 0) {
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    boundingBox = {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lngs),
      west: Math.min(...lngs),
    };
    center = {
      lat: lats.reduce((a, b) => a + b, 0) / lats.length,
      lng: lngs.reduce((a, b) => a + b, 0) / lngs.length,
    };
  }

  if (points.length >= 2) {
    let totalDist = 0;
    let count = 0;
    let maxDist = 0;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = haversineKm(points[i], points[j]);
        totalDist += d;
        count += 1;
        if (d > maxDist) maxDist = d;
      }
    }
    averageDistanceBetweenSitesKm = count > 0 ? Math.round((totalDist / count) * 100) / 100 : null;
    maxDistanceBetweenAnyTwoKm = Math.round(maxDist * 100) / 100;
  }

  return {
    totalSites,
    withCoordinates,
    withoutCoordinates,
    boundingBox,
    center,
    averageDistanceBetweenSitesKm,
    maxDistanceBetweenAnyTwoKm,
  };
}

module.exports = {
  computeAnalytics,
  haversineKm,
};
