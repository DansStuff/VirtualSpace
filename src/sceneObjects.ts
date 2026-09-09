import {
  engine,
  Entity,
  InputAction,
  InputModifier,
  inputSystem,
  MainCamera,
  Name,
  PointerEvents,
  PointerEventType,
  PointerLock,
  TouchScreenControls,
  Transform,
  VirtualCamera,
  VisibilityComponent
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { isServer, isStateSyncronized } from '@dcl/sdk/network'
import {
  WEAPON_CAMERA_FOV_DEGREES,
  WEAPON_CAMERA_LOCAL_OFFSET,
  WEAPON_CAMERA_TRANSITION_SECONDS,
  type TurretId
} from './constants'
import { getGameState, isBreachActive } from './gamestate'
import { room } from './networking/messages'

const consoleCameras = new Map<Entity, Entity>()
const breachEntities = new Map<number, Entity>()
let turretOccupied = false

export type TurretView = {
  position: Vector3
  rotation: Quaternion
  look: Vector3
}

const turretViews = new Map<TurretId, TurretView>()

export function getTurretView(id: TurretId): TurretView | undefined {
  return turretViews.get(id)
}

function turretIdFromWeaponName(name: string): TurretId | undefined {
  if (name === 'LeftWeapon') return 'left'
  if (name === 'CenterWeapon') return 'center'
  if (name === 'RightWeapon') return 'right'
  return undefined
}

function isBreachName(name: string): boolean {
  return name.startsWith('Breach')
}

function breachIdFromName(name: string): number | undefined {
  const match = /^Breach(\d+)$/.exec(name)
  if (!match) return undefined
  const id = Number(match[1])
  if (id < 1 || id > 6) return undefined
  return id
}

export function getKnownBreachIds(): number[] {
  return [...breachEntities.keys()]
}

function isConsoleName(name: string): boolean {
  return name.endsWith('WeaponConsole')
}

function isWeaponName(name: string): boolean {
  return name.endsWith('Weapon')
}

function initBreach(entity: Entity): void {
  VisibilityComponent.createOrReplace(entity, { visible: false, propagateToChildren: true })
  PointerEvents.create(entity, {
    pointerEvents: [
      {
        eventType: PointerEventType.PET_DOWN,
        eventInfo: {
          button: InputAction.IA_POINTER,
          hoverText: 'Repair Breach!',
          maxDistance: 4,
          showFeedback: true,
          showHighlight: true
        }
      }
    ]
  })
}

/** Weapon GLTFs face -Z; VirtualCamera looks along +Z. */
const WEAPON_CAMERA_YAW = Quaternion.fromEulerDegrees(0, 180, 0)

function cacheTurretView(id: TurretId, weapon: Entity): TurretView {
  const pose = Transform.get(weapon)
  const rotation = Quaternion.multiply(pose.rotation, WEAPON_CAMERA_YAW)
  const position = Vector3.add(pose.position, Vector3.rotate(WEAPON_CAMERA_LOCAL_OFFSET, rotation))
  const look = Vector3.normalize(Vector3.rotate(Vector3.Forward(), rotation))
  const view: TurretView = { position, rotation, look }
  turretViews.set(id, view)
  return view
}

function initWeaponFromView(view: TurretView): Entity {
  const camera = engine.addEntity()
  Transform.create(camera, {
    position: view.position,
    rotation: view.rotation
  })
  VirtualCamera.create(camera, {
    fov: WEAPON_CAMERA_FOV_DEGREES,
    defaultTransition: {
      transitionMode: VirtualCamera.Transition.Time(WEAPON_CAMERA_TRANSITION_SECONDS)
    }
  })
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

function hideMobileControls(): void {
  TouchScreenControls.hideAll()
  TouchScreenControls.hideJoystick()
  TouchScreenControls.hideCrosshair()
}

function showMobileControls(): void {
  TouchScreenControls.showAll()
  TouchScreenControls.showJoystick()
  TouchScreenControls.showCrosshair()
}

function freezePlayer(): void {
  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({ disableAll: true })
  })
}

function unfreezePlayer(): void {
  InputModifier.deleteFrom(engine.PlayerEntity)
}

function occupyWeaponCamera(camera: Entity): void {
  MainCamera.getOrCreateMutable(engine.CameraEntity).virtualCameraEntity = camera
  PointerLock.getMutable(engine.CameraEntity).isPointerLocked = false
  hideMobileControls()
  freezePlayer()
  turretOccupied = true
}

export function exitWeaponCamera(): void {
  MainCamera.getOrCreateMutable(engine.CameraEntity).virtualCameraEntity = undefined
  showMobileControls()
  unfreezePlayer()
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

function BreachVisibilitySystem(): void {
  const state = getGameState()
  for (const [id, entity] of breachEntities) {
    const visible = isBreachActive(state, id)
    const current = VisibilityComponent.getOrNull(entity)
    if (current && current.visible === visible) continue
    VisibilityComponent.createOrReplace(entity, { visible, propagateToChildren: true })
  }
}

function BreachRepairSystem(): void {
  if (!isStateSyncronized()) return
  const state = getGameState()
  for (const [id, entity] of breachEntities) {
    if (!isBreachActive(state, id)) continue
    if (inputSystem.getInputCommand(InputAction.IA_POINTER, PointerEventType.PET_DOWN, entity)) {
      room.send('requestRepairBreach', { breachId: id })
    }
  }
}

export function setupSceneObjects(): void {
  turretViews.clear()
  breachEntities.clear()

  const weapons = new Map<string, Entity>()
  const consoles: { entity: Entity; name: string }[] = []

  for (const [entity, name] of engine.getEntitiesWith(Name)) {
    if (isBreachName(name.value)) {
      const breachId = breachIdFromName(name.value)
      if (breachId === undefined) {
        console.log(`[SCENE] Unrecognized breach name: ${name.value}`)
        continue
      }
      breachEntities.set(breachId, entity)
      continue
    }
    if (isWeaponName(name.value)) {
      weapons.set(name.value, entity)
      const turretId = turretIdFromWeaponName(name.value)
      if (turretId) {
        cacheTurretView(turretId, entity)
      } else {
        console.log(`[SCENE] Unrecognized weapon name: ${name.value}`)
      }
      continue
    }
    if (isConsoleName(name.value)) {
      consoles.push({ entity, name: name.value })
    }
  }

  const role = isServer() ? 'SERVER' : 'CLIENT'
  console.log(`[${role}] Cached ${turretViews.size} turret views, ${breachEntities.size} breaches`)

  if (isServer()) return

  PointerLock.createOrReplace(engine.CameraEntity, { isPointerLocked: false })

  for (const entity of breachEntities.values()) {
    initBreach(entity)
  }

  const cameras = new Map<string, Entity>()
  for (const [name] of weapons) {
    const turretId = turretIdFromWeaponName(name)
    const view = turretId ? turretViews.get(turretId) : undefined
    if (!view) continue
    cameras.set(name, initWeaponFromView(view))
  }

  for (const console of consoles) {
    const weaponName = console.name.replace(/Console$/, '')
    initConsole(console.entity, console.name, cameras.get(weaponName))
  }

  engine.addSystem(WeaponConsoleSystem)
  engine.addSystem(BreachVisibilitySystem)
  engine.addSystem(BreachRepairSystem)
}
