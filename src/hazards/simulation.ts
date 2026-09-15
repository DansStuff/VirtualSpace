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
  SAUCER_HOVER_DISTANCE,
  SKILL_XP_PER_GUNNER_HIT,
  TURRET_SPAWN_FRUSTUM,
  gunnerShotDamage,
  type HazardKind,
  type TurretId
} from '../constants'
import { activateRandomBreach, damageShipHull, isWeaponsOvercharged } from '../gamestate'
import { addDamage } from '../players/contributions'
import { awardSkillXp, getGunnerLevel } from '../players/stats'
import { getKnownBreachIds, getTurretView } from '../sceneObjects'
import { shipVirtualPosition, shipVirtualRotation } from '../ship'
import { directionFromTo } from '../utilities'
import { setupHazardVisuals } from './visuals'

type HazardBase = {
  hazardId: number
  encounterId: string
  position: Vector3
  hp: number
  targetedBy: Set<string>
  damageElapsed: number
}

type LiveAsteroid = HazardBase & {
  kind: 'asteroid'
  flightElapsed: number
  flightTime: number
  impactDamage: number
}

type LiveSaucer = HazardBase & {
  kind: 'saucer'
  approachElapsed: number
  approachTime: number
  fireElapsed: number
  fireInterval: number
  shotDamage: number
}

type LiveHazard = LiveAsteroid | LiveSaucer

type SpawnAsteroidOpts = {
  kind: 'asteroid'
  turret: TurretId
  flightTime: number
  hp: number
  impactDamage: number
}

type SpawnSaucerOpts = {
  kind: 'saucer'
  turret: TurretId
  hp: number
  fireInterval: number
  shotDamage: number
}

type SpawnHazardOpts = SpawnAsteroidOpts | SpawnSaucerOpts

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

function remainingFlightTime(hazard: LiveHazard): number {
  if (hazard.kind === 'asteroid') {
    return Math.max(0, hazard.flightTime - hazard.flightElapsed)
  }
  return Math.max(0, hazard.approachTime - hazard.approachElapsed)
}

function hazardSpawnMessage(hazard: LiveHazard) {
  return {
    hazardId: hazard.hazardId,
    encounterId: hazard.encounterId,
    position: hazard.position,
    flightTime: remainingFlightTime(hazard),
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

function openRandomBreach(): void {
  const breachId = activateRandomBreach(getKnownBreachIds())
  if (breachId !== null) {
    console.log(`[SERVER] Breach ${breachId} opened`)
  }
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
    if (hazard.kind === 'asteroid') {
      damageShipHull(hazard.impactDamage)
    }
    openRandomBreach()
  }
  notifies?.notifyHazardDestroyed({ hazardId, hitShip })
  console.log(`[SERVER] Hazard ${hazardId} destroyed (${hitShip ? 'hit ship' : 'shot'})`)
  return true
}

function nextBase(encounterId: string, position: Vector3, hp: number): HazardBase {
  return {
    hazardId: nextHazardId++,
    encounterId,
    position,
    hp,
    targetedBy: new Set(),
    damageElapsed: 0
  }
}

export function spawn(encounterId: string, opts: SpawnHazardOpts): number {
  const position = Vector3.add(shipVirtualPosition, Vector3.scale(directionInTurretView(opts.turret), HAZARD_SPAWN_DISTANCE))
  const base = nextBase(encounterId, position, opts.hp)
  const hazard: LiveHazard =
    opts.kind === 'asteroid'
      ? {
          ...base,
          kind: 'asteroid',
          flightElapsed: 0,
          flightTime: opts.flightTime,
          impactDamage: opts.impactDamage
        }
      : {
          ...base,
          kind: 'saucer',
          approachElapsed: 0,
          approachTime: SAUCER_APPROACH_SECONDS,
          fireElapsed: 0,
          fireInterval: opts.fireInterval,
          shotDamage: opts.shotDamage
        }
  liveHazards.push(hazard)
  notifies?.notifyHazardSpawn(hazardSpawnMessage(hazard))
  return hazard.hazardId
}

function tickAsteroid(hazard: LiveAsteroid, dt: number): number | null {
  hazard.flightElapsed += dt
  if (hazard.flightElapsed >= hazard.flightTime) {
    return hazard.hazardId
  }
  return null
}

function tickSaucer(hazard: LiveSaucer, dt: number): void {
  hazard.approachElapsed += dt
  if (hazard.approachElapsed < hazard.approachTime) return
  if (hazard.fireInterval <= 0) return
  hazard.fireElapsed += dt
  while (hazard.fireElapsed >= hazard.fireInterval) {
    hazard.fireElapsed -= hazard.fireInterval
    damageShipHull(hazard.shotDamage)
    openRandomBreach()
    const dir = directionFromTo(shipVirtualPosition, hazard.position)
    notifies?.notifySaucerFired({
      hazardId: hazard.hazardId,
      position: Vector3.add(shipVirtualPosition, Vector3.scale(dir, SAUCER_HOVER_DISTANCE))
    })
    console.log(`[SERVER] Saucer ${hazard.hazardId} fired`)
  }
}

function tickTargetedDamage(dt: number): void {
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
        const damage = Math.round(gunnerShotDamage(getGunnerLevel(address)) * multiplier)
        addDamage(address, damage)
        if (damage > 0) {
          awardSkillXp(address, 'gunner', SKILL_XP_PER_GUNNER_HIT)
        }
        amount += damage
      }
      if (amount <= 0) break
      if (!damageHazard(hazardId, amount)) break
    }
  }
}

export function tick(dt: number): void {
  const expiredIds: number[] = []
  for (const hazard of liveHazards) {
    if (hazard.kind === 'asteroid') {
      const expiredId = tickAsteroid(hazard, dt)
      if (expiredId !== null) expiredIds.push(expiredId)
    } else {
      tickSaucer(hazard, dt)
    }
  }
  for (const hazardId of expiredIds) {
    destroyHazard(hazardId, true)
  }

  tickTargetedDamage(dt)
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
