import { engine } from '@dcl/sdk/ecs'
import { spawnPlanetsFromRoute, spawnDistantStars, setupAsteroids } from './factory'
import { setupUi } from './ui'
import { AsteroidSystem, PlanetSystem } from './systems'
import { ShipPathSystem } from './path/follow'
import { setupDebugTeleportToShip } from './utilities'

export function main() {
  // uncomment the line below to initialize UI from ui.tsx
  //setupUi()

  spawnPlanetsFromRoute()
  spawnDistantStars(40)
  setupAsteroids()

  engine.addSystem(PlanetSystem)
  engine.addSystem(ShipPathSystem)
  engine.addSystem(AsteroidSystem)
  setupDebugTeleportToShip()
}
