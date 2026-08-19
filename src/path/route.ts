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
      x: 9913.81,
      y: 0,
      z: 19.41,
      radius: 3500
    },
    {
      name: 'Planet_2',
      model: 'assets/scene/Models/TestPlanet.gltf',
      x: -10229.8,
      y: 0,
      z: 406.68,
      radius: 3168.62
    },
    {
      name: 'Planet_3',
      model: 'assets/scene/Models/TestPlanet.gltf',
      x: -28916.96,
      y: 0,
      z: 82.51,
      radius: 3252.24
    },
    {
      name: 'Planet_4',
      model: 'assets/scene/Models/TestPlanet.gltf',
      x: -48342.46,
      y: 0,
      z: -198.81,
      radius: 3812.5
    },
    {
      name: 'Planet_5',
      model: 'assets/scene/Models/TestPlanet.gltf',
      x: -65364.01,
      y: 0,
      z: 658.87,
      radius: 3903.48
    },
    {
      name: 'Planet_6',
      model: 'assets/scene/Models/TestPlanet.gltf',
      x: -83010.12,
      y: 0,
      z: 658.87,
      radius: 3733.05
    },
    {
      name: 'Planet_7',
      model: 'assets/scene/Models/TestPlanet.gltf',
      x: -111664.78,
      y: 0,
      z: 8686.88,
      radius: 5494.45
    }
  ],
  legs: [
    {
      stopId: 'end',
      points: [
        { x: 25018.66, z: 1440.69 },
        { x: 18623.1, z: 6062.12 },
        { x: 3663.14, z: 9658.27 },
        { x: -11872.2, z: 10089.81 },
        { x: -27551.39, z: 9802.11 },
        { x: -43086.73, z: 9945.96 },
        { x: -58478.23, z: 10952.88 },
        { x: -69410.51, z: 10809.03 },
        { x: -80486.63, z: 11384.42 },
        { x: -95590.44, z: 13542.1 },
        { x: -108392.71, z: 19727.47 }
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
