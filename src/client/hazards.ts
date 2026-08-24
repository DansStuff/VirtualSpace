import { engine, Entity } from '@dcl/sdk/ecs'
import { spawnHazard } from '../factory'
import { currentStopId, markEncounterComplete, resumeFromStop } from '../path/follow'
import { HAZARD_RADIUS } from '../shared/encounters'
import { room } from '../shared/messages'

type SpawnedHazard = {
  hazardId: number
  encounterId: string
  entity: Entity
}

const spawned: SpawnedHazard[] = []

function despawnHazard(hazardId: number) {
  for (let i = spawned.length - 1; i >= 0; i--) {
    if (spawned[i].hazardId !== hazardId) continue
    engine.removeEntity(spawned[i].entity)
    spawned.splice(i, 1)
    return
  }
}

function despawnEncounter(encounterId: string) {
  for (let i = spawned.length - 1; i >= 0; i--) {
    if (spawned[i].encounterId !== encounterId) continue
    engine.removeEntity(spawned[i].entity)
    spawned.splice(i, 1)
  }
}

export function setupClientHazards() {
  room.onMessage('notifyHazardSpawn', (data) => {
    if (spawned.some((h) => h.hazardId === data.hazardId)) return
    const entity = spawnHazard(data.position, HAZARD_RADIUS)
    spawned.push({ hazardId: data.hazardId, encounterId: data.encounterId, entity })
    console.log(`[CLIENT] Hazard ${data.hazardId} spawned for ${data.encounterId}`)
  })

  room.onMessage('notifyHazardDestroyed', (data) => {
    const cause = data.hitShip ? 'hit ship' : 'shot'
    console.log(`[CLIENT] Hazard ${data.hazardId} destroyed (${cause})`)
    despawnHazard(data.hazardId)
  })

  room.onMessage('notifyEncounterEnd', (data) => {
    console.log(`[CLIENT] Encounter ended: ${data.encounterId}`)
    markEncounterComplete(data.encounterId)
    despawnEncounter(data.encounterId)
    if (currentStopId() === data.encounterId) {
      resumeFromStop()
    }
  })
}
