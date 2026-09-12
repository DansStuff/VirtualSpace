/**
 * Server hazard sim: spawn, targeting, damage, asteroid expiry, and saucer fire.
 * Does not call `room`; the state machine installs notify callbacks at setup.
 * Client visuals are in visuals.ts.
 */
import { Vector3 } from '@dcl/sdk/math'
import { isServer } from '@dcl/sdk/network'
import {
  HAZARD_CONE_VERTICAL_DEGREES,
  HAZARD_DAMAGE_INTERVAL,
  HAZARD_SPAWN_DISTANCE,
  OVERCHARGE_DAMAGE_MULTIPLIER,
  SAUCER_APPROACH_SECONDS,
  SAUCER_FIRE_INTERVAL,
  SAUCER_HOVER_DISTANCE,
  SAUCER_SHOT_DAMAGE,
  TURRET_SPAWN_FRUSTUM,
  type HazardKind,
  type TurretId
} from '../constants'
import { activateRandomBreach, damageShipHull, isWeaponsOvercharged } from '../gamestate'
import { addDamage } from '../players/contributions'
import { getGunnerLevel } from '../players/stats'
import { getKnownBreachIds, getTurretView } from '../sceneObjects'
import { shipVirtualPosition, shipVirtualRotation } from '../ship'
import { directionFromTo } from '../utilities'
import { setupHazardVisuals } from './visuals'

type LiveHazard = {
  hazardId: number
  encounterId: string
  kind: HazardKind
  position: Vector3
  flightElapsed: number
  flightTime: number
  hp: number
  hullDamage: number
  damageElapsed: number
  fireElapsed: number
  targetedBy: Set<string>
}

export type HazardNotifies = {
  notifyHazardSpawn: (data: {
    hazardId: number
    encounterId: string
    position: { x: number; y: number; z: number }
    flightTime: number
    kind: HazardKind
  }) => void
  notifyHazardTargeted: (data: { hazardId: number; targeters: string[] }) => void
  notifyHazardDestroyed: (data: { hazardId: number; hitShip: boolean }) => void
  notifySaucerFired: (data: {
    hazardId: number
    position: { x: number; y: number; z: number }
  }) => void
}

let liveHazards: LiveHazard[] = []
const playerTarget = new Map<string, number>()
let nextHazardId = 1
let notifies: HazardNotifies | null = null

export function configureHazardNotifies(next: HazardNotifies): void {
  notifies = next
}

function directionInTurretView(turret: TurretId): Vector3 {
  const view = getTurretView(turret)
  const look = view ? view.look : Vector3.Forward()
  const upRef = Math.abs(Vector3.dot(look, Vector3.Up())) > 0.99 ? Vector3.Right() : Vector3.Up()
  const right = Vector3.normalize(Vector3.cross(upRef, look))
  const up = Vector3.normalize(Vector3.cross(look, right))

  const yawHalf = (TURRET_SPAWN_FRUSTUM.horizontalFovDegrees * TURRET_SPAWN_FRUSTUM.inset * 0.5) * (Math.PI / 180)
  const yaw = (Math.random() * 2 - 1) * yawHalf
  const pitch = Math.random() * HAZARD_CONE_VERTICAL_DEGREES * (Math.PI / 180)
  const cosPitch = Math.cos(pitch)
  const sceneDir = Vector3.add(
    Vector3.add(Vector3.scale(right, Math.sin(yaw) * cosPitch), Vector3.scale(up, Math.sin(pitch))),
    Vector3.scale(look, Math.cos(yaw) * cosPitch)
  )
  return Vector3.rotate(Vector3.normalize(sceneDir), shipVirtualRotation)
}

function hazardSpawnMessage(hazard: LiveHazard) {
  return {
    hazardId: hazard.hazardId,
    encounterId: hazard.encounterId,
    position: hazard.position,
    flightTime: Math.max(0, hazard.flightTime - hazard.flightElapsed),
    kind: hazard.kind
  }
}

function clearTargeting() {
  playerTarget.clear()
}

function broadcastHazardTargeted(hazard: LiveHazard) {
  notifies?.notifyHazardTargeted({
    hazardId: hazard.hazardId,
    targeters: [...hazard.targetedBy]
  })
}

function clearHazardLockers(hazard: LiveHazard) {
  for (const address of hazard.targetedBy) {
    if (playerTarget.get(address) === hazard.hazardId) {
      playerTarget.delete(address)
    }
  }
  hazard.targetedBy.clear()
}

function damageHazard(hazardId: number, amount: number): boolean {
  const hazard = liveHazards.find((h) => h.hazardId === hazardId)
  if (!hazard) return false
  hazard.hp -= amount
  if (hazard.hp > 0) return true
  return destroyHazard(hazardId, false)
}

export function setPlayerTarget(playerAddress: string, hazardId: number) {
  const hazard = liveHazards.find((h) => h.hazardId === hazardId)
  if (!hazard) return

  const previousId = playerTarget.get(playerAddress)
  if (previousId === hazardId) return

  if (previousId !== undefined) {
    const previous = liveHazards.find((h) => h.hazardId === previousId)
    if (previous) {
      previous.targetedBy.delete(playerAddress)
      if (previous.targetedBy.size === 0) {
        previous.damageElapsed = 0
      }
      broadcastHazardTargeted(previous)
    }
  }

  hazard.targetedBy.add(playerAddress)
  playerTarget.set(playerAddress, hazardId)
  broadcastHazardTargeted(hazard)
  console.log(
    `[SERVER] Hazard ${hazardId} targeted by ${playerAddress} (count ${hazard.targetedBy.size})`
  )
}

/** Remove a live hazard and tell clients to despawn it. `hitShip` true = collided with the ship; false = shot. */
export function destroyHazard(hazardId: number, hitShip: boolean): boolean {
  const index = liveHazards.findIndex((h) => h.hazardId === hazardId)
  if (index < 0) return false
  const hazard = liveHazards[index]
  clearHazardLockers(hazard)
  liveHazards.splice(index, 1)
  if (hitShip) {
    damageShipHull(hazard.hullDamage)
    const breachId = activateRandomBreach(getKnownBreachIds())
    if (breachId !== null) {
      console.log(`[SERVER] Breach ${breachId} opened`)
    }
  }
  notifies?.notifyHazardDestroyed({ hazardId, hitShip })
  console.log(`[SERVER] Hazard ${hazardId} destroyed (${hitShip ? 'hit ship' : 'shot'})`)
  return true
}

export function spawn(
  encounterId: string,
  opts: {
    kind: HazardKind
    turret: TurretId
    flightTime: number
    hp: number
    hullDamage: number
  }
): number {
  const position = Vector3.add(shipVirtualPosition, Vector3.scale(directionInTurretView(opts.turret), HAZARD_SPAWN_DISTANCE))
  const hazard: LiveHazard = {
    hazardId: nextHazardId++,
    encounterId,
    kind: opts.kind,
    position,
    flightElapsed: 0,
    flightTime: opts.kind === 'saucer' ? SAUCER_APPROACH_SECONDS : opts.flightTime,
    hp: opts.hp,
    hullDamage: opts.hullDamage,
    damageElapsed: 0,
    fireElapsed: 0,
    targetedBy: new Set()
  }
  liveHazards.push(hazard)
  notifies?.notifyHazardSpawn(hazardSpawnMessage(hazard))
  return hazard.hazardId
}

export function tick(dt: number): void {
  const expiredIds: number[] = []
  for (const hazard of liveHazards) {
    hazard.flightElapsed += dt
    if (hazard.kind === 'asteroid' && hazard.flightElapsed >= hazard.flightTime) {
      expiredIds.push(hazard.hazardId)
    }
  }
  for (const hazardId of expiredIds) {
    destroyHazard(hazardId, true)
  }

  for (const hazard of liveHazards) {
    if (hazard.kind !== 'saucer') continue
    if (hazard.flightElapsed < hazard.flightTime) continue
    hazard.fireElapsed += dt
    while (hazard.fireElapsed >= SAUCER_FIRE_INTERVAL) {
      hazard.fireElapsed -= SAUCER_FIRE_INTERVAL
      damageShipHull(SAUCER_SHOT_DAMAGE)
      const dir = directionFromTo(shipVirtualPosition, hazard.position)
      notifies?.notifySaucerFired({
        hazardId: hazard.hazardId,
        position: Vector3.add(shipVirtualPosition, Vector3.scale(dir, SAUCER_HOVER_DISTANCE))
      })
      console.log(`[SERVER] Saucer ${hazard.hazardId} fired`)
    }
  }

  const lockedIds: number[] = []
  for (const hazard of liveHazards) {
    if (hazard.targetedBy.size > 0) {
      hazard.damageElapsed += dt
      lockedIds.push(hazard.hazardId)
    } else {
      hazard.damageElapsed = 0
    }
  }
  for (const hazardId of lockedIds) {
    const hazard = liveHazards.find((h) => h.hazardId === hazardId)
    if (!hazard) continue
    while (hazard.damageElapsed >= HAZARD_DAMAGE_INTERVAL) {
      hazard.damageElapsed -= HAZARD_DAMAGE_INTERVAL
      let amount = 0
      const multiplier = isWeaponsOvercharged() ? OVERCHARGE_DAMAGE_MULTIPLIER : 1
      for (const address of hazard.targetedBy) {
        const damage = Math.round(getGunnerLevel(address) * multiplier)
        addDamage(address, damage)
        amount += damage
      }
      if (amount <= 0) break
      if (!damageHazard(hazardId, amount)) break
    }
  }
}

export function hasLive(): boolean {
  return liveHazards.length > 0
}

/** Clear live hazards and targeting locks. Hazard ids keep incrementing. */
export function clearLive(): void {
  liveHazards = []
  clearTargeting()
}

/** Clear live hazards and reset hazard ids for a new mission. */
export function resetLive(): void {
  clearLive()
  nextHazardId = 1
}

export function setupHazards() {
  if (isServer()) return
  setupHazardVisuals()
}
