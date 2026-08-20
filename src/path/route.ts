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
   * 1 = longest accel/decel ramps (no mid-leg cruise plateau).
   */
  accelDecel: number
  planets: RoutePlanet[]
  legs: RouteLeg[]
}

/**
 * Authored in tools/path-editor/index.html (Copy TypeScript).
 * Open path: first point of the first leg is Start; the ship does not loop.
 */
export const SHIP_ROUTE: ShipRoute = {
  y: 0,
  accelDecel: 1,
  planets: [
    {
      name: 'Planet_A',
      model: 'assets/scene/Models/TestPlanet.gltf',
      x: 0,
      y: 0,
      z: 0,
      radius: 80
    },
    {
      name: 'Planet_B',
      model: 'assets/scene/Models/TestMoon.gltf',
      x: 420,
      y: 0,
      z: 80,
      radius: 28
    }
  ],
  legs: [
    {
      stopId: 'end',
      points: [
        { x: -140, z: 10 },
        { x: 50, z: 130 },
        { x: 260, z: 120 },
        { x: 430, z: 130 }
      ]
    }
  ]
}

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
