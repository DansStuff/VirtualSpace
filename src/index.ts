import { engine } from '@dcl/sdk/ecs'
import { createPlanet, spawnDistantStars, setupAsteroids } from './factory'
import { FOCUS_A, FOCUS_B } from './ship'
import { setupUi } from './ui'
import { AsteroidSystem, PlanetSystem, TestShipAnimator } from './systems'
import { setupDebugTeleportToShip } from './utilities'

export function main() {
  // uncomment the line below to initialize UI from ui.tsx
  //setupUi()

  // Planet data source TBD — foci shared with TestShipAnimator figure-8 path.
  createPlanet('assets/scene/Models/TestPlanet.gltf', {
    name: 'TestPlanet',
    position: FOCUS_A,
    radius: 3500
  })
  createPlanet('assets/scene/Models/TestMoon.gltf', {
    name: 'TestMoon',
    position: FOCUS_B,
    radius: 1000
  })
  spawnDistantStars(40)
  setupAsteroids()

  engine.addSystem(PlanetSystem)
  engine.addSystem(TestShipAnimator)
  engine.addSystem(AsteroidSystem)
  setupDebugTeleportToShip()
}
