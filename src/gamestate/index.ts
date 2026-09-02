import { engine, Entity } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { PATH_START_STOP_ID, SHIP_BASE_HULL_HP } from '../constants'
import { room } from '../networking/messages'
import { isPathFinished, resumeFromStop, teleportToStop } from '../path/follow'
import { GameState, type GameStateSnapshot } from './schema'

export { GameState, type GameStateSnapshot } from './schema'

let stateEntity: Entity | null = null

export function defaultGameState(): GameStateSnapshot {
  return {
    encounterId: PATH_START_STOP_ID,
    hullHp: SHIP_BASE_HULL_HP,
    inEncounter: false,
    missionStarted: false
  }
}

function stateEntityOrThrow(): Entity {
  if (stateEntity === null) {
    throw new Error('GameState entity is not created; call setupGameState() first')
  }
  return stateEntity
}

export function getGameState(): GameStateSnapshot {
  return GameState.get(stateEntityOrThrow())
}

export function snapshotGameState(): GameStateSnapshot {
  const state = getGameState()
  return {
    encounterId: state.encounterId,
    hullHp: state.hullHp,
    inEncounter: state.inEncounter,
    missionStarted: state.missionStarted
  }
}

export function applyGameState(data: GameStateSnapshot): void {
  const state = GameState.getMutable(stateEntityOrThrow())
  state.encounterId = data.encounterId
  state.hullHp = data.hullHp
  state.inEncounter = data.inEncounter
  state.missionStarted = data.missionStarted
}

export function applyMissionStarted(encounterId: string = PATH_START_STOP_ID): void {
  const state = GameState.getMutable(stateEntityOrThrow())
  state.missionStarted = true
  state.inEncounter = false
  state.encounterId = encounterId
}

export function applyEncounterActive(encounterId: string): void {
  const state = GameState.getMutable(stateEntityOrThrow())
  state.inEncounter = true
  state.encounterId = encounterId
}

export function applyEncounterEnded(encounterId: string): void {
  const state = GameState.getMutable(stateEntityOrThrow())
  state.inEncounter = false
  state.encounterId = encounterId
}

export function resetGameState(): void {
  applyGameState(defaultGameState())
}

export function applyHullHp(hullHp: number): void {
  GameState.getMutable(stateEntityOrThrow()).hullHp = Math.max(0, hullHp)
}

export function damageShipHull(amount: number): number {
  const state = GameState.getMutable(stateEntityOrThrow())
  state.hullHp = Math.max(0, state.hullHp - amount)
  return state.hullHp
}

/** Place the local ship from the current GameState snapshot (connect catch-up only). */
export function placeFromGameState(): void {
  const state = getGameState()
  if (!state.missionStarted) return
  if (state.inEncounter) {
    teleportToStop(state.encounterId)
    return
  }
  if (state.encounterId === PATH_START_STOP_ID) {
    resumeFromStop()
    return
  }
  teleportToStop(state.encounterId)
  if (!isPathFinished()) {
    resumeFromStop()
  }
}

export function setupGameState(): void {
  if (stateEntity !== null) return
  stateEntity = engine.addEntity()
  GameState.create(stateEntity, defaultGameState())

  if (isServer()) return

  room.onMessage('notifyGameState', (data) => {
    applyGameState(data)
    placeFromGameState()
    console.log(
      `[CLIENT] Game state snapshot: ${data.encounterId} mission=${data.missionStarted} fight=${data.inEncounter} hull=${data.hullHp}`
    )
  })
}
