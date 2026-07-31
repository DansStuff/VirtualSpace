import { engine, Entity, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { PlanetData } from './components'

export type PlanetSpawnData = {
  name: string
  position: Vector3
  /** Virtual-space radius. Models are authored at radius 1; this sets true simulated size. */
  radius: number
}

export function createPlanet(modelPath: string, data: PlanetSpawnData): Entity {
  const entity = engine.addEntity()

  // Models must be origin-centered with radius 1. Baked glTF node translations get multiplied
  // by Transform.scale and will fling the mesh off-screen once PlanetSystem applies apparent size.
  GltfContainer.create(entity, { src: modelPath })
  Transform.create(entity, { position: data.position })
  PlanetData.create(entity, {
    name: data.name,
    position: data.position,
    radius: data.radius
  })

  return entity
}
