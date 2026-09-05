import {
  engine,
  Entity,
  InputAction,
  inputSystem,
  MainCamera,
  Name,
  PointerEvents,
  PointerEventType,
  Transform,
  VirtualCamera
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { isServer } from '@dcl/sdk/network'
import { WEAPON_CAMERA_LOCAL_OFFSET } from './constants'

const consoleCameras = new Map<Entity, Entity>()
let turretOccupied = false

function isBreachName(name: string): boolean {
  return name.startsWith('Breach')
}

function isConsoleName(name: string): boolean {
  return name.endsWith('WeaponConsole')
}

function isWeaponName(name: string): boolean {
  return name.endsWith('Weapon')
}

function initBreach(_entity: Entity): void {}

/** Weapon GLTFs face -Z; VirtualCamera looks along +Z. */
const WEAPON_CAMERA_YAW = Quaternion.fromEulerDegrees(0, 180, 0)

function initWeapon(weapon: Entity): Entity {
  const pose = Transform.get(weapon)
  const rotation = Quaternion.multiply(pose.rotation, WEAPON_CAMERA_YAW)
  const camera = engine.addEntity()
  Transform.create(camera, {
    position: Vector3.add(pose.position, Vector3.rotate(WEAPON_CAMERA_LOCAL_OFFSET, rotation)),
    rotation
  })
  VirtualCamera.create(camera, {})
  return camera
}

function hoverTextForConsole(name: string): string {
  const side = name.replace(/WeaponConsole$/, '')
  const label = side === 'Center' ? 'Middle' : side
  return `Control ${label} Laser`
}

function initConsole(entity: Entity, name: string, camera: Entity | undefined): void {
  if (camera === undefined) return
  PointerEvents.create(entity, {
    pointerEvents: [
      {
        eventType: PointerEventType.PET_DOWN,
        eventInfo: {
          button: InputAction.IA_POINTER,
          hoverText: hoverTextForConsole(name),
          maxDistance: 4,
          showFeedback: true,
          showHighlight: true
        }
      }
    ]
  })
  consoleCameras.set(entity, camera)
}

function occupyWeaponCamera(camera: Entity): void {
  MainCamera.getOrCreateMutable(engine.CameraEntity).virtualCameraEntity = camera
  turretOccupied = true
}

export function exitWeaponCamera(): void {
  MainCamera.getOrCreateMutable(engine.CameraEntity).virtualCameraEntity = undefined
  turretOccupied = false
}

export function isTurretOccupied(): boolean {
  return turretOccupied
}

function WeaponConsoleSystem(): void {
  for (const [consoleEntity, camera] of consoleCameras) {
    if (inputSystem.getInputCommand(InputAction.IA_POINTER, PointerEventType.PET_DOWN, consoleEntity)) {
      occupyWeaponCamera(camera)
    }
  }
}

export function setupSceneObjects(): void {
  if (isServer()) return

  const breaches: Entity[] = []
  const weapons = new Map<string, Entity>()
  const consoles: { entity: Entity; name: string }[] = []

  for (const [entity, name] of engine.getEntitiesWith(Name)) {
    if (isBreachName(name.value)) {
      breaches.push(entity)
      continue
    }
    if (isWeaponName(name.value)) {
      weapons.set(name.value, entity)
      continue
    }
    if (isConsoleName(name.value)) {
      consoles.push({ entity, name: name.value })
    }
  }

  for (const entity of breaches) {
    initBreach(entity)
  }

  const cameras = new Map<string, Entity>()
  for (const [name, entity] of weapons) {
    cameras.set(name, initWeapon(entity))
  }

  for (const console of consoles) {
    const weaponName = console.name.replace(/Console$/, '')
    initConsole(console.entity, console.name, cameras.get(weaponName))
  }

  engine.addSystem(WeaponConsoleSystem)
}
