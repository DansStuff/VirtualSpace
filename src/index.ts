/**
 * Scene composition root. Calls each domain `setup*` and, on the client,
 * registers mission HUD/notify handlers. Server request handling lives in
 * the state machine.
 */
import { AssetLoad, engine } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { registerGlobalSounds } from './audio/global'
import { ENCOUNTER_STAGE_SOUND_PATH, HAZARD_HIT_SHIP_SOUND_PATH, HAZARD_SELECT_SOUND_PATH, PATH_START_STOP_ID, SHIP_LASER_SOUND_PATH } from './constants'
import { setupEncounters } from './encounters/client'
import { setupGameState } from './gamestate'
import { setupStateMachine } from './gamestate/stateMachine'
import { setupHazards } from './hazards/simulation'
import { despawnAllHazards } from './hazards/visuals'
import { room } from './networking/messages'
import { currentStopId, resetPathToStart, resumeFromStop, ShipPathSystem } from './path/follow'
import { setupPlayers } from './players/stats'
import { exitWeaponCamera, setupSceneObjects } from './sceneObjects'
import { setupSpaceObjects } from './spaceobjects/planets'
import { setupShipWeapons } from './shipweapons/lasers'
import { markShipDestroyed, setupUi } from './ui'
import { setupDebugTeleportToShip } from './utilities'

function setupClientRoom() {
  let appliedStartedAt = 0
  let appliedResetAt = 0
  let appliedDestroyedAt = 0

  function applyClientMissionReset() {
    resetPathToStart()
    despawnAllHazards()
    exitWeaponCamera()
  }

  room.onMessage('notifyMissionStart', (data) => {
    if (data.startedAt <= appliedStartedAt) return
    appliedStartedAt = data.startedAt
    console.log(`[CLIENT] Mission started: ${data.encounterId}`)
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
