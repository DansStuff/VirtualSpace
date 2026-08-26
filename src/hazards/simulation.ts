import { Vector3 } from '@dcl/sdk/math'
import { isServer } from '@dcl/sdk/network'
import {
  HAZARD_CONE_HORIZONTAL_DEGREES,
  HAZARD_CONE_VERTICAL_DEGREES,
  HAZARD_DAMAGE_INTERVAL,
  HAZARD_SPAWN_DISTANCE
} from '../constants'
import { room } from '../networking/messages'
import { shipVirtualPosition, shipVirtualRotation } from '../ship'
import { setupHazardVisuals } from './visuals'

type LiveHazard = {
  hazardId: number
  encounterId: string
  position: Vector3
  flightElapsed: number
  flightTime: number
  hp: number
  damageElapsed: number
  targetedBy: Set<string>
}

let liveHazards: LiveHazard[] = []
const playerTarget = new Map<string, number>()
let nextHazardId = 1

function randomConeAhead(): Vector3 {
  const yaw = (Math.random() - 0.5) * HAZARD_CONE_HORIZONTAL_DEGREES * (Math.PI / 180)
  const pitch = (Math.random() - 0.5) * HAZARD_CONE_VERTICAL_DEGREES * (Math.PI / 180)
  const cosPitch = Math.cos(pitch)
  // +Z ahead in travel space. shipVirtualRotation includes a 180° model yaw, so travel +Z is virtual -Z.
  const travelLocal = Vector3.create(
    Math.sin(yaw) * cosPitch,
    Math.sin(pitch),
    Math.cos(yaw) * cosPitch
  )
  const modelLocal = Vector3.create(-travelLocal.x, travelLocal.y, -travelLocal.z)
  return Vector3.rotate(modelLocal, shipVirtualRotation)
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

function broadcastHazardTargeted(hazard: LiveHazard, playerAddress: string) {
  room.send('notifyHazardTargeted', {
    hazardId: hazard.hazardId,
    playerAddress,
    targetCount: hazard.targetedBy.size
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
      broadcastHazardTargeted(previous, playerAddress)
    }
  }

  hazard.targetedBy.add(playerAddress)
  playerTarget.set(playerAddress, hazardId)
  broadcastHazardTargeted(hazard, playerAddress)
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
  room.send('notifyHazardDestroyed', { hazardId, hitShip })
  console.log(`[SERVER] Hazard ${hazardId} destroyed (${hitShip ? 'hit ship' : 'shot'})`)
  return true
}

export function spawn(encounterId: string, opts: { flightTime: number; hp: number }): number {
  const position = Vector3.add(shipVirtualPosition, Vector3.scale(randomConeAhead(), HAZARD_SPAWN_DISTANCE))
  const hazard: LiveHazard = {
    hazardId: nextHazardId++,
    encounterId,
    position,
    flightElapsed: 0,
    flightTime: opts.flightTime,
    hp: opts.hp,
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
      if (!damageHazard(hazardId, 1)) break
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

export function replayLive(playerAddress: string): void {
  for (const hazard of liveHazards) {
    room.send('notifyHazardSpawn', hazardSpawnMessage(hazard), { to: [playerAddress] })
    if (hazard.targetedBy.size > 0) {
      room.send(
        'notifyHazardTargeted',
        {
          hazardId: hazard.hazardId,
          playerAddress: '',
          targetCount: hazard.targetedBy.size
        },
        { to: [playerAddress] }
      )
    }
  }
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
