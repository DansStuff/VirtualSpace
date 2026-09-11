/**
 * The only server `room.onMessage` / `room.send`. Imported by the state
 * machine; other server modules notify through it, they do not import `room`.
 */
import { PATH_START_STOP_ID, type HazardKind } from '../constants'
import { room } from '../networking/messages'

export type HazardSpawnNotify = {
  hazardId: number
  encounterId: string
  position: { x: number; y: number; z: number }
  flightTime: number
  kind: HazardKind
}

export type HazardTargetedNotify = {
  hazardId: number
  targeters: string[]
}

export type HazardDestroyedNotify = {
  hazardId: number
  hitShip: boolean
}

export type SaucerFiredNotify = {
  hazardId: number
  position: { x: number; y: number; z: number }
}

export type ServerInboxHandlers = {
  onMissionStart: (playerAddress: string) => void
  onNewMission: (playerAddress: string) => void
  onInitialState: (playerAddress: string) => void
  onHazardTarget: (playerAddress: string, hazardId: number) => void
  onRepairBreach: (playerAddress: string, breachId: number) => void
}

export function notifyMissionStart(): void {
  room.send('notifyMissionStart', { encounterId: PATH_START_STOP_ID, startedAt: Date.now() })
}

export function notifyNewMission(): void {
  room.send('notifyNewMission', { resetAt: Date.now() })
}

export function notifyShipDestroyed(): void {
  room.send('notifyShipDestroyed', { destroyedAt: Date.now() })
}

export function notifyEncounterEnd(encounterId: string): void {
  room.send('notifyEncounterEnd', { encounterId })
}

export function notifyEncounterStage(turret: string, to?: string): void {
  const payload = { turret, startedAt: Date.now() }
  if (to) {
    room.send('notifyEncounterStage', payload, { to: [to] })
    return
  }
  room.send('notifyEncounterStage', payload)
}

export function notifyHazardSpawn(data: HazardSpawnNotify): void {
  room.send('notifyHazardSpawn', data)
}

export function notifyHazardTargeted(data: HazardTargetedNotify): void {
  room.send('notifyHazardTargeted', {
    hazardId: data.hazardId,
    // TODO: potentially limit the number of targeters passed over the network to three
    targeters: data.targeters
  })
}

export function notifyHazardDestroyed(data: HazardDestroyedNotify): void {
  room.send('notifyHazardDestroyed', data)
}

export function notifySaucerFired(data: SaucerFiredNotify): void {
  room.send('notifySaucerFired', data)
}

export function setupServerInbox(handlers: ServerInboxHandlers): void {
  room.onMessage('requestMissionStart', (_data, context) => {
    if (!context) return
    handlers.onMissionStart(context.from)
  })

  room.onMessage('requestNewMission', (_data, context) => {
    if (!context) return
    handlers.onNewMission(context.from)
  })

  room.onMessage('requestInitialState', (_data, context) => {
    if (!context) return
    handlers.onInitialState(context.from)
  })

  room.onMessage('requestHazardTarget', (data, context) => {
    if (!context?.from) return
    handlers.onHazardTarget(context.from, data.hazardId)
  })

  room.onMessage('requestRepairBreach', (data, context) => {
    if (!context?.from) return
    handlers.onRepairBreach(context.from, data.breachId)
  })
}
