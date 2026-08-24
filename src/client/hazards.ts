import { engine, Entity } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { AsteroidData } from '../components'
import { spawnHazard } from '../factory'
import { currentStopId, lastStopId, markEncounterComplete, resumeFromStop } from '../path/follow'
import { HAZARD_IMPACT_DISTANCE, HAZARD_RADIUS } from '../shared/encounters'
import { room } from '../shared/messages'
import { shipVirtualPosition } from '../ship'
import { forgetAsteroidSpin } from '../systems'
import { directionFromTo } from '../utilities'
import { markMissionComplete } from '../ui'

type SpawnedHazard = {
  hazardId: number
  encounterId: string
  entity: Entity
  start: Vector3
  end: Vector3
  flightTime: number
  elapsed: number
}

const spawned: SpawnedHazard[] = []

function virtualFlightPath(spawnPosition: Vector3): { start: Vector3; end: Vector3 } {
  const dir = directionFromTo(shipVirtualPosition, spawnPosition)
  const start = Vector3.clone(spawnPosition)
  const end = Vector3.add(shipVirtualPosition, Vector3.scale(dir, HAZARD_IMPACT_DISTANCE))
  return { start, end }
}

function applyVirtualPosition(hazard: SpawnedHazard) {
  const duration = hazard.flightTime
  const u = duration <= 1e-6 ? 1 : Math.min(1, hazard.elapsed / duration)
  const asteroid = AsteroidData.getMutable(hazard.entity)
  asteroid.position = Vector3.lerp(hazard.start, hazard.end, u)
}

function despawnHazard(hazardId: number) {
  for (let i = spawned.length - 1; i >= 0; i--) {
    if (spawned[i].hazardId !== hazardId) continue
    forgetAsteroidSpin(spawned[i].entity)
    engine.removeEntity(spawned[i].entity)
    spawned.splice(i, 1)
    return
  }
}

function despawnEncounter(encounterId: string) {
  for (let i = spawned.length - 1; i >= 0; i--) {
    if (spawned[i].encounterId !== encounterId) continue
    forgetAsteroidSpin(spawned[i].entity)
    engine.removeEntity(spawned[i].entity)
    spawned.splice(i, 1)
  }
}

export function despawnAllHazards() {
  for (const hazard of spawned) {
    forgetAsteroidSpin(hazard.entity)
    engine.removeEntity(hazard.entity)
  }
  spawned.length = 0
}

function HazardFlightSystem(dt: number) {
  const step = Math.min(dt, 0.1)
  for (const hazard of spawned) {
    hazard.elapsed += step
    applyVirtualPosition(hazard)
  }
}

export function setupClientHazards() {
  engine.addSystem(HazardFlightSystem)

  room.onMessage('notifyHazardSpawn', (data) => {
    if (spawned.some((h) => h.hazardId === data.hazardId)) return
    const path = virtualFlightPath(data.position)
    const entity = spawnHazard(path.start, HAZARD_RADIUS)
    const hazard: SpawnedHazard = {
      hazardId: data.hazardId,
      encounterId: data.encounterId,
      entity,
      start: path.start,
      end: path.end,
      flightTime: data.flightTime,
      elapsed: 0
    }
    spawned.push(hazard)
    applyVirtualPosition(hazard)
    console.log(`[CLIENT] Hazard ${data.hazardId} spawned for ${data.encounterId} (${data.flightTime}s)`)
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
    if (data.encounterId === lastStopId()) {
      markMissionComplete()
    }
    if (currentStopId() === data.encounterId) {
      resumeFromStop()
    }
  })
}
