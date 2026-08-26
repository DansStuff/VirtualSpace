import { engine, Entity, Material, MeshRenderer, Transform, VisibilityComponent } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { isServer } from '@dcl/sdk/network'
import {
  SCENE_SHIP_POSITION,
  SHIP_LASER_ALBEDO_COLOR,
  SHIP_LASER_BASE_FIRE_RATE,
  SHIP_LASER_EMISSIVE_COLOR,
  SHIP_LASER_EMISSIVE_INTENSITY,
  SHIP_LASER_LIFETIME_SECONDS,
  SHIP_LASER_MAX_TARGETERS,
  SHIP_LASER_ORIGIN_OFFSET,
  SHIP_LASER_POOL_SIZE,
  SHIP_LASER_WIDTH,
  SIMULATION_MAX_DELTA_SECONDS
} from '../constants'
import { forEachLiveHazard } from '../hazards/visuals'
import { directionFromTo } from '../utilities'

type ActiveLaser = {
  entity: Entity
  target: Entity
  remaining: number
}

const laserOrigin = Vector3.add(SCENE_SHIP_POSITION, SHIP_LASER_ORIGIN_OFFSET)
const worldDown = Vector3.Down()

const free: Entity[] = []
const active: ActiveLaser[] = []
const fireElapsed = new Map<Entity, number>()

function createLaserEntity(): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, {
    position: Vector3.clone(laserOrigin),
    scale: Vector3.create(SHIP_LASER_WIDTH, 1, 1)
  })
  MeshRenderer.setPlane(entity)
  Material.setPbrMaterial(entity, {
    albedoColor: SHIP_LASER_ALBEDO_COLOR,
    emissiveColor: SHIP_LASER_EMISSIVE_COLOR,
    emissiveIntensity: SHIP_LASER_EMISSIVE_INTENSITY,
    castShadows: false
  })
  VisibilityComponent.create(entity, { visible: false })
  return entity
}

function acquireLaser(target: Entity): void {
  const entity = free.pop() ?? createLaserEntity()
  VisibilityComponent.getMutable(entity).visible = true
  if (Transform.has(target)) {
    applyLaserPose(entity, Transform.get(target).position)
  }
  active.push({ entity, target, remaining: SHIP_LASER_LIFETIME_SECONDS })
}

function releaseLaser(index: number): void {
  const laser = active[index]
  VisibilityComponent.getMutable(laser.entity).visible = false
  free.push(laser.entity)
  active.splice(index, 1)
}

/**
 * Rotation for a plane lying along the beam: local +Y is origin→target, local +Z is
 * world-down projected onto the plane perpendicular to the beam (visible from below).
 */
function laserRotation(beamDir: Vector3): Quaternion.Mutable {
  const zAxis = Vector3.normalize(
    Vector3.subtract(worldDown, Vector3.scale(beamDir, Vector3.dot(worldDown, beamDir)))
  )
  return Quaternion.lookRotation(zAxis, beamDir)
}

function applyLaserPose(entity: Entity, targetPosition: Vector3): void {
  const length = Vector3.distance(laserOrigin, targetPosition)
  const transform = Transform.getMutable(entity)
  transform.position = Vector3.lerp(laserOrigin, targetPosition, 0.5)
  transform.rotation = laserRotation(directionFromTo(laserOrigin, targetPosition))
  transform.scale = Vector3.create(SHIP_LASER_WIDTH, Math.max(length, 0.01), 1)
}

function fireShots(dt: number): void {
  const seen = new Set<Entity>()

  forEachLiveHazard((entity, targetCount) => {
    seen.add(entity)
    if (targetCount <= 0) {
      fireElapsed.delete(entity)
      return
    }

    const clamped = Math.min(targetCount, SHIP_LASER_MAX_TARGETERS)
    const interval = 1 / (SHIP_LASER_BASE_FIRE_RATE * clamped)
    let elapsed = fireElapsed.get(entity)
    if (elapsed === undefined) {
      elapsed = interval
    }
    elapsed += dt
    while (elapsed >= interval) {
      elapsed -= interval
      acquireLaser(entity)
    }
    fireElapsed.set(entity, elapsed)
  })

  for (const entity of fireElapsed.keys()) {
    if (!seen.has(entity)) {
      fireElapsed.delete(entity)
    }
  }
}

function updateActive(dt: number): void {
  for (let i = active.length - 1; i >= 0; i--) {
    const laser = active[i]
    laser.remaining -= dt
    if (laser.remaining <= 0 || !Transform.has(laser.target)) {
      releaseLaser(i)
      continue
    }
    applyLaserPose(laser.entity, Transform.get(laser.target).position)
  }
}

function LaserSystem(dt: number): void {
  const step = Math.min(dt, SIMULATION_MAX_DELTA_SECONDS)
  fireShots(step)
  updateActive(step)
}

export function setupShipWeapons() {
  if (isServer()) return

  for (let i = 0; i < SHIP_LASER_POOL_SIZE; i++) {
    free.push(createLaserEntity())
  }
  engine.addSystem(LaserSystem)
}
