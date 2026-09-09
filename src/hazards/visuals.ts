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
import {
  HAZARD_AIM_CONE_HALF_ANGLE_DEGREES,
  HAZARD_ASTEROID_MODEL_PATH,
  HAZARD_ASTEROID_POOL_SIZE,
  HAZARD_HIT_SHIP_SOUND_PATH,
  HAZARD_IMPACT_DISTANCE,
  HAZARD_RADIUS,
  HAZARD_RAYCAST_MAX_DISTANCE,
  HAZARD_SELECT_SOUND_PATH,
  HAZARD_TARGET_COOLDOWN_SECONDS,
  HAZARD_TARGETING_CROSSHAIR_TEXTURE_PATH,
  HAZARD_TARGETING_INDICATOR_SCALE,
  HAZARD_TARGETING_LOCKED_FONT_SIZE,
  HAZARD_TARGETING_LOCKED_OFFSET,
  HAZARD_TARGETING_PORTRAIT_COUNT,
  HAZARD_TARGETING_PORTRAIT_RADIUS,
  HAZARD_TARGETING_PORTRAIT_SCALE,
  HAZARD_TARGETING_PORTRAIT_START_ANGLE_DEGREES,
  HAZARD_TARGETING_PORTRAIT_STEP_DEGREES,
  HAZARD_TARGETING_PORTRAIT_Z,
  SIMULATION_MAX_DELTA_SECONDS
} from '../constants'
import { playGlobalSound } from '../audio/global'
import { room } from '../networking/messages'
import { isTurretOccupied } from '../sceneObjects'
import { shipVirtualPosition } from '../ship'
import { AsteroidData, forgetAsteroidSpin } from '../spaceobjects/asteroids'
import { directionFromTo } from '../utilities'

type HazardVisuals = {
  entity: Entity
  targetingIndicator: Entity
  targetingLockedLabel: Entity
  portraitSlots: Entity[]
}

type SpawnedHazard = {
  hazardId: number
  encounterId: string
  entity: Entity
  targetingIndicator: Entity
  targetingLockedLabel: Entity
  portraitSlots: Entity[]
  targeters: string[]
  start: Vector3
  end: Vector3
  flightTime: number
  elapsed: number
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

  const labelScale = 1 / HAZARD_TARGETING_INDICATOR_SCALE
  const targetingLockedLabel = engine.addEntity()
  Transform.create(targetingLockedLabel, {
    parent: targetingIndicator,
    position: Vector3.clone(HAZARD_TARGETING_LOCKED_OFFSET),
    scale: Vector3.create(labelScale, labelScale, labelScale)
  })
  TextShape.create(targetingLockedLabel, {
    text: 'Target Locked',
    fontSize: HAZARD_TARGETING_LOCKED_FONT_SIZE,
    textColor: Color4.Green(),
    outlineColor: Color4.Black(),
    outlineWidth: 0.4,
    textAlign: TextAlignMode.TAM_BOTTOM_CENTER
  })
  VisibilityComponent.create(targetingLockedLabel, { visible: false })

  const portraitSlots: Entity[] = []
  for (let i = 0; i < HAZARD_TARGETING_PORTRAIT_COUNT; i++) {
    portraitSlots.push(createPortraitSlot(targetingIndicator, i))
  }

  return { entity, targetingIndicator, targetingLockedLabel, portraitSlots }
}

function portraitPosition(index: number): Vector3 {
  const angle =
    (HAZARD_TARGETING_PORTRAIT_START_ANGLE_DEGREES + index * HAZARD_TARGETING_PORTRAIT_STEP_DEGREES) *
    (Math.PI / 180)
  return Vector3.create(
    Math.cos(angle) * HAZARD_TARGETING_PORTRAIT_RADIUS,
    Math.sin(angle) * HAZARD_TARGETING_PORTRAIT_RADIUS,
    HAZARD_TARGETING_PORTRAIT_Z
  )
}

function createPortraitSlot(parent: Entity, index: number): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, {
    parent,
    position: portraitPosition(index),
    scale: Vector3.create(
      HAZARD_TARGETING_PORTRAIT_SCALE,
      HAZARD_TARGETING_PORTRAIT_SCALE,
      HAZARD_TARGETING_PORTRAIT_SCALE
    )
  })
  MeshRenderer.setPlane(entity)
  Material.setPbrMaterial(entity, {
    emissiveColor: Color3.White(),
    emissiveIntensity: 1,
    castShadows: false
  })
  VisibilityComponent.create(entity, { visible: false })
  return entity
}

function hidePortraitSlots(slots: Entity[]) {
  for (const slot of slots) {
    VisibilityComponent.getMutable(slot).visible = false
  }
}

function stripPortraitMaterials(slots: Entity[]) {
  for (const slot of slots) {
    if (Material.has(slot)) Material.deleteFrom(slot)
  }
}

function applyTargeterPortraits(hazard: SpawnedHazard) {
  const { targeters, portraitSlots } = hazard
  for (let i = 0; i < portraitSlots.length; i++) {
    const slot = portraitSlots[i]
    const address = targeters[i]
    if (!address) {
      VisibilityComponent.getMutable(slot).visible = false
      if (Material.has(slot)) Material.deleteFrom(slot)
      continue
    }
    const portrait = Material.Texture.Avatar({ userId: address })
    Material.setPbrMaterial(slot, {
      texture: portrait,
      emissiveTexture: portrait,
      emissiveColor: Color3.White(),
      emissiveIntensity: 1,
      castShadows: false
    })
    VisibilityComponent.getMutable(slot).visible = true
  }
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
  hidePortraitSlots(visuals.portraitSlots)
  VisibilityComponent.getMutable(visuals.targetingIndicator).visible = false
  VisibilityComponent.getMutable(visuals.targetingLockedLabel).visible = false
  VisibilityComponent.getMutable(visuals.entity).visible = false
  try {
    stripPortraitMaterials(visuals.portraitSlots)
  } finally {
    free.push(visuals)
  }
}

const spawned: SpawnedHazard[] = []

let lastRequestedHazardId: number | undefined
let targetCooldownRemaining = 0

/** Visit every live client-side hazard. Used by ship lasers for fire rate and aim. */
export function forEachLiveHazard(visitor: (entity: Entity, targetCount: number) => void): void {
  for (const hazard of spawned) {
    visitor(hazard.entity, hazard.targeters.length)
  }
}

function findSpawnedHazard(hazardId: number): SpawnedHazard | undefined {
  return spawned.find((hazard) => hazard.hazardId === hazardId)
}

function clearLastRequestedIf(hazardId: number) {
  if (lastRequestedHazardId === hazardId) {
    lastRequestedHazardId = undefined
  }
}

function applyTargetingAppearance(hazard: SpawnedHazard) {
  const isLocal = hazard.hazardId === lastRequestedHazardId
  const locked = hazard.targeters.length > 0 || isLocal
  VisibilityComponent.getMutable(hazard.targetingIndicator).visible = locked
  VisibilityComponent.getMutable(hazard.targetingLockedLabel).visible = isLocal
  applyTargeterPortraits(hazard)
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
  clearLastRequestedIf(hazardId)
  for (let i = spawned.length - 1; i >= 0; i--) {
    if (spawned[i].hazardId !== hazardId) continue
    const hazard = spawned[i]
    spawned.splice(i, 1)
    releaseHazard(hazard)
    return
  }
}

export function despawnEncounter(encounterId: string) {
  for (let i = spawned.length - 1; i >= 0; i--) {
    if (spawned[i].encounterId !== encounterId) continue
    const hazard = spawned[i]
    clearLastRequestedIf(hazard.hazardId)
    spawned.splice(i, 1)
    releaseHazard(hazard)
  }
}

export function despawnAllHazards() {
  lastRequestedHazardId = undefined
  const hazards = spawned.splice(0, spawned.length)
  for (const hazard of hazards) {
    releaseHazard(hazard)
  }
}

function HazardFlightSystem(dt: number) {
  const step = Math.min(dt, SIMULATION_MAX_DELTA_SECONDS)
  for (const hazard of spawned) {
    hazard.elapsed += step
    applyVirtualPosition(hazard)
  }
}

const AIM_ANGLE_TIE_EPSILON = 1e-6

function requestHazardTarget(hazardId: number) {
  if (hazardId === lastRequestedHazardId) return
  const previousId = lastRequestedHazardId
  lastRequestedHazardId = hazardId
  room.send('requestHazardTarget', { hazardId })
  targetCooldownRemaining = HAZARD_TARGET_COOLDOWN_SECONDS
  playGlobalSound(HAZARD_SELECT_SOUND_PATH)
  console.log(`[CLIENT] Requested target on hazard ${hazardId}`)
  if (previousId !== undefined) {
    const previous = findSpawnedHazard(previousId)
    if (previous) applyTargetingAppearance(previous)
  }
  const next = findSpawnedHazard(hazardId)
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

/** Camera origin + pointer world ray (mouse or tap). */
function targetingAim(): { origin: Vector3; axis: Vector3 } | undefined {
  if (!Transform.has(engine.CameraEntity)) return undefined
  const origin = Transform.get(engine.CameraEntity).position
  const axis = PrimaryPointerInfo.getOrCreateMutable(engine.RootEntity).worldRayDirection
  if (!axis) return undefined
  return { origin, axis }
}

function HazardTargetSystem(dt: number) {
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
      targetingLockedLabel: visuals.targetingLockedLabel,
      portraitSlots: visuals.portraitSlots,
      targeters: [],
      start: path.start,
      end: path.end,
      flightTime: data.flightTime,
      elapsed: 0
    }
    spawned.push(hazard)
    applyVirtualPosition(hazard)
    applyTargetingAppearance(hazard)
    console.log(`[CLIENT] Hazard ${data.hazardId} spawned for ${data.encounterId} (${data.flightTime}s)`)
  })

  room.onMessage('notifyHazardDestroyed', (data) => {
    const cause = data.hitShip ? 'hit ship' : 'shot'
    console.log(`[CLIENT] Hazard ${data.hazardId} destroyed (${cause})`)
    if (data.hitShip) {
      playGlobalSound(HAZARD_HIT_SHIP_SOUND_PATH)
    }
    despawnHazard(data.hazardId)
  })

  room.onMessage('notifyHazardTargeted', (data) => {
    console.log(`[CLIENT] Hazard ${data.hazardId} targeted by [${data.targeters.join(', ')}]`)
    const hazard = findSpawnedHazard(data.hazardId)
    if (!hazard) return
    hazard.targeters = data.targeters
    applyTargetingAppearance(hazard)
  })
}
