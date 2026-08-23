import { SHIP_ROUTE as authoredRoute } from './routedata'

export type RoutePlanet = {
  name: string
  model: string
  x: number
  y: number
  z: number
  radius: number
}

export type RoutePoint = {
  x: number
  z: number
}

export type RouteLeg = {
  /** Encounter id of the stop at the *end* of this leg. */
  stopId: string
  points: RoutePoint[]
}

export type ShipRoute = {
  y: number
  /**
   * 0 = constant cruise (snappy start/stop).
   * 1 = accel for the first half, decel for the second (no mid-leg cruise).
   * 1–4 = slower holds at the ends and a sharper mid-leg.
   */
  accelDecel: number
  planets: RoutePlanet[]
  legs: RouteLeg[]
}

/**
 * Authored map lives in routedata.ts (path editor Save TypeScript overwrites that file).
 * Open path: first point of the first leg is Start; the ship does not loop.
 * Start is not an authored encounter — the ship waits there until the mission starts.
 */
export const START_STOP_ID = 'start'

export const SHIP_ROUTE: ShipRoute = authoredRoute

export function routePlanetCentroid(route: ShipRoute): { x: number; y: number; z: number } {
  if (route.planets.length === 0) {
    return { x: 0, y: route.y, z: 0 }
  }
  let x = 0
  let y = 0
  let z = 0
  for (const planet of route.planets) {
    x += planet.x
    y += planet.y
    z += planet.z
  }
  const n = route.planets.length
  return { x: x / n, y: y / n, z: z / n }
}
