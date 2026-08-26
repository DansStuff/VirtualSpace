import { engine, Entity, Schemas, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  ASTEROID_ENCLOSING_SPHERE_RADIUS,
  HAZARD_SPIN_DEGREES_PER_SECOND,
  SCENE_SHIP_POSITION
} from '../constants'
import { shipVirtualPosition, shipVirtualRotation } from '../ship'
import { projectVirtualBodyToSceneSphere } from './projection'

/**
 * Virtual-space asteroid body. Projected like planets, but onto ASTEROID_ENCLOSING_SPHERE_RADIUS.
 * Models are authored at radius 1; `radius` is the virtual size for apparent scale.
 */
export const AsteroidData = engine.defineComponent('AsteroidData', {
  position: Schemas.Vector3,
  radius: Schemas.Float
})

type AsteroidSpinState = { axis: Vector3; angle: number }
const asteroidSpinState = new Map<Entity, AsteroidSpinState>()

function randomUnitAxis(): Vector3 {
  const theta = Math.random() * Math.PI * 2
  const z = Math.random() * 2 - 1
  const radius = Math.sqrt(1 - z * z)
  return Vector3.create(radius * Math.cos(theta), radius * Math.sin(theta), z)
}

/**
 * Each frame, reproject asteroids like planets onto a smaller enclosing sphere,
 * then apply a slow local tumble on top of the celestial orientation.
 */
export function AsteroidSystem(dt: number) {
  const virtualPosition = shipVirtualPosition
  const virtualRotation = shipVirtualRotation

  let rayOrigin = SCENE_SHIP_POSITION
  if (Transform.has(engine.PlayerEntity)) {
    rayOrigin = Transform.get(engine.PlayerEntity).position
  }

  for (const [entity, asteroid] of engine.getEntitiesWith(AsteroidData, Transform)) {
    const transform = Transform.getMutable(entity)

    const projection = projectVirtualBodyToSceneSphere(
      asteroid.position,
      virtualPosition,
      virtualRotation,
      SCENE_SHIP_POSITION,
      rayOrigin,
      ASTEROID_ENCLOSING_SPHERE_RADIUS,
      asteroid.radius
    )

    let spin = asteroidSpinState.get(entity)
    if (!spin) {
      spin = { axis: randomUnitAxis(), angle: 0 }
      asteroidSpinState.set(entity, spin)
    }
    spin.angle += dt * HAZARD_SPIN_DEGREES_PER_SECOND
    const tumble = Quaternion.fromAngleAxis(spin.angle, spin.axis)

    transform.position = projection.position
    transform.rotation = Quaternion.multiply(projection.rotation, tumble)
    transform.scale = Vector3.create(projection.scale, projection.scale, projection.scale)
  }
}

export function forgetAsteroidSpin(entity: Entity) {
  asteroidSpinState.delete(entity)
}

/**
 * Tags every scene-hierarchy entity named Asteroid.gltf with AsteroidData.
 * Assigns a virtual-space pose near the planet centroid so AsteroidSystem can project it.
 */
/*
export function setupAsteroids(): void {
  const centroid = routePlanetCentroid(SHIP_ROUTE)
  let asteroidIndex = 0
  for (const [entity, name] of engine.getEntitiesWith(Name, Transform)) {
    if (name.value !== EntityNames.Asteroid_gltf || AsteroidData.has(entity)) {
      continue
    }

    const yaw = asteroidIndex * 2.4
    const position = Vector3.create(
      centroid.x + Math.cos(yaw) * 40,
      centroid.y + ((asteroidIndex % 3) - 1) * 8,
      centroid.z + Math.sin(yaw) * 40
    )
    AsteroidData.create(entity, {
      position,
      radius: 4
    })
    asteroidIndex++
  }
}
*/
