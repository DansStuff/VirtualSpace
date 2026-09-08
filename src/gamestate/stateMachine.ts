import { isServer } from '@dcl/sdk/network'
import { ENCOUNTER_PARAMS, PATH_START_STOP_ID } from '../constants'
import { room } from '../networking/messages'

export type MissionState = 'idle' | 'traveling' | 'inEncounter' | 'missionComplete'

export type MissionEvent =
  | { type: 'MISSION_START' }
  | { type: 'STOP_REACHED'; stopId: string; pathFinished: boolean }
  | { type: 'STAGE_CLEARED' }
  | { type: 'ENCOUNTER_CLEARED'; pathFinished: boolean }
  | { type: 'SHIP_DESTROYED' }
  | { type: 'MISSION_RESET' }

let currentState: MissionState = 'idle'
let encounterId: string | null = null
let stageIndex = -1

function hasEncounterStages(stopId: string): boolean {
  const params = ENCOUNTER_PARAMS[stopId]
  return params !== undefined && params.stages.length > 0
}

function nextState(state: MissionState, event: MissionEvent): MissionState | null {
  switch (state) {
    case 'idle':
      if (event.type === 'MISSION_START') return 'traveling'
      return null
    case 'traveling':
      if (event.type === 'STOP_REACHED') {
        if (hasEncounterStages(event.stopId)) return 'inEncounter'
        if (event.pathFinished) return 'missionComplete'
        return 'traveling'
      }
      return null
    case 'inEncounter':
      if (event.type === 'STAGE_CLEARED') return 'inEncounter'
      if (event.type === 'ENCOUNTER_CLEARED') return event.pathFinished ? 'missionComplete' : 'traveling'
      if (event.type === 'SHIP_DESTROYED') return 'idle'
      return null
    case 'missionComplete':
      if (event.type === 'MISSION_RESET') return 'idle'
      return null
  }
}

function sendEncounterStageNotify(): void {
  if (!encounterId) return
  const turret = ENCOUNTER_PARAMS[encounterId]?.stages[stageIndex]?.turret
  if (!turret) return
  room.send('notifyEncounterStage', { turret, startedAt: Date.now() })
}

function sendRoomNotify(event: MissionEvent): void {
  if (!isServer()) return

  switch (event.type) {
    case 'MISSION_START':
      room.send('notifyMissionStart', { encounterId: PATH_START_STOP_ID, startedAt: Date.now() })
      return
    case 'STOP_REACHED':
      if (currentState === 'inEncounter') sendEncounterStageNotify()
      return
    case 'STAGE_CLEARED':
      sendEncounterStageNotify()
      return
    case 'ENCOUNTER_CLEARED':
      if (encounterId) room.send('notifyEncounterEnd', { encounterId })
      return
    case 'SHIP_DESTROYED':
      room.send('notifyShipDestroyed', { destroyedAt: Date.now() })
      return
    case 'MISSION_RESET':
      room.send('notifyNewMission', { resetAt: Date.now() })
      return
  }
}

export function processEvent(event: MissionEvent): void {
  const next = nextState(currentState, event)
  if (next === null) {
    console.log(`[STATE] Ignored ${event.type} in ${currentState}`)
    return
  }

  if (event.type === 'STOP_REACHED' && next === 'inEncounter') {
    encounterId = event.stopId
    stageIndex = 0
  }
  if (event.type === 'STAGE_CLEARED') {
    stageIndex += 1
  }

  currentState = next
  sendRoomNotify(event)

  if (next !== 'inEncounter') {
    encounterId = null
    stageIndex = -1
  }
}

export function setupStateMachine(): void {
  currentState = 'idle'
  encounterId = null
  stageIndex = -1
}
