import { engine, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { PlanetData } from './components'
import {
  ENCLOSING_SPHERE_RADIUS,
  SCENE_SHIP_POSITION,
  shipVirtualPosition,
  shipVirtualRotation
} from './ship'
import { projectVirtualBodyToSceneSphere } from './utilities'

/**
 * Each frame, reproject every planet onto the enclosing sphere around the stationary
 * ship model. Virtual ship position and rotation both affect where planets appear.
 */
export function PlanetSystem(_dt: number) {
  // Step 1: read the ship's virtual pose (not the fixed scene Transform).
  const virtualPosition = shipVirtualPosition
  const virtualRotation = shipVirtualRotation

  // Step 2: visit every planet that has both simulation data and a scene Transform.
  for (const [entity, planet] of engine.getEntitiesWith(PlanetData, Transform)) {
    // Step 3: get a writable Transform so we can move/scale the visible planet model.
    const transform = Transform.getMutable(entity)

    // Step 4: project this planet's virtual coordinates onto the enclosing sphere.
    //         - position on the sphere comes from direction relative to the ship
    //         - rotation is inverse(ship) so a non-spinning planet shows the correct face
    //         - scale uses virtual radius + distance (models are authored at radius 1)
    const projection = projectVirtualBodyToSceneSphere(
      planet.position,
      virtualPosition,
      virtualRotation,
      SCENE_SHIP_POSITION,
      ENCLOSING_SPHERE_RADIUS,
      planet.radius
    )

    // Step 5: apply the projected scene pose to the planet entity.
    transform.position = projection.position
    transform.rotation = projection.rotation
    transform.scale = Vector3.create(projection.scale, projection.scale, projection.scale)
  }
}

// Virtual orbit used only for testing ship motion / planet parallax.
// CENTER is the orbit's hub — a planet sitting exactly there stays forever on the ship's
// local ±X axis while we face the tangent, which makes scene Y/Z look "stuck" at 40.
const RADIUS = 10000
const CENTER = { x: 0, y: 0, z: 0 }
const SPEED = 0.15

let angle = 0

/**
 * Animates the ship's *virtual* pose. The visible ship model stays at (40, 40, 40);
 * planets slide around the enclosing sphere in response to this motion.
 */
export function TestShipAnimator(dt: number) {
  // Step 1: advance the orbit angle in virtual space.
  angle += SPEED * dt

  // Step 2: place the virtual ship on a large horizontal circle around CENTER.
  shipVirtualPosition.x = CENTER.x + Math.cos(angle) * RADIUS
  shipVirtualPosition.y = CENTER.y
  shipVirtualPosition.z = CENTER.z + Math.sin(angle) * RADIUS

  // Step 3: face along the circle tangent so yaw changes each frame.
  //         Direction ship→CENTER is always perpendicular to this tangent, so a planet
  //         at CENTER projects to a fixed local side (±X) on the enclosing sphere.
  const tangent = Vector3.create(-Math.sin(angle), 0, Math.cos(angle))
  const facing = Quaternion.lookRotation(tangent)
  shipVirtualRotation.x = facing.x
  shipVirtualRotation.y = facing.y
  shipVirtualRotation.z = facing.z
  shipVirtualRotation.w = facing.w
}
