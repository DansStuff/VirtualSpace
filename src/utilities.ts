import { engine, InputAction, inputSystem, PointerEventType } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { SCENE_SHIP_POSITION } from './ship'

/**
 * Returns the conjugate of a quaternion (-x, -y, -z, w).
 * For unit quaternions (the kind used for rotations), the conjugate is the inverse.
 */
export function conjugateQuaternion(rotation: Quaternion): Quaternion.Mutable {
  return Quaternion.create(-rotation.x, -rotation.y, -rotation.z, rotation.w)
}

/**
 * Rotates a vector by the inverse of a rotation quaternion.
 * Useful for taking a world-space direction into the ship's local frame.
 */
export function rotateByInverse(vector: Vector3, rotation: Quaternion): Vector3.Mutable {
  // Step 1: invert the rotation (conjugate for unit quaternions).
  const inverse = conjugateQuaternion(rotation)
  // Step 2: apply that inverse rotation to the vector.
  return Vector3.rotate(vector, inverse)
}

/**
 * Returns the unit direction from `from` toward `to`.
 * If the points are nearly the same, returns `fallback` so callers never get a zero vector.
 */
export function directionFromTo(
  from: Vector3,
  to: Vector3,
  fallback: Vector3 = Vector3.Forward()
): Vector3.Mutable {
  // Step 1: vector pointing from the ship toward the planet in virtual space.
  const offset = Vector3.subtract(to, from)
  // Step 2: measure how far apart they are.
  const length = Vector3.length(offset)
  // Step 3: if they coincide, there is no meaningful direction — use the fallback.
  if (length < 1e-8) {
    return Vector3.clone(fallback)
  }
  // Step 4: normalize to unit length (direction only, no distance).
  return Vector3.scale(offset, 1 / length)
}

/**
 * Computes Transform scale for a planet model authored at radius 1.
 *
 * In virtual space the planet has radius `virtualRadius`. On the enclosing sphere
 * we preserve its approximate angular size: scale ≈ virtualRadius * sphereRadius / distance.
 */
export function apparentScaleOnSphere(
  distance: number,
  sphereRadius: number,
  virtualRadius: number,
  minScale: number = 0.01,
  maxScale: number = 40
): number {
  // Step 1: avoid division by zero when the ship is on top of the body.
  if (distance < 1e-8) {
    return maxScale
  }
  // Step 2: angular-size falloff — larger virtualRadius and/or nearer distance → bigger on screen.
  //         Because the mesh itself has radius 1, this scale IS the apparent scene radius.
  const scale = virtualRadius * (sphereRadius / distance)
  // Step 3: clamp so planets never vanish or explode in size.
  return Math.min(maxScale, Math.max(minScale, scale))
}

export type SphereProjection = {
  position: Vector3.Mutable
  rotation: Quaternion.Mutable
  scale: number
  distance: number
}

/**
 * Scene-space orientation for a body that is fixed in virtual space (no spin).
 *
 * Vertices are transformed into the ship's frame by inverse(shipRotation), same as
 * position. As the ship orbits/turns, this rotation changes so the viewer sees
 * different sides of the stationary planet — the planet itself is not spinning.
 */
export function stationaryBodySceneRotation(shipVirtualRotation: Quaternion): Quaternion.Mutable {
  return conjugateQuaternion(shipVirtualRotation)
}

/**
 * Projects a body from virtual space onto the enclosing scene sphere around the ship.
 *
 * The ship model stays fixed in the scene; only this projection moves, creating the
 * illusion that the ship is flying through a universe of distant planets.
 */
export function projectVirtualBodyToSceneSphere(
  bodyVirtualPosition: Vector3,
  shipVirtualPosition: Vector3,
  shipVirtualRotation: Quaternion,
  shipScenePosition: Vector3,
  sphereRadius: number,
  virtualRadius: number
): SphereProjection {
  // Step 1: world-space offset from the ship to the body in virtual coordinates.
  const offset = Vector3.subtract(bodyVirtualPosition, shipVirtualPosition)
  // Step 2: true virtual distance (used for scale / depth illusion).
  const distance = Vector3.length(offset)
  // Step 3: unit direction from ship → body in virtual world space.
  const worldDirection = directionFromTo(shipVirtualPosition, bodyVirtualPosition)
  // Step 4: rotate that direction into the ship's local frame so ship yaw/pitch/roll
  //         moves planets around the enclosing sphere (not just translation).
  const localDirection = rotateByInverse(worldDirection, shipVirtualRotation)
  // Step 5: place the body on the enclosing sphere around the stationary scene ship.
  const position = Vector3.add(shipScenePosition, Vector3.scale(localDirection, sphereRadius))
  // Step 6: orient the mesh in the ship's frame. Planet has no virtual spin — only the
  //         ship's changing viewpoint makes different faces appear toward the camera.
  const rotation = stationaryBodySceneRotation(shipVirtualRotation)
  // Step 7: scale from virtual radius + distance. Models are radius 1, so scale equals
  //         the apparent radius on the enclosing sphere.
  const scale = apparentScaleOnSphere(distance, sphereRadius, virtualRadius)

  return { position, rotation, scale, distance }
}

/**
 * Debug helper: teleport the local player back to the ship anchor (40, 40, 40).
 *
 * Decentraland does not expose letter keys (including "T") as InputActions, so this
 * listens for IA_ACTION_3 — the "1" key on desktop.
 */
export function setupDebugTeleportToShip() {
  engine.addSystem(function debugTeleportToShipSystem() {
    if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) {
      void movePlayerTo({ newRelativePosition: SCENE_SHIP_POSITION })
    }
  })
}
