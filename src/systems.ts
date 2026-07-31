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
 * Each frame, reproject every planet onto the fixed enclosing sphere at scene center.
 * Rays start at the local player (inside the sphere) and travel in the virtual
 * celestial direction until they hit the shell.
 */
export function PlanetSystem(_dt: number) {
  // Step 1: read the ship's virtual pose (not the fixed scene Transform).
  const virtualPosition = shipVirtualPosition
  const virtualRotation = shipVirtualRotation

  // Step 2: ray origin is the player; sphere stays fixed at the ship / scene anchor.
  let rayOrigin = SCENE_SHIP_POSITION
  if (Transform.has(engine.PlayerEntity)) {
    rayOrigin = Transform.get(engine.PlayerEntity).position
  }

  // Step 3: visit every planet that has both simulation data and a scene Transform.
  for (const [entity, planet] of engine.getEntitiesWith(PlanetData, Transform)) {
    // Step 4: get a writable Transform so we can move/scale the visible planet model.
    const transform = Transform.getMutable(entity)

    // Step 5: player → celestial direction → intersection with the fixed sphere.
    const projection = projectVirtualBodyToSceneSphere(
      planet.position,
      virtualPosition,
      virtualRotation,
      SCENE_SHIP_POSITION,
      rayOrigin,
      ENCLOSING_SPHERE_RADIUS,
      planet.radius
    )

    // Step 6: apply projected pose (center on the fixed enclosing sphere).
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
const SPEED = 0.1
/** Bank into the turn (degrees). lookRotation makes local +X outward, so negative roll tips inward. */
const INWARD_BANK_DEGREES = -6

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

  // Step 3: face along the circle tangent, then apply a slight inward roll (bank).
  const tangent = Vector3.create(-Math.sin(angle), 0, Math.cos(angle))
  const facing = Quaternion.lookRotation(tangent)
  const bank = Quaternion.fromAngleAxis(-INWARD_BANK_DEGREES, Vector3.Forward())
  const orientation = Quaternion.multiply(facing, bank)
  shipVirtualRotation.x = orientation.x
  shipVirtualRotation.y = orientation.y
  shipVirtualRotation.z = orientation.z
  shipVirtualRotation.w = orientation.w
}
