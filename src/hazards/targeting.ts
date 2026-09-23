import { engine, InputAction, inputSystem, PointerEventType, PrimaryPointerInfo, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { playGlobalSound } from '../audio/global'
import {
  HAZARD_AIM_CONE_HALF_ANGLE_DEGREES,
  HAZARD_RAYCAST_MAX_DISTANCE,
  HAZARD_SELECT_SOUND_PATH,
  HAZARD_TARGET_COOLDOWN_SECONDS
} from '../constants'
import { room } from '../networking/messages'
import { isTurretOccupied } from '../sceneObjects'
import { applyReticule } from './reticule'
import type { SpawnedHazard } from './visuals'

const AIM_ANGLE_TIE_EPSILON = 1e-6

let hazards: readonly SpawnedHazard[] = []

/** Hazard this client last asked the server to lock. Set before the server confirms. */
let localTargetId: number | undefined
let targetCooldownRemaining = 0

export function clearLocalTarget(): void {
  localTargetId = undefined
}

export function clearLocalTargetIf(hazardId: number): void {
  if (localTargetId === hazardId) {
    localTargetId = undefined
  }
}

export function applyTargetingAppearance(hazard: SpawnedHazard): void {
  applyReticule(hazard.visuals.reticule, hazard.targeters, hazard.hazardId === localTargetId)
}

function findHazard(hazardId: number): SpawnedHazard | undefined {
  return hazards.find((hazard) => hazard.hazardId === hazardId)
}

function requestHazardTarget(hazardId: number) {
  if (hazardId === localTargetId) return
  const previousId = localTargetId
  localTargetId = hazardId
  room.send('requestHazardTarget', { hazardId })
  targetCooldownRemaining = HAZARD_TARGET_COOLDOWN_SECONDS
  playGlobalSound(HAZARD_SELECT_SOUND_PATH)
  console.log(`[CLIENT] Requested target on hazard ${hazardId}`)
  if (previousId !== undefined) {
    const previous = findHazard(previousId)
    if (previous) applyTargetingAppearance(previous)
  }
  const next = findHazard(hazardId)
  if (next) applyTargetingAppearance(next)
}

/**
 * Among live hazards whose scene-space bounding sphere overlaps the aim cone,
 * pick the center closest to the axis (then the nearer one).
 */
function pickHazardInAimCone(origin: Vector3, axis: Vector3, halfAngleDegrees: number): number | undefined {
  const tanHalf = Math.tan(halfAngleDegrees * (Math.PI / 180))
  let bestId: number | undefined
  let bestCos = -Infinity
  let bestAlong = Infinity

  for (const hazard of hazards) {
    const entity = hazard.visuals.entity
    if (!Transform.has(entity)) continue
    const transform = Transform.get(entity)
    const offset = Vector3.subtract(transform.position, origin)
    // ProjectedBody scales a radius-1 mesh uniformly, so scale.x is the scene-space radius.
    const sceneRadius = transform.scale.x
    const along = Vector3.dot(offset, axis)
    if (along + sceneRadius < 0) continue
    if (along - sceneRadius > HAZARD_RAYCAST_MAX_DISTANCE) continue

    const distSq = Vector3.lengthSquared(offset)
    const radialSq = Math.max(0, distSq - along * along)
    const coneRadius = Math.max(0, along) * tanHalf
    const allowed = coneRadius + sceneRadius
    if (radialSq > allowed * allowed) continue

    const dist = Math.sqrt(distSq)
    const cosAngle = dist < 1e-6 ? 1 : along / dist
    const closerOnAxis = along < bestAlong
    const tighterAim = cosAngle > bestCos + AIM_ANGLE_TIE_EPSILON
    const aimTie = Math.abs(cosAngle - bestCos) <= AIM_ANGLE_TIE_EPSILON
    if (tighterAim || (aimTie && closerOnAxis)) {
      bestCos = cosAngle
      bestAlong = along
      bestId = hazard.hazardId
    }
  }

  return bestId
}

/** Camera origin + pointer world ray (mouse or tap). */
function targetingAim(): { origin: Vector3; axis: Vector3 } | undefined {
  if (!Transform.has(engine.CameraEntity)) return undefined
  const origin = Transform.get(engine.CameraEntity).position
  const axis = PrimaryPointerInfo.getOrCreateMutable(engine.RootEntity).worldRayDirection
  if (!axis) return undefined
  return { origin, axis }
}

function HazardTargetSystem(dt: number) {
  // Cooldown runs on real frame time, not the clamped simulation step.
  if (targetCooldownRemaining > 0) {
    targetCooldownRemaining = Math.max(0, targetCooldownRemaining - dt)
  }

  if (!isTurretOccupied()) return
  if (!inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN)) return
  if (targetCooldownRemaining > 0) return

  const aim = targetingAim()
  if (!aim) return

  const hazardId = pickHazardInAimCone(aim.origin, aim.axis, HAZARD_AIM_CONE_HALF_ANGLE_DEGREES)
  if (hazardId === undefined) return
  requestHazardTarget(hazardId)
}

/** `liveHazards` must be the live array, mutated in place, not a copy. */
export function setupHazardTargeting(liveHazards: readonly SpawnedHazard[]): void {
  hazards = liveHazards
  engine.addSystem(HazardTargetSystem)
}
