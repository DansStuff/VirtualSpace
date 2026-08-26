import { engine } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { HAZARD_SPAWN_INTERVAL } from '../hazards/constants'
import {
  clearLive,
  hasLive,
  replayLive,
  resetLive,
  spawn,
  tick
} from '../hazards/simulation'
import { despawnEncounter } from '../hazards/visuals'
import { room } from '../networking/messages'
import { currentStopId, isPathFinished, isShipStopped, lastStopId, markEncounterComplete, resumeFromStop } from '../path/follow'
import { START_STOP_ID } from '../path/route'
import { markMissionComplete } from '../ui'
import { encounterParams } from './params'

const completedEncounterIds: string[] = []
let activeEncounterId: string | null = null
let encounterElapsed = 0
let encounterHazardCount = 0
let encounterFlightTime = 0
let encounterAsteroidHp = 0
let spawnedThisEncounter = 0

export function replayEncounterState(playerAddress: string) {
  for (const encounterId of completedEncounterIds) {
    room.send('notifyEncounterEnd', { encounterId }, { to: [playerAddress] })
  }
  replayLive(playerAddress)
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
  encounterAsteroidHp = params.asteroidHp
  spawnedThisEncounter = 0
  clearLive()
}

function endEncounter() {
  if (!activeEncounterId) return
  const encounterId = activeEncounterId
  completedEncounterIds.push(encounterId)
  clearLive()
  activeEncounterId = null
  encounterElapsed = 0
  encounterHazardCount = 0
  encounterFlightTime = 0
  encounterAsteroidHp = 0
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
    const hazardId = spawn(activeEncounterId, {
      flightTime: encounterFlightTime,
      hp: encounterAsteroidHp
    })
    spawnedThisEncounter += 1
    console.log(
      `[SERVER] Encounter ${activeEncounterId} spawned hazard ${hazardId} (${spawnedThisEncounter}/${encounterHazardCount})`
    )
  }

  tick(step)

  if (spawnedThisEncounter >= encounterHazardCount && !hasLive()) {
    endEncounter()
  }
}

export function resetEncounterState(): void {
  completedEncounterIds.length = 0
  resetLive()
  activeEncounterId = null
  encounterElapsed = 0
  encounterHazardCount = 0
  encounterFlightTime = 0
  encounterAsteroidHp = 0
  spawnedThisEncounter = 0
}

export function setupEncounters() {
  if (isServer()) {
    engine.addSystem(EncounterSystem)
    return
  }

  room.onMessage('notifyEncounterEnd', (data) => {
    console.log(`[CLIENT] Encounter ended: ${data.encounterId}`)
    markEncounterComplete(data.encounterId)
    despawnEncounter(data.encounterId)
    if (data.encounterId === lastStopId()) {
      markMissionComplete()
    }
    if (currentStopId() === data.encounterId) {
      resumeFromStop()
    }
  })
}
