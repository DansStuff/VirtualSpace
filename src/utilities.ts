import { engine, InputAction, inputSystem, PointerEventType } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { CELESTIAL_SPHERE_INSET, ENCLOSING_SPHERE_RADIUS, SCENE_SHIP_POSITION } from './ship'

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
 * Angular radius (radians) of a virtual body as seen from the ship.
 * Uses the sphere relation sin(α) = radius / distance when the body is not engulfing.
 */
export function virtualAngularRadius(virtualRadius: number, virtualDistance: number): number {
  if (virtualDistance < 1e-8) {
    return Math.PI / 2
  }
  const ratio = virtualRadius / virtualDistance
  if (ratio >= 1) {
    return Math.PI / 2
  }
  return Math.asin(ratio)
}

/**
 * Transform scale for a radius-1 mesh so it subtends `angularRadius` at
 * `distanceFromViewer` (player → body center on the shell).
 *
 * scale = distance * sin(α). Same camera FOV (e.g. 50°) views virtual and scene
 * space, so matching world angular size keeps on-screen size stable as the player walks.
 */
export function scaleForAngularRadiusAtDistance(
  angularRadius: number,
  distanceFromViewer: number,
  minScale: number = 0.01,
  maxScale: number = ENCLOSING_SPHERE_RADIUS
): number {
  if (distanceFromViewer < 1e-8) {
    return maxScale
  }
  const scale = distanceFromViewer * Math.sin(angularRadius)
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
 * Forward hit distance along a ray against a sphere (player is assumed inside).
 * Solves |origin + t*dir - center|^2 = radius^2 and returns the t > 0 root.
 */
export function raySphereForwardDistance(
  rayOrigin: Vector3,
  rayDirection: Vector3,
  sphereCenter: Vector3,
  sphereRadius: number
): number {
  const originRelative = Vector3.subtract(rayOrigin, sphereCenter)
  const b = Vector3.dot(originRelative, rayDirection)
  const c = Vector3.lengthSquared(originRelative) - sphereRadius * sphereRadius
  const discriminant = b * b - c
  if (discriminant <= 0) {
    // Numerical fallback if the player is slightly outside / grazing.
    return Math.max(0.01, -b + sphereRadius)
  }
  return -b + Math.sqrt(discriminant)
}

/**
 * Projects a body from virtual space onto a *fixed* enclosing scene sphere.
 *
 * Direction comes from the virtual ship pose. The ray starts at the local player
 * (free to move inside the sphere) and hits the shell — so walking closer to one
 * side shortens that ray without moving the sphere itself.
 */
export function projectVirtualBodyToSceneSphere(
  bodyVirtualPosition: Vector3,
  shipVirtualPosition: Vector3,
  shipVirtualRotation: Quaternion,
  sphereCenter: Vector3,
  rayOrigin: Vector3,
  sphereRadius: number,
  virtualRadius: number
): SphereProjection {
  // Step 1: world-space offset from the ship to the body in virtual coordinates.
  const offset = Vector3.subtract(bodyVirtualPosition, shipVirtualPosition)
  // Step 2: true virtual distance (for apparent size).
  const distance = Vector3.length(offset)
  // Step 3: unit direction from ship → body in virtual world space.
  const worldDirection = directionFromTo(shipVirtualPosition, bodyVirtualPosition)
  // Step 4: express that direction in the ship's local / scene frame.
  const localDirection = rotateByInverse(worldDirection, shipVirtualRotation)
  // Step 5: desired angular size from virtual radius + virtual distance (FOV-independent).
  const angularRadius = virtualAngularRadius(virtualRadius, distance)
  // Step 6: cast from the player onto the fixed enclosing shell, then inset.
  const hitDistance = raySphereForwardDistance(
    rayOrigin,
    localDirection,
    sphereCenter,
    sphereRadius
  )
  const centerDistance = Math.max(0.01, hitDistance - CELESTIAL_SPHERE_INSET)
  const position = Vector3.add(rayOrigin, Vector3.scale(localDirection, centerDistance))
  // Step 7: scale the radius-1 model so it keeps that angular size at the *actual*
  //         player→body distance (shrinks when you walk closer, grows when farther).
  const scale = scaleForAngularRadiusAtDistance(
    angularRadius,
    centerDistance,
    0.01,
    sphereRadius
  )
  // Step 8: orient the mesh for a non-spinning body under the ship's viewpoint.
  const rotation = stationaryBodySceneRotation(shipVirtualRotation)

  return { position, rotation, scale, distance }
}

/**
 * Debug helper: teleport the local player back to the ship / enclosing-sphere center.
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
