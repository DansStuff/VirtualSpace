/**
 * Authored map data. The path editor overwrites this file (Save TypeScript).
 */

export const SHIP_ROUTE = {
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
