import { createDynamicRouteCoordinates, findClosestPointOnRoute, haversineDistanceMeters, projectPointOntoSegment } from '../utils/navigationRouteHelpers';

describe('navigationHelpers', () => {
  test('haversineDistanceMeters calculates correct distance', () => {
    // Distance between two known points (approximately 111km apart)
    const distance = haversineDistanceMeters(0, 0, 1, 0);
    expect(distance).toBeCloseTo(111195, -2); // Within 100m accuracy
  });

  test('projectPointOntoSegment finds mid-segment projection', () => {
    const A: [number, number] = [0, 0];
    const B: [number, number] = [1, 0];
    const P: [number, number] = [0.5, 0.5]; // Point above middle of segment
    
    const result = projectPointOntoSegment(A, B, P);
    
    expect(result.t).toBeCloseTo(0.5, 2);
    expect(result.proj[0]).toBeCloseTo(0.5, 2);
    expect(result.proj[1]).toBeCloseTo(0, 2);
  });

  test('projectPointOntoSegment clamps to segment endpoints', () => {
    const A: [number, number] = [0, 0];
    const B: [number, number] = [1, 0];
    const P: [number, number] = [-1, 0]; // Point before segment start
    
    const result = projectPointOntoSegment(A, B, P);
    
    expect(result.t).toBe(0);
    expect(result.proj).toEqual([0, 0]);
  });

  test('findClosestPointOnRoute finds correct segment', () => {
    const route: Array<[number, number]> = [[0, 0], [1, 0], [2, 0]]; // Straight line on x-axis
    const user: [number, number] = [0.5, 0.5]; // Above first segment
    
    const closest = findClosestPointOnRoute(route, user);
    
    expect(closest.segmentIndex).toBe(0);
    expect(closest.t).toBeGreaterThan(0);
    expect(closest.t).toBeLessThan(1);
    expect(closest.distanceMeters).toBeGreaterThan(0);
  });

  test('findClosestPointOnRoute handles single segment route', () => {
    const route: Array<[number, number]> = [[0, 0], [1, 0]];
    const user: [number, number] = [0.5, 0];
    
    const closest = findClosestPointOnRoute(route, user);
    
    expect(closest.segmentIndex).toBe(0);
    expect(closest.distanceMeters).toBeCloseTo(0, 1);
  });

  test('createDynamicRouteCoordinates shortens route correctly', () => {
    const route: Array<[number, number]> = [[0, 0], [1, 0], [2, 0], [3, 0]];
    const user: [number, number] = [1.5, 0]; // Between second and third points
    
    const result = createDynamicRouteCoordinates(route, user);
    
    // Result should include: user position + projection point + remaining route points
    expect(result.length).toBeLessThanOrEqual(route.length);
    expect(result[0]).toEqual([1.5, 0]); // Starts with user position
    expect(result[result.length - 1]).toEqual([3, 0]); // Ends with route end
  });

  test('createDynamicRouteCoordinates handles user near route end', () => {
    const route: Array<[number, number]> = [[0, 0], [1, 0], [2, 0]];
    const user: [number, number] = [1.9, 0]; // Very close to end
    
    const result = createDynamicRouteCoordinates(route, user);
    
    // Should return original route when near end
    expect(result).toEqual(route);
  });

  test('createDynamicRouteCoordinates handles empty route', () => {
    const route: Array<[number, number]> = [];
    const user: [number, number] = [0, 0];
    
    const result = createDynamicRouteCoordinates(route, user);
    
    expect(result).toEqual(route);
  });

  test('createDynamicRouteCoordinates handles single point route', () => {
    const route: Array<[number, number]> = [[0, 0]];
    const user: [number, number] = [1, 1];
    
    const result = createDynamicRouteCoordinates(route, user);
    
    expect(result).toEqual(route);
  });
});
