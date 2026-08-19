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
      name: 'TestPlanet',
      model: 'assets/scene/Models/TestPlanet.gltf',
      x: 0,
      y: 0,
      z: 0,
      radius: 3500
    },
    {
      name: 'TestMoon',
      model: 'assets/scene/Models/TestMoon.gltf',
      x: 20000,
      y: 0,
      z: 0,
      radius: 1000
    }
  ],
  legs: [
    {
      stopId: 'end',
      points: [
        { x: 25018.66, z: 1440.69 },
        { x: 22290.17, z: 3101.51 },
        { x: 18573.09, z: 2112.93 },
        { x: 17011.13, z: -655.1 },
        { x: 15587.57, z: -1604.14 },
        { x: 14124.47, z: 135.76 },
        { x: 12740.45, z: -1445.97 },
        { x: 11237.8, z: -141.04 },
        { x: 9853.79, z: -1762.32 },
        { x: 8272.05, z: -734.19 },
        { x: 7362.55, z: -2434.55 },
        { x: 5859.91, z: -1090.08 },
        { x: 4376.34, z: -2588.69 }
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
