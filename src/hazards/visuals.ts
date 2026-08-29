import {
  Billboard,
  BillboardMode,
  ColliderLayer,
  engine,
  Entity,
  GltfContainer,
  InputAction,
  inputSystem,
  Material,
  MaterialTransparencyMode,
  MeshRenderer,
  PointerEventType,
  PrimaryPointerInfo,
  TextAlignMode,
  TextShape,
  Transform,
  VisibilityComponent
} from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
import { isMobile } from '@dcl/sdk/platform'
import {
  HAZARD_ASTEROID_MODEL_PATH,
  HAZARD_ASTEROID_POOL_SIZE,
  HAZARD_DESKTOP_AIM_CONE_HALF_ANGLE_DEGREES,
  HAZARD_IMPACT_DISTANCE,
  HAZARD_MOBILE_AIM_CONE_HALF_ANGLE_DEGREES,
  HAZARD_RADIUS,
  HAZARD_RAYCAST_MAX_DISTANCE,
  HAZARD_TARGET_COOLDOWN_SECONDS,
  HAZARD_TARGETING_COUNT_FONT_SIZE,
  HAZARD_TARGETING_COUNT_OFFSET,
  HAZARD_TARGETING_CROSSHAIR_TEXTURE_PATH,
  HAZARD_TARGETING_INDICATOR_SCALE,
  SIMULATION_MAX_DELTA_SECONDS
} from '../constants'
import { room } from '../networking/messages'
import { shipVirtualPosition } from '../ship'
import { AsteroidData, forgetAsteroidSpin } from '../spaceobjects/asteroids'
import { directionFromTo } from '../utilities'

type HazardVisuals = {
  entity: Entity
  targetingIndicator: Entity
  targetingCountLabel: Entity
}

const free: HazardVisuals[] = []

/** Client-only incoming asteroid. AsteroidSystem projects `AsteroidData.position`. */
function createHazardVisuals(): HazardVisuals {
  const entity = engine.addEntity()
  GltfContainer.create(entity, {
    src: HAZARD_ASTEROID_MODEL_PATH,
    visibleMeshesCollisionMask: ColliderLayer.CL_CUSTOM1,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE
  })
  Transform.create(entity, { position: Vector3.Zero() })
  AsteroidData.create(entity, {
    position: Vector3.Zero(),
    radius: HAZARD_RADIUS
  })
  VisibilityComponent.create(entity, { visible: false })

  // Default plane is 1×1; asteroid mesh extends ~1.35 from origin (~2.7 across).
  const targetingIndicator = engine.addEntity()
  Transform.create(targetingIndicator, {
    parent: entity,
    scale: Vector3.create(
      HAZARD_TARGETING_INDICATOR_SCALE,
      HAZARD_TARGETING_INDICATOR_SCALE,
      HAZARD_TARGETING_INDICATOR_SCALE
    )
  })
  MeshRenderer.setPlane(targetingIndicator)
  Billboard.create(targetingIndicator, { billboardMode: BillboardMode.BM_ALL })
  Material.setPbrMaterial(targetingIndicator, {
    texture: Material.Texture.Common({ src: HAZARD_TARGETING_CROSSHAIR_TEXTURE_PATH }),
    emissiveColor: Color3.Red(),
    emissiveIntensity: 1,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_TEST,
    alphaTest: 0.5,
    castShadows: false
  })
  VisibilityComponent.create(targetingIndicator, { visible: false })

  const targetingCountLabel = engine.addEntity()
  const labelScale = 1 / HAZARD_TARGETING_INDICATOR_SCALE
  Transform.create(targetingCountLabel, {
    parent: targetingIndicator,
    position: Vector3.clone(HAZARD_TARGETING_COUNT_OFFSET),
    scale: Vector3.create(labelScale, labelScale, labelScale)
  })
  TextShape.create(targetingCountLabel, {
    text: '',
    fontSize: HAZARD_TARGETING_COUNT_FONT_SIZE,
    textColor: Color4.Green(),
    outlineColor: Color4.Black(),
    outlineWidth: 0.08,
    textAlign: TextAlignMode.TAM_TOP_LEFT
  })
  VisibilityComponent.create(targetingCountLabel, { visible: false })

  return { entity, targetingIndicator, targetingCountLabel }
}

function acquireHazard(virtualPosition: Vector3, radius: number): HazardVisuals {
  const visuals = free.pop() ?? createHazardVisuals()
  const asteroid = AsteroidData.getMutable(visuals.entity)
  asteroid.position = Vector3.clone(virtualPosition)
  asteroid.radius = radius
  Transform.getMutable(visuals.entity).position = Vector3.clone(virtualPosition)
  VisibilityComponent.getMutable(visuals.entity).visible = true
  return visuals
}

function releaseHazard(visuals: HazardVisuals) {
  forgetAsteroidSpin(visuals.entity)
  VisibilityComponent.getMutable(visuals.entity).visible = false
  VisibilityComponent.getMutable(visuals.targetingIndicator).visible = false
  VisibilityComponent.getMutable(visuals.targetingCountLabel).visible = false
  TextShape.getMutable(visuals.targetingCountLabel).text = ''
  free.push(visuals)
}

type SpawnedHazard = {
  hazardId: number
  encounterId: string
  entity: Entity
  targetingIndicator: Entity
  targetingCountLabel: Entity
  targetCount: number
  start: Vector3
  end: Vector3
  flightTime: number
  elapsed: number
}

const spawned: SpawnedHazard[] = []

/** Visit every live client-side hazard. Used by ship lasers for fire rate and aim. */
export function forEachLiveHazard(visitor: (entity: Entity, targetCount: number) => void): void {
  for (const hazard of spawned) {
    visitor(hazard.entity, hazard.targetCount)
  }
}

function virtualFlightPath(spawnPosition: Vector3): { start: Vector3; end: Vector3 } {
  const dir = directionFromTo(shipVirtualPosition, spawnPosition)
  const start = Vector3.clone(spawnPosition)
  const end = Vector3.add(shipVirtualPosition, Vector3.scale(dir, HAZARD_IMPACT_DISTANCE))
  return { start, end }
}

function applyVirtualPosition(hazard: SpawnedHazard) {
  const duration = hazard.flightTime
  const u = duration <= 1e-6 ? 1 : Math.min(1, hazard.elapsed / duration)
  const asteroid = AsteroidData.getMutable(hazard.entity)
  asteroid.position = Vector3.lerp(hazard.start, hazard.end, u)
}

function despawnHazard(hazardId: number) {
  for (let i = spawned.length - 1; i >= 0; i--) {
    if (spawned[i].hazardId !== hazardId) continue
    releaseHazard(spawned[i])
    spawned.splice(i, 1)
    return
  }
}

export function despawnEncounter(encounterId: string) {
  for (let i = spawned.length - 1; i >= 0; i--) {
    if (spawned[i].encounterId !== encounterId) continue
    releaseHazard(spawned[i])
    spawned.splice(i, 1)
  }
}

export function despawnAllHazards() {
  for (const hazard of spawned) {
    releaseHazard(hazard)
  }
  spawned.length = 0
}

function HazardFlightSystem(dt: number) {
  const step = Math.min(dt, SIMULATION_MAX_DELTA_SECONDS)
  for (const hazard of spawned) {
    hazard.elapsed += step
    applyVirtualPosition(hazard)
  }
}

let targetCooldownRemaining = 0

const AIM_ANGLE_TIE_EPSILON = 1e-6

function requestHazardTarget(hazardId: number) {
  room.send('requestHazardTarget', { hazardId })
  targetCooldownRemaining = HAZARD_TARGET_COOLDOWN_SECONDS
  console.log(`[CLIENT] Requested target on hazard ${hazardId}`)
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

  for (const hazard of spawned) {
    if (!Transform.has(hazard.entity)) continue
    const transform = Transform.get(hazard.entity)
    const offset = Vector3.subtract(transform.position, origin)
    const radius = transform.scale.x
    const along = Vector3.dot(offset, axis)
    if (along + radius < 0) continue
    if (along - radius > HAZARD_RAYCAST_MAX_DISTANCE) continue

    const distSq = Vector3.lengthSquared(offset)
    const radialSq = Math.max(0, distSq - along * along)
    const coneRadius = Math.max(0, along) * tanHalf
    const allowed = coneRadius + radius
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

/** Desktop: camera origin + cursor world ray. Mobile: camera origin + camera forward. */
function targetingAim(): { origin: Vector3; axis: Vector3 } | undefined {
  if (!Transform.has(engine.CameraEntity)) return undefined
  const camera = Transform.get(engine.CameraEntity)
  const origin = camera.position

  if (isMobile()) {
    return {
      origin,
      axis: Vector3.rotate(Vector3.Forward(), camera.rotation)
    }
  }

  const axis = PrimaryPointerInfo.getOrCreateMutable(engine.RootEntity).worldRayDirection
  if (!axis) return undefined
  return { origin, axis }
}

function HazardTargetSystem(dt: number) {
  if (targetCooldownRemaining > 0) {
    targetCooldownRemaining = Math.max(0, targetCooldownRemaining - dt)
  }

  if (!inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN)) return
  if (targetCooldownRemaining > 0) return

  const aim = targetingAim()
  if (!aim) return

  const halfAngle = isMobile()
    ? HAZARD_MOBILE_AIM_CONE_HALF_ANGLE_DEGREES
    : HAZARD_DESKTOP_AIM_CONE_HALF_ANGLE_DEGREES
  const hazardId = pickHazardInAimCone(aim.origin, aim.axis, halfAngle)
  if (hazardId === undefined) return
  requestHazardTarget(hazardId)
}

export function setupHazardVisuals() {
  for (let i = 0; i < HAZARD_ASTEROID_POOL_SIZE; i++) {
    free.push(createHazardVisuals())
  }

  engine.addSystem(HazardFlightSystem)
  engine.addSystem(HazardTargetSystem)

  room.onMessage('notifyHazardSpawn', (data) => {
    if (spawned.some((h) => h.hazardId === data.hazardId)) return
    const path = virtualFlightPath(data.position)
    const visuals = acquireHazard(path.start, HAZARD_RADIUS)
    const hazard: SpawnedHazard = {
      hazardId: data.hazardId,
      encounterId: data.encounterId,
      entity: visuals.entity,
      targetingIndicator: visuals.targetingIndicator,
      targetingCountLabel: visuals.targetingCountLabel,
      targetCount: 0,
      start: path.start,
      end: path.end,
      flightTime: data.flightTime,
      elapsed: 0
    }
    spawned.push(hazard)
    applyVirtualPosition(hazard)
    console.log(`[CLIENT] Hazard ${data.hazardId} spawned for ${data.encounterId} (${data.flightTime}s)`)
  })

  room.onMessage('notifyHazardDestroyed', (data) => {
    const cause = data.hitShip ? 'hit ship' : 'shot'
    console.log(`[CLIENT] Hazard ${data.hazardId} destroyed (${cause})`)
    despawnHazard(data.hazardId)
  })

  room.onMessage('notifyHazardTargeted', (data) => {
    console.log(
      `[CLIENT] Hazard ${data.hazardId} targeted by ${data.playerAddress} (count ${data.targetCount})`
    )
    for (const hazard of spawned) {
      if (hazard.hazardId !== data.hazardId) continue
      hazard.targetCount = data.targetCount
      const locked = data.targetCount > 0
      TextShape.getMutable(hazard.targetingCountLabel).text = locked ? String(data.targetCount) : ''
      VisibilityComponent.getMutable(hazard.targetingIndicator).visible = locked
      VisibilityComponent.getMutable(hazard.targetingCountLabel).visible = locked
      return
    }
  })
}
