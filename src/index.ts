import { AssetLoad, engine } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { registerGlobalSounds } from './audio/global'
import { ENCOUNTER_STAGE_SOUND_PATH, HAZARD_HIT_SHIP_SOUND_PATH, HAZARD_SELECT_SOUND_PATH, PATH_START_STOP_ID, SHIP_LASER_SOUND_PATH } from './constants'
import { currentEncounterStageTurret, resetMission, setupEncounters } from './encounters/lifecycle'
import { applyMissionStarted, getGameState, resetGameState, setupGameState, snapshotGameState } from './gamestate'
import { setupStateMachine } from './gamestate/stateMachine'
import { setupHazards } from './hazards/simulation'
import { despawnAllHazards } from './hazards/visuals'
import { room } from './networking/messages'
import { currentStopId, isPathFinished, resetPathToStart, resumeFromStop, ShipPathSystem } from './path/follow'
import { onPlayerConnected, setupPlayers } from './players/stats'
import { exitWeaponCamera, setupSceneObjects } from './sceneObjects'
import { setupSpaceObjects } from './spaceobjects/planets'
import { setupShipWeapons } from './shipweapons/lasers'
import { markShipDestroyed, setupUi } from './ui'
import { setupDebugTeleportToShip } from './utilities'

function setupServerRoom() {
  function sendInitialState(playerAddress: string) {
    room.send('notifyGameState', snapshotGameState(), { to: [playerAddress] })
    const turret = currentEncounterStageTurret()
    if (getGameState().inEncounter && turret) {
      room.send('notifyEncounterStage', { turret, startedAt: Date.now() }, { to: [playerAddress] })
    }
  }

  room.onMessage('requestMissionStart', (_data, context) => {
    if (!context) return
    if (getGameState().missionStarted) return

    applyMissionStarted(PATH_START_STOP_ID)
    console.log(`[SERVER] Mission started (${PATH_START_STOP_ID}) by ${context.from}`)
    room.send('notifyMissionStart', { encounterId: PATH_START_STOP_ID, startedAt: Date.now() })
    resumeFromStop()
  })

  room.onMessage('requestInitialState', (_data, context) => {
    if (!context) return
    console.log(`[SERVER] Initial state requested by ${context.from}`)
    onPlayerConnected(context.from)
    sendInitialState(context.from)
  })

  room.onMessage('requestNewMission', (_data, context) => {
    if (!context) return
    if (!getGameState().missionStarted || !isPathFinished()) return

    console.log(`[SERVER] Mission reset by ${context.from}`)
    resetMission()
    room.send('notifyNewMission', { resetAt: Date.now() })
  })
}

function setupClientRoom() {
  let appliedStartedAt = 0
  let appliedResetAt = 0
  let appliedDestroyedAt = 0

  function applyClientMissionReset() {
    resetPathToStart()
    despawnAllHazards()
    resetGameState()
    exitWeaponCamera()
  }

  room.onMessage('notifyMissionStart', (data) => {
    if (data.startedAt <= appliedStartedAt) return
    appliedStartedAt = data.startedAt
    console.log(`[CLIENT] Mission started: ${data.encounterId}`)
    applyMissionStarted(data.encounterId)
    if (currentStopId() === PATH_START_STOP_ID) {
      resumeFromStop()
    }
  })

  room.onMessage('notifyNewMission', (data) => {
    if (data.resetAt <= appliedResetAt) return
    appliedResetAt = data.resetAt
    console.log(`[CLIENT] Mission reset (${data.resetAt})`)
    applyClientMissionReset()
  })

  room.onMessage('notifyShipDestroyed', (data) => {
    if (data.destroyedAt <= appliedDestroyedAt) return
    appliedDestroyedAt = data.destroyedAt
    console.log(`[CLIENT] Ship destroyed`)
    applyClientMissionReset()
    markShipDestroyed()
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
  setupGameState()
  setupStateMachine()
  setupSceneObjects()
  setupEncounters()
  setupHazards()
  setupPlayers()
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
  registerGlobalSounds([HAZARD_SELECT_SOUND_PATH, HAZARD_HIT_SHIP_SOUND_PATH, ENCOUNTER_STAGE_SOUND_PATH])
  AssetLoad.create(engine.RootEntity, {
    assets: [SHIP_LASER_SOUND_PATH, HAZARD_SELECT_SOUND_PATH, HAZARD_HIT_SHIP_SOUND_PATH, ENCOUNTER_STAGE_SOUND_PATH]
  })
}
