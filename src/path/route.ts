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
      x: -230.27,
      y: 0,
      z: 115.69,
      radius: 80
    },
    {
      name: 'Planet_B',
      model: 'assets/scene/Models/TestMoon.gltf',
      x: -619,
      y: 0,
      z: 309.14,
      radius: 28
    },
    {
      name: 'Sun',
      model: 'assets/scene/Models/Sun.gltf',
      x: 552.82,
      y: 0,
      z: 1596.48,
      radius: 828
    }
  ],
  legs: [
    {
      stopId: 'end',
      points: [
        { x: 41.6, z: 232.56 },
        { x: -188.69, z: 262.08 },
        { x: -465.85, z: 409.35 },
        { x: -662.73, z: 640.31 }
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
