import { engine } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { playGlobalSound } from '../audio/global'
import {
  ENCOUNTER_PARAMS,
  ENCOUNTER_STAGE_SOUND_PATH,
  ENCOUNTER_STAGE_TELEGRAPH_SECONDS,
  HAZARD_SPAWN_INTERVAL,
  PATH_START_STOP_ID,
  SIMULATION_MAX_DELTA_SECONDS,
  type EncounterStage
} from '../constants'
import { applyEncounterActive, applyEncounterEnded, getGameState, resetGameState } from '../gamestate'
import {
  clearLive,
  hasLive,
  resetLive,
  spawn,
  tick
} from '../hazards/simulation'
import { despawnEncounter } from '../hazards/visuals'
import { room } from '../networking/messages'
import { currentStopId, isPathFinished, isShipStopped, markEncounterComplete, resetPathToStart, resumeFromStop } from '../path/follow'
import { markEncounterStage } from '../ui'

const completedEncounterIds: string[] = []
let activeEncounterId: string | null = null
let activeStages: EncounterStage[] = []
let currentStageIndex = -1
let stageElapsed = 0
let spawnedThisStage = 0

function currentStage(): EncounterStage | undefined {
  if (currentStageIndex < 0 || currentStageIndex >= activeStages.length) return undefined
  return activeStages[currentStageIndex]
}

export function currentEncounterStageTurret(): string | null {
  return currentStage()?.turret ?? null
}

function beginStage(index: number) {
  const stage = activeStages[index]
  if (!stage || !activeEncounterId) return

  currentStageIndex = index
  stageElapsed = 0
  spawnedThisStage = 0
  console.log(`[SERVER] Encounter ${activeEncounterId} stage ${index} ${stage.turret}`)
  room.send('notifyEncounterStage', { turret: stage.turret, startedAt: Date.now() })
}

function beginEncounter(stopId: string) {
  const params = ENCOUNTER_PARAMS[stopId]
  if (params === undefined || params.stages.length === 0) {
    if (!isPathFinished()) resumeFromStop()
    return
  }

  activeEncounterId = stopId
  activeStages = params.stages
  clearLive()
  applyEncounterActive(stopId)
  beginStage(0)
}

function endEncounter() {
  if (!activeEncounterId) return
  const encounterId = activeEncounterId
  completedEncounterIds.push(encounterId)
  clearLive()
  activeEncounterId = null
  activeStages = []
  currentStageIndex = -1
  stageElapsed = 0
  spawnedThisStage = 0
  applyEncounterEnded(encounterId)
  console.log(`[SERVER] Encounter ${encounterId} ended`)
  room.send('notifyEncounterEnd', { encounterId })
  if (!isPathFinished()) {
    resumeFromStop()
  }
}

function EncounterSystem(dt: number) {
  if (!isShipStopped()) return
  const stopId = currentStopId()
  if (!stopId || stopId === PATH_START_STOP_ID) return
  if (completedEncounterIds.indexOf(stopId) !== -1) return

  if (activeEncounterId !== stopId) {
    beginEncounter(stopId)
  }
  if (!activeEncounterId) return

  const stage = currentStage()
  if (!stage) return

  const step = Math.min(dt, SIMULATION_MAX_DELTA_SECONDS)
  stageElapsed += step
  while (
    spawnedThisStage < stage.hazardCount &&
    stageElapsed >= ENCOUNTER_STAGE_TELEGRAPH_SECONDS + spawnedThisStage * HAZARD_SPAWN_INTERVAL
  ) {
    const hazardId = spawn(activeEncounterId, {
      turret: stage.turret,
      flightTime: stage.flightTime,
      hp: stage.asteroidHp,
      hullDamage: stage.asteroidDamage
    })
    spawnedThisStage += 1
    console.log(
      `[SERVER] Encounter ${activeEncounterId} stage ${currentStageIndex} spawned hazard ${hazardId} (${spawnedThisStage}/${stage.hazardCount})`
    )
  }

  tick(step)

  if (getGameState().missionStarted && getGameState().hullHp <= 0) {
    console.log(`[SERVER] Ship destroyed`)
    resetMission()
    room.send('notifyShipDestroyed', { destroyedAt: Date.now() })
    return
  }

  if (spawnedThisStage >= stage.hazardCount && !hasLive()) {
    if (currentStageIndex + 1 < activeStages.length) {
      beginStage(currentStageIndex + 1)
    } else {
      endEncounter()
    }
  }
}

export function resetMission(): void {
  resetGameState()
  resetEncounterState()
  resetPathToStart()
}

export function resetEncounterState(): void {
  completedEncounterIds.length = 0
  resetLive()
  activeEncounterId = null
  activeStages = []
  currentStageIndex = -1
  stageElapsed = 0
  spawnedThisStage = 0
}

export function setupEncounters() {
  if (isServer()) {
    engine.addSystem(EncounterSystem)
    return
  }

  let appliedStageAt = 0

  room.onMessage('notifyEncounterStage', (data) => {
    if (data.startedAt <= appliedStageAt) return
    appliedStageAt = data.startedAt
    console.log(`[CLIENT] Encounter stage: ${data.turret}`)
    markEncounterStage(data.turret)
    playGlobalSound(ENCOUNTER_STAGE_SOUND_PATH)
  })

  room.onMessage('notifyEncounterEnd', (data) => {
    console.log(`[CLIENT] Encounter ended: ${data.encounterId}`)
    markEncounterComplete(data.encounterId)
    despawnEncounter(data.encounterId)
    applyEncounterEnded(data.encounterId)
    if (currentStopId() === data.encounterId) {
      resumeFromStop()
    }
  })
}
