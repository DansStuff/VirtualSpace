import { engine } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { PATH_START_STOP_ID } from './constants'
import { replayEncounterState, resetEncounterState, setupEncounters } from './encounters/lifecycle'
import { setupHazards } from './hazards/simulation'
import { despawnAllHazards } from './hazards/visuals'
import { room } from './networking/messages'
import { currentStopId, isPathFinished, resetPathToStart, resumeFromStop, ShipPathSystem } from './path/follow'
import { setupSpaceObjects } from './spaceobjects/planets'
import { markMissionReset, markMissionStarted, setupUi } from './ui'
import { setupDebugTeleportToShip } from './utilities'

type MissionState = {
  encounterId: string
  startedAt: number
}

function setupServerRoom() {
  let mission: MissionState | null = null

  function sendInitialState(playerAddress: string) {
    if (mission && !isPathFinished()) {
      room.send('notifyMissionStart', mission, { to: [playerAddress] })
    }
    replayEncounterState(playerAddress)
  }

  room.onMessage('requestMissionStart', (_data, context) => {
    if (!context) return

    if (!mission) {
      mission = {
        encounterId: PATH_START_STOP_ID,
        startedAt: Date.now()
      }
      console.log(`[SERVER] Mission started (${mission.encounterId}) by ${context.from}`)
      room.send('notifyMissionStart', mission)
      resumeFromStop()
      return
    }

    room.send('notifyMissionStart', mission, { to: [context.from] })
  })

  room.onMessage('requestInitialState', (_data, context) => {
    if (!context) return
    console.log(`[SERVER] Initial state requested by ${context.from}`)
    sendInitialState(context.from)
  })

  room.onMessage('requestNewMission', (_data, context) => {
    if (!context) return
    if (!isPathFinished()) return

    console.log(`[SERVER] Mission reset by ${context.from}`)
    mission = null
    resetEncounterState()
    resetPathToStart()
    room.send('notifyNewMission', { resetAt: Date.now() })
  })
}

function setupClientRoom() {
  room.onMessage('notifyMissionStart', (data) => {
    console.log(`[CLIENT] Mission started: ${data.encounterId}`)
    markMissionStarted()
    if (currentStopId() === PATH_START_STOP_ID) {
      resumeFromStop()
    }
  })

  room.onMessage('notifyNewMission', (data) => {
    console.log(`[CLIENT] Mission reset (${data.resetAt})`)
    resetPathToStart()
    despawnAllHazards()
    markMissionReset()
  })

  let requestedInitialState = false
  const requestInitialState = () => {
    if (requestedInitialState) return
    requestedInitialState = true
    room.send('requestInitialState', { requestedAt: Date.now() })
  }

  const unsubscribe = room.onReady((ready) => {
    if (!ready) return
    requestInitialState()
    unsubscribe()
  })

  if (room.isReady()) {
    requestInitialState()
    unsubscribe()
  }
}

export function main() {
  setupEncounters()
  setupHazards()
  setupSpaceObjects()
  engine.addSystem(ShipPathSystem)

  if (isServer()) {
    console.log(`[SERVER] Init server`)
    setupServerRoom()
    return
  }

  setupClientRoom()
  setupUi()
  setupDebugTeleportToShip()
}
