import { engine, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { PlanetData } from './components'
import {
  ENCLOSING_SPHERE_RADIUS,
  FIGURE8_MIDPOINT,
  FIGURE8_SCALE,
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

// Figure-8 (Bernoulli lemniscate) test path with foci at FOCUS_A / FOCUS_B.
const SPEED = 0.2

let pathT = 0

/** Bernoulli lemniscate in XZ, centered on FIGURE8_MIDPOINT, foci at FOCUS_A/B. */
function lemniscatePosition(t: number): Vector3.Mutable {
  const sinT = Math.sin(t)
  const cosT = Math.cos(t)
  const denom = 1 + sinT * sinT
  return Vector3.create(
    FIGURE8_MIDPOINT.x + (FIGURE8_SCALE * cosT) / denom,
    FIGURE8_MIDPOINT.y,
    FIGURE8_MIDPOINT.z + (FIGURE8_SCALE * sinT * cosT) / denom
  )
}

/**
 * Animates the ship's *virtual* pose along a figure-8 around the two test planets.
 * The visible ship model stays at (40, 40, 40).
 */
export function TestShipAnimator(dt: number) {
  // Step 1: advance the path parameter.
  pathT += SPEED * dt

  // Step 2: place the virtual ship on the lemniscate.
  const position = lemniscatePosition(pathT)
  shipVirtualPosition.x = position.x
  shipVirtualPosition.y = position.y
  shipVirtualPosition.z = position.z

  // Step 3: face along the path tangent only (no bank — nearest-focus roll flips caused jumps).
  const ahead = lemniscatePosition(pathT + 0.01)
  const tangent = Vector3.normalize(Vector3.subtract(ahead, position))
  const facing = Quaternion.lookRotation(tangent)
  shipVirtualRotation.x = facing.x
  shipVirtualRotation.y = facing.y
  shipVirtualRotation.z = facing.z
  shipVirtualRotation.w = facing.w
}
