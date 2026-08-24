import { engine } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { spawnPlanetsFromRoute /*, spawnDistantStars, setupAsteroids*/ } from './factory'
import { markMissionStarted, setupUi } from './ui'
import { AsteroidSystem, PlanetSystem } from './systems'
import { currentStopId, resumeFromStop, ShipPathSystem } from './path/follow'
import { setupDebugTeleportToShip } from './utilities'
import { room } from './shared/messages'
import { START_STOP_ID } from './path/route'
import { replayEncounterState, setupServerEncounters } from './server/encounters'
import { setupClientHazards } from './client/hazards'

type MissionState = {
  encounterId: string
  startedAt: number
}

function setupServerRoom() {
  let mission: MissionState | null = null

  function sendInitialState(playerAddress: string) {
    if (mission) {
      room.send('notifyMissionStart', mission, { to: [playerAddress] })
    }
    replayEncounterState(playerAddress)
  }

  room.onMessage('requestMissionStart', (_data, context) => {
    if (!context) return

    if (!mission) {
      mission = {
        encounterId: START_STOP_ID,
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
}

function setupClientRoom() {
  room.onMessage('notifyMissionStart', (data) => {
    console.log(`[CLIENT] Mission started: ${data.encounterId}`)
    markMissionStarted()
    if (currentStopId() === START_STOP_ID) {
      resumeFromStop()
    }
  })

  setupClientHazards()

  let requestedInitialState = false
  const requestInitialState = () => {
    if (requestedInitialState) return
    requestedInitialState = true
    room.send('requestInitialState', {})
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
  if (isServer()) {
    console.log(`[SERVER] Init server`)
    setupServerRoom()
    setupServerEncounters()
    engine.addSystem(ShipPathSystem)
    return
  }

  setupClientRoom()

  setupUi()

  spawnPlanetsFromRoute()
  //spawnDistantStars(40)
  //setupAsteroids()

  engine.addSystem(PlanetSystem)
  engine.addSystem(ShipPathSystem)
  engine.addSystem(AsteroidSystem)
  setupDebugTeleportToShip()
}
