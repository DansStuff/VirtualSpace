import { AssetLoad, engine } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { registerGlobalSounds } from './audio/global'
import { HAZARD_HIT_SHIP_SOUND_PATH, HAZARD_SELECT_SOUND_PATH, PATH_START_STOP_ID, SHIP_LASER_SOUND_PATH } from './constants'
import { catchUpStopId, replayEncounterState, resetEncounterState, setupEncounters } from './encounters/lifecycle'
import { setupHazards } from './hazards/simulation'
import { despawnAllHazards } from './hazards/visuals'
import { room } from './networking/messages'
import { currentStopId, isPathFinished, resetPathToStart, resumeFromStop, ShipPathSystem, teleportToStop } from './path/follow'
import { setupSpaceObjects } from './spaceobjects/planets'
import { setupShipWeapons } from './shipweapons/lasers'
import { markMissionReset, markMissionStarted, setupUi } from './ui'
import { setupDebugTeleportToShip } from './utilities'

type MissionState = {
  encounterId: string
  startedAt: number
}

function setupServerRoom() {
  let mission: MissionState | null = null

  function missionStartPayload(startedAt: number) {
    return {
      encounterId: catchUpStopId() ?? PATH_START_STOP_ID,
      startedAt
    }
  }

  function sendInitialState(playerAddress: string) {
    if (mission) {
      room.send('notifyMissionStart', missionStartPayload(mission.startedAt), { to: [playerAddress] })
    }
    replayEncounterState(playerAddress)
  }

  room.onMessage('requestMissionStart', (_data, context) => {
    if (!context) return
    if (mission) return

    mission = {
      encounterId: PATH_START_STOP_ID,
      startedAt: Date.now()
    }
    console.log(`[SERVER] Mission started (${mission.encounterId}) by ${context.from}`)
    room.send('notifyMissionStart', mission)
    resumeFromStop()
  })

  room.onMessage('requestInitialState', (_data, context) => {
    if (!context) return
    console.log(`[SERVER] Initial state requested by ${context.from}`)
    sendInitialState(context.from)
  })

  room.onMessage('requestNewMission', (_data, context) => {
    if (!context) return
    if (!mission || !isPathFinished()) return

    console.log(`[SERVER] Mission reset by ${context.from}`)
    mission = null
    resetEncounterState()
    resetPathToStart()
    room.send('notifyNewMission', { resetAt: Date.now() })
  })
}

function setupClientRoom() {
  let appliedStartedAt = 0
  let appliedResetAt = 0

  room.onMessage('notifyMissionStart', (data) => {
    if (data.startedAt <= appliedStartedAt) return
    appliedStartedAt = data.startedAt
    console.log(`[CLIENT] Mission started: ${data.encounterId}`)
    markMissionStarted()
    if (data.encounterId !== PATH_START_STOP_ID) {
      teleportToStop(data.encounterId)
    } else if (currentStopId() === PATH_START_STOP_ID) {
      resumeFromStop()
    }
  })

  room.onMessage('notifyNewMission', (data) => {
    if (data.resetAt <= appliedResetAt) return
    appliedResetAt = data.resetAt
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
  setupShipWeapons()
  engine.addSystem(ShipPathSystem)

  if (isServer()) {
    console.log(`[SERVER] Init server`)
    setupServerRoom()
    return
  }

  setupClientRoom()
  setupUi()
  setupDebugTeleportToShip()
  registerGlobalSounds([HAZARD_SELECT_SOUND_PATH, HAZARD_HIT_SHIP_SOUND_PATH])
  AssetLoad.create(engine.RootEntity, {
    assets: [SHIP_LASER_SOUND_PATH, HAZARD_SELECT_SOUND_PATH, HAZARD_HIT_SHIP_SOUND_PATH]
  })
}
