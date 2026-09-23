import { AudioSource, engine, Entity, Material, Transform, VisibilityComponent } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { isServer } from '@dcl/sdk/network'
import {
  OVERCHARGE_LASER_ALBEDO_COLOR,
  OVERCHARGE_LASER_EMISSIVE_COLOR,
  SCENE_SHIP_POSITION,
  SHIP_LASER_ALBEDO_COLOR,
  SHIP_LASER_BASE_FIRE_RATE,
  SHIP_LASER_EMISSIVE_COLOR,
  SHIP_LASER_EMISSIVE_INTENSITY,
  SHIP_LASER_LIFETIME_SECONDS,
  SHIP_LASER_MAX_TARGETERS,
  SHIP_LASER_ORIGIN_OFFSET,
  SHIP_LASER_POOL_SIZE,
  SHIP_LASER_SOUND_PATH,
  SHIP_LASER_SOUND_VOICES,
  SHIP_LASER_WIDTH
} from '../constants'
import { createBeamStrip, poseBeamStrip } from '../effects/beamStrip'
import { isWeaponsOvercharged } from '../gamestate'
import { forEachHazardTargetCount } from '../hazards/visuals'
import { ObjectPool } from '../objectPool'
import { clampSimulationStep } from '../utilities'

type ActiveLaser = {
  entity: Entity
  target: Entity
  remaining: number
}

const laserOrigin = Vector3.add(SCENE_SHIP_POSITION, SHIP_LASER_ORIGIN_OFFSET)

let laserPool: ObjectPool<Entity>
const active: ActiveLaser[] = []
const fireElapsed = new Map<Entity, number>()

const laserSoundEntities: Entity[] = []
let laserSoundIndex = 0

function applyLaserMaterial(entity: Entity, overcharged: boolean): void {
  Material.setPbrMaterial(entity, {
    albedoColor: overcharged ? OVERCHARGE_LASER_ALBEDO_COLOR : SHIP_LASER_ALBEDO_COLOR,
    emissiveColor: overcharged ? OVERCHARGE_LASER_EMISSIVE_COLOR : SHIP_LASER_EMISSIVE_COLOR,
    emissiveIntensity: SHIP_LASER_EMISSIVE_INTENSITY,
    castShadows: false
  })
}

function createLaserEntity(): Entity {
  const entity = createBeamStrip(laserOrigin, SHIP_LASER_WIDTH)
  applyLaserMaterial(entity, false)
  return entity
}

function resetLaser(entity: Entity): void {
  VisibilityComponent.getMutable(entity).visible = false
}

function acquireLaser(target: Entity): void {
  const entity = laserPool.acquire()
  applyLaserMaterial(entity, isWeaponsOvercharged())
  VisibilityComponent.getMutable(entity).visible = true
  if (Transform.has(target)) {
    poseBeamStrip(entity, laserOrigin, Transform.get(target).position, SHIP_LASER_WIDTH)
  }
  active.push({ entity, target, remaining: SHIP_LASER_LIFETIME_SECONDS })
  playLaserSound()
}

function releaseLaser(index: number): void {
  const laser = active[index]
  laserPool.release(laser.entity)
  active.splice(index, 1)
}

function fireShots(dt: number): void {
  const seen = new Set<Entity>()

  forEachHazardTargetCount((entity, targetCount) => {
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
    poseBeamStrip(laser.entity, laserOrigin, Transform.get(laser.target).position, SHIP_LASER_WIDTH)
  }
}

function LaserSystem(dt: number): void {
  const step = clampSimulationStep(dt)
  fireShots(step)
  updateActive(step)
}

function createLaserSoundEntity(): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.clone(laserOrigin) })
  AudioSource.create(entity, {
    audioClipUrl: SHIP_LASER_SOUND_PATH,
    playing: false,
    loop: false,
    volume: 1
  })
  return entity
}

function playLaserSound(): void {
  const entity = laserSoundEntities[laserSoundIndex]
  laserSoundIndex = (laserSoundIndex + 1) % laserSoundEntities.length
  AudioSource.createOrReplace(entity, {
    audioClipUrl: SHIP_LASER_SOUND_PATH,
    playing: true,
    loop: false,
    volume: 1,
    currentTime: 0
  })
}

export function setupShipWeapons() {
  if (isServer()) return

  for (let i = 0; i < SHIP_LASER_SOUND_VOICES; i++) {
    laserSoundEntities.push(createLaserSoundEntity())
  }
  laserPool = new ObjectPool({
    create: createLaserEntity,
    reset: resetLaser,
    initialSize: SHIP_LASER_POOL_SIZE
  })
  engine.addSystem(LaserSystem)
}
