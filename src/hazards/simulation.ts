import { Vector3 } from '@dcl/sdk/math'
import { isServer } from '@dcl/sdk/network'
import {
  HAZARD_CONE_VERTICAL_DEGREES,
  HAZARD_DAMAGE_INTERVAL,
  HAZARD_SPAWN_DISTANCE,
  TURRET_SPAWN_FRUSTUM,
  type TurretId
} from '../constants'
import { damageShipHull, getGameState } from '../gamestate'
import { room } from '../networking/messages'
import { getPlayerDamage } from '../players/stats'
import { getTurretView } from '../sceneObjects'
import { shipVirtualPosition, shipVirtualRotation } from '../ship'
import { setupHazardVisuals } from './visuals'

type LiveHazard = {
  hazardId: number
  encounterId: string
  position: Vector3
  flightElapsed: number
  flightTime: number
  hp: number
  hullDamage: number
  damageElapsed: number
  targetedBy: Set<string>
}

let liveHazards: LiveHazard[] = []
const playerTarget = new Map<string, number>()
let nextHazardId = 1

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
    flightTime: Math.max(0, hazard.flightTime - hazard.flightElapsed)
  }
}

function clearTargeting() {
  playerTarget.clear()
}

function broadcastHazardTargeted(hazard: LiveHazard) {
  room.send('notifyHazardTargeted', {
    hazardId: hazard.hazardId,
    // TODO: potentially limit the number of targeters passed over the network to three
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

function setPlayerTarget(playerAddress: string, hazardId: number) {
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
  const hullHp = hitShip ? damageShipHull(hazard.hullDamage) : getGameState().hullHp
  room.send('notifyHazardDestroyed', { hazardId, hitShip, hullHp })
  console.log(`[SERVER] Hazard ${hazardId} destroyed (${hitShip ? 'hit ship' : 'shot'})`)
  return true
}

export function spawn(
  encounterId: string,
  opts: { turret: TurretId; flightTime: number; hp: number; hullDamage: number }
): number {
  const position = Vector3.add(shipVirtualPosition, Vector3.scale(directionInTurretView(opts.turret), HAZARD_SPAWN_DISTANCE))
  const hazard: LiveHazard = {
    hazardId: nextHazardId++,
    encounterId,
    position,
    flightElapsed: 0,
    flightTime: opts.flightTime,
    hp: opts.hp,
    hullDamage: opts.hullDamage,
    damageElapsed: 0,
    targetedBy: new Set()
  }
  liveHazards.push(hazard)
  room.send('notifyHazardSpawn', hazardSpawnMessage(hazard))
  return hazard.hazardId
}

export function tick(dt: number): void {
  const expiredIds: number[] = []
  for (const hazard of liveHazards) {
    hazard.flightElapsed += dt
    if (hazard.flightElapsed >= hazard.flightTime) {
      expiredIds.push(hazard.hazardId)
    }
  }
  for (const hazardId of expiredIds) {
    destroyHazard(hazardId, true)
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
      const amount = [...hazard.targetedBy].reduce((sum, address) => sum + getPlayerDamage(address), 0)
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
  if (isServer()) {
    room.onMessage('requestHazardTarget', (data, context) => {
      if (!context?.from) return
      setPlayerTarget(context.from, data.hazardId)
    })
    return
  }
  setupHazardVisuals()
}
