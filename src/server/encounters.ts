import { engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { currentStopId, isPathFinished, isShipStopped, resumeFromStop } from '../path/follow'
import { START_STOP_ID } from '../path/route'
import { shipVirtualPosition, shipVirtualRotation } from '../ship'
import {
  HAZARD_CONE_HORIZONTAL_DEGREES,
  HAZARD_CONE_VERTICAL_DEGREES,
  HAZARD_SPAWN_DISTANCE,
  HAZARD_SPAWN_INTERVAL,
  encounterParams
} from '../shared/encounters'
import { room } from '../shared/messages'

type LiveHazard = {
  hazardId: number
  encounterId: string
  position: Vector3
  flightElapsed: number
  flightTime: number
  targetedBy: Set<string>
}

const completedEncounterIds: string[] = []
let liveHazards: LiveHazard[] = []
const playerTarget = new Map<string, number>()
let nextHazardId = 1
let activeEncounterId: string | null = null
let encounterElapsed = 0
let encounterHazardCount = 0
let encounterFlightTime = 0
let spawnedThisEncounter = 0

export function replayEncounterState(playerAddress: string) {
  for (const encounterId of completedEncounterIds) {
    room.send('notifyEncounterEnd', { encounterId }, { to: [playerAddress] })
  }
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

function spawnNextHazard(encounterId: string) {
  const position = Vector3.add(shipVirtualPosition, Vector3.scale(randomConeAhead(), HAZARD_SPAWN_DISTANCE))
  const hazard: LiveHazard = {
    hazardId: nextHazardId++,
    encounterId,
    position,
    flightElapsed: 0,
    flightTime: encounterFlightTime,
    targetedBy: new Set()
  }
  liveHazards.push(hazard)
  spawnedThisEncounter += 1
  room.send('notifyHazardSpawn', hazardSpawnMessage(hazard))
  console.log(`[SERVER] Encounter ${encounterId} spawned hazard ${hazard.hazardId} (${spawnedThisEncounter}/${encounterHazardCount})`)
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

function setPlayerTarget(playerAddress: string, hazardId: number) {
  const hazard = liveHazards.find((h) => h.hazardId === hazardId)
  if (!hazard) return

  const previousId = playerTarget.get(playerAddress)
  if (previousId === hazardId) return

  if (previousId !== undefined) {
    const previous = liveHazards.find((h) => h.hazardId === previousId)
    if (previous) {
      previous.targetedBy.delete(playerAddress)
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

function beginEncounter(stopId: string) {
  const params = encounterParams[stopId]
  if (params === undefined) {
    if (!isPathFinished()) resumeFromStop()
    return
  }

  activeEncounterId = stopId
  encounterElapsed = 0
  encounterHazardCount = params.hazardCount
  encounterFlightTime = params.flightTime
  spawnedThisEncounter = 0
  liveHazards = []
  clearTargeting()
}

function endEncounter() {
  if (!activeEncounterId) return
  const encounterId = activeEncounterId
  completedEncounterIds.push(encounterId)
  liveHazards = []
  clearTargeting()
  activeEncounterId = null
  encounterElapsed = 0
  encounterHazardCount = 0
  encounterFlightTime = 0
  spawnedThisEncounter = 0
  console.log(`[SERVER] Encounter ${encounterId} ended`)
  room.send('notifyEncounterEnd', { encounterId })
  if (!isPathFinished()) {
    resumeFromStop()
  }
}

function EncounterSystem(dt: number) {
  if (!isShipStopped()) return
  const stopId = currentStopId()
  if (!stopId || stopId === START_STOP_ID) return
  if (completedEncounterIds.indexOf(stopId) !== -1) return

  if (activeEncounterId !== stopId) {
    beginEncounter(stopId)
  }
  if (!activeEncounterId) return

  const step = Math.min(dt, 0.1)
  encounterElapsed += step
  while (
    spawnedThisEncounter < encounterHazardCount &&
    encounterElapsed >= spawnedThisEncounter * HAZARD_SPAWN_INTERVAL
  ) {
    spawnNextHazard(activeEncounterId)
  }

  const expiredIds: number[] = []
  for (const hazard of liveHazards) {
    hazard.flightElapsed += step
    if (hazard.flightElapsed >= hazard.flightTime) {
      expiredIds.push(hazard.hazardId)
    }
  }
  for (const hazardId of expiredIds) {
    destroyHazard(hazardId, true)
  }

  if (spawnedThisEncounter >= encounterHazardCount && liveHazards.length === 0) {
    endEncounter()
  }
}

export function setupServerEncounters() {
  engine.addSystem(EncounterSystem)

  room.onMessage('requestHazardTarget', (data, context) => {
    if (!context?.from) return
    setPlayerTarget(context.from, data.hazardId)
  })
}

export function resetEncounterState(): void {
  completedEncounterIds.length = 0
  liveHazards = []
  clearTargeting()
  nextHazardId = 1
  activeEncounterId = null
  encounterElapsed = 0
  encounterHazardCount = 0
  encounterFlightTime = 0
  spawnedThisEncounter = 0
}
