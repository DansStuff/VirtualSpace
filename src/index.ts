import { engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { createPlanet, spawnDistantStars } from './factory'
import { setupUi } from './ui'
import { PlanetSystem, TestShipAnimator } from './systems'
import { setupDebugTeleportToShip } from './utilities'

export function main() {
  // uncomment the line below to initialize UI from ui.tsx
  //setupUi()

  // Planet data source TBD — values are passed in for now (virtual-space coordinates).
  // Planet at the TestShipAnimator orbit center; moon far enough out that the ship
  // (orbit radius 10000) passes between them.
  createPlanet('assets/scene/Models/TestPlanet.gltf', {
    name: 'TestPlanet',
    position: Vector3.create(0, 0, 0),
    radius: 3500
  })
  createPlanet('assets/scene/Models/TestMoon.gltf', {
    name: 'TestMoon',
    position: Vector3.create(20000, 0, 0),
    radius: 1000
  })
  spawnDistantStars(40)

  engine.addSystem(PlanetSystem)
  engine.addSystem(TestShipAnimator)
  setupDebugTeleportToShip()
}
