import { engine, Entity, Schemas, Transform, VisibilityComponent } from '@dcl/sdk/ecs'
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
    if (VisibilityComponent.has(entity) && !VisibilityComponent.get(entity).visible) continue

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
