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
  RaycastQueryType,
  raycastSystem,
  Transform,
  VisibilityComponent
} from '@dcl/sdk/ecs'
import { Color3, Vector3 } from '@dcl/sdk/math'
import { isMobile } from '@dcl/sdk/platform'
import {
  HAZARD_ASTEROID_MODEL_PATH,
  HAZARD_IMPACT_DISTANCE,
  HAZARD_MOBILE_AIM_CONE_HALF_ANGLE_DEGREES,
  HAZARD_RADIUS,
  HAZARD_RAYCAST_MAX_DISTANCE,
  HAZARD_TARGET_COOLDOWN_SECONDS,
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
}

/** Client-only incoming asteroid. AsteroidSystem projects `AsteroidData.position`. */
function spawnHazard(virtualPosition: Vector3, radius: number): HazardVisuals {
  const entity = engine.addEntity()
  GltfContainer.create(entity, {
    src: HAZARD_ASTEROID_MODEL_PATH,
    visibleMeshesCollisionMask: ColliderLayer.CL_CUSTOM1,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE
  })
  Transform.create(entity, { position: Vector3.clone(virtualPosition) })
  AsteroidData.create(entity, {
    position: Vector3.clone(virtualPosition),
    radius
  })

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

  return { entity, targetingIndicator }
}

type SpawnedHazard = {
  hazardId: number
  encounterId: string
  entity: Entity
  targetingIndicator: Entity
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
    forgetAsteroidSpin(spawned[i].entity)
    engine.removeEntityWithChildren(spawned[i].entity)
    spawned.splice(i, 1)
    return
  }
}

export function despawnEncounter(encounterId: string) {
  for (let i = spawned.length - 1; i >= 0; i--) {
    if (spawned[i].encounterId !== encounterId) continue
    forgetAsteroidSpin(spawned[i].entity)
    engine.removeEntityWithChildren(spawned[i].entity)
    spawned.splice(i, 1)
  }
}

export function despawnAllHazards() {
  for (const hazard of spawned) {
    forgetAsteroidSpin(hazard.entity)
    engine.removeEntityWithChildren(hazard.entity)
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

function hazardIdForEntity(entity: Entity): number | undefined {
  for (const hazard of spawned) {
    if (hazard.entity === entity) return hazard.hazardId
  }
  return undefined
}

function requestHazardTarget(hazardId: number) {
  room.send('requestHazardTarget', { hazardId })
  targetCooldownRemaining = HAZARD_TARGET_COOLDOWN_SECONDS
  console.log(`[CLIENT] Requested target on hazard ${hazardId}`)
}

/**
 * Among live hazards whose scene-space bounding sphere overlaps the aim cone,
 * pick the center closest to the axis (then the nearer one).
 */
function pickHazardInAimCone(origin: Vector3, axis: Vector3): number | undefined {
  const tanHalf = Math.tan(HAZARD_MOBILE_AIM_CONE_HALF_ANGLE_DEGREES * (Math.PI / 180))
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

/** Desktop: cursor ray. Mobile: camera forward (crosshair / interaction button). */
function targetingRayDirection(): Vector3 | undefined {
  if (isMobile()) {
    if (!Transform.has(engine.CameraEntity)) return undefined
    return Vector3.rotate(Vector3.Forward(), Transform.get(engine.CameraEntity).rotation)
  }
  return PrimaryPointerInfo.getOrCreateMutable(engine.RootEntity).worldRayDirection
}

function HazardTargetSystem(dt: number) {
  if (targetCooldownRemaining > 0) {
    targetCooldownRemaining = Math.max(0, targetCooldownRemaining - dt)
  }

  if (!inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN)) return
  if (targetCooldownRemaining > 0) return

  const direction = targetingRayDirection()
  if (!direction) return

  if (isMobile()) {
    if (!Transform.has(engine.CameraEntity)) return
    const origin = Transform.get(engine.CameraEntity).position
    const hazardId = pickHazardInAimCone(origin, direction)
    if (hazardId === undefined) return
    requestHazardTarget(hazardId)
    return
  }

  raycastSystem.registerGlobalDirectionRaycast(
    {
      entity: engine.CameraEntity,
      opts: {
        direction: Vector3.clone(direction),
        maxDistance: HAZARD_RAYCAST_MAX_DISTANCE,
        queryType: RaycastQueryType.RQT_HIT_FIRST,
        collisionMask: ColliderLayer.CL_CUSTOM1,
        continuous: false
      }
    },
    (result) => {
      if (targetCooldownRemaining > 0) return
      const hitEntity = result.hits[0]?.entityId as Entity | undefined
      if (hitEntity === undefined) return
      const hazardId = hazardIdForEntity(hitEntity)
      if (hazardId === undefined) return
      requestHazardTarget(hazardId)
    }
  )
}

export function setupHazardVisuals() {
  engine.addSystem(HazardFlightSystem)
  engine.addSystem(HazardTargetSystem)

  room.onMessage('notifyHazardSpawn', (data) => {
    if (spawned.some((h) => h.hazardId === data.hazardId)) return
    const path = virtualFlightPath(data.position)
    const visuals = spawnHazard(path.start, HAZARD_RADIUS)
    const hazard: SpawnedHazard = {
      hazardId: data.hazardId,
      encounterId: data.encounterId,
      entity: visuals.entity,
      targetingIndicator: visuals.targetingIndicator,
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
      VisibilityComponent.getMutable(hazard.targetingIndicator).visible = data.targetCount > 0
      return
    }
  })
}
