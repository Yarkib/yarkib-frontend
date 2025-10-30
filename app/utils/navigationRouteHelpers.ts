// app/utils/navigationRouteHelpers.ts
export function haversineDistanceMeters(lat1:number, lon1:number, lat2:number, lon2:number) {
  const toRad = (v:number) => (v * Math.PI) / 180;
  const R = 6371000;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function projectPointOntoSegment(A:[number,number], B:[number,number], P:[number,number]) {
  const ax = A[0], ay = A[1];
  const bx = B[0], by = B[1];
  const px = P[0], py = P[1];
  const ABx = bx - ax;
  const ABy = by - ay;
  const APx = px - ax;
  const APy = py - ay;
  const ab2 = ABx*ABx + ABy*ABy;
  if (ab2 === 0) return { proj: A as [number,number], t: 0 };
  let t = (APx*ABx + APy*ABy) / ab2;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  const projX = ax + ABx * t;
  const projY = ay + ABy * t;
  return { proj: [projX, projY] as [number,number], t };
}

export function findClosestPointOnRoute(routeCoordinates:Array<[number,number]>, user:[number,number]) {
  let best = { segmentIndex: 0, projectedPoint: routeCoordinates[0] as [number,number], t: 0, distanceMeters: Number.POSITIVE_INFINITY };
  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const A = routeCoordinates[i];
    const B = routeCoordinates[i+1];
    const { proj, t } = projectPointOntoSegment(A, B, user);
    const dist = haversineDistanceMeters(user[1], user[0], proj[1], proj[0]);
    if (dist < best.distanceMeters) {
      best = { segmentIndex: i, projectedPoint: proj, t, distanceMeters: dist };
    }
  }
  return best;
}

export function createDynamicRouteCoordinates(routeCoordinates:Array<[number,number]>, user:[number,number]) {
  if (!routeCoordinates || routeCoordinates.length < 2) return routeCoordinates;
  const closest = findClosestPointOnRoute(routeCoordinates, user);
  const segIdx = closest.segmentIndex;
  const proj = closest.projectedPoint;
  const distMeters = closest.distanceMeters;
  if (segIdx >= routeCoordinates.length - 2 && distMeters < 15) {
    return routeCoordinates;
  }
  const remainingCoords = routeCoordinates.slice(segIdx + 1);
  const result:Array<[number,number]> = [];
  result.push([user[0], user[1]]);
  if (!remainingCoords.length || remainingCoords[0][0] !== proj[0] || remainingCoords[0][1] !== proj[1]) {
    result.push([proj[0], proj[1]]);
  }
  for (const c of remainingCoords) result.push([c[0], c[1]]);
  return result;
}

// Default export to satisfy Expo Router
export default {
  haversineDistanceMeters,
  projectPointOntoSegment,
  findClosestPointOnRoute,
  createDynamicRouteCoordinates
};
