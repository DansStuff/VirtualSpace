/**
 * One server-side fight instance. The state machine creates, ticks, and
 * disposes it. No `room` or `processEvent` — tick results are interpreted
 * by the machine.
 */
import {
  ENCOUNTER_PARAMS,
  ENCOUNTER_STAGE_TELEGRAPH_SECONDS,
  HAZARD_SPAWN_INTERVAL,
  SIMULATION_MAX_DELTA_SECONDS,
  type EncounterStage
} from '../constants'
import { getGameState } from '../gamestate'
import { clearLive, hasLive, spawn, tick } from '../hazards/simulation'

export type EncounterTickResult = 'running' | 'stageStarted' | 'cleared' | 'shipDestroyed'

export interface Encounter {
  readonly id: string
  currentTurret(): string | null
  tick(dt: number): EncounterTickResult
  dispose(): void
}

export function createWaveEncounter(stopId: string): Encounter {
  const params = ENCOUNTER_PARAMS[stopId]
  if (params === undefined || params.stages.length === 0) {
    throw new Error(`No encounter stages for stop ${stopId}`)
  }
  return new WaveEncounter(stopId, params.stages)
}

class WaveEncounter implements Encounter {
  readonly id: string
  private readonly stages: EncounterStage[]
  private stageIndex = 0
  private stageElapsed = 0
  private spawnedThisStage = 0

  constructor(id: string, stages: EncounterStage[]) {
    this.id = id
    this.stages = stages
    clearLive()
  }

  currentTurret(): string | null {
    return this.stages[this.stageIndex]?.turret ?? null
  }

  tick(dt: number): EncounterTickResult {
    const stage = this.stages[this.stageIndex]
    if (!stage) return 'cleared'

    const step = Math.min(dt, SIMULATION_MAX_DELTA_SECONDS)
    this.stageElapsed += step
    while (
      this.spawnedThisStage < stage.hazardCount &&
      this.stageElapsed >= ENCOUNTER_STAGE_TELEGRAPH_SECONDS + this.spawnedThisStage * HAZARD_SPAWN_INTERVAL
    ) {
      const hazardId = spawn(this.id, {
        turret: stage.turret,
        flightTime: stage.flightTime,
        hp: stage.asteroidHp,
        hullDamage: stage.asteroidDamage
      })
      this.spawnedThisStage += 1
      console.log(
        `[SERVER] Encounter ${this.id} stage ${this.stageIndex} spawned hazard ${hazardId} (${this.spawnedThisStage}/${stage.hazardCount})`
      )
    }

    tick(step)

    if (getGameState().hullHp <= 0) {
      console.log(`[SERVER] Ship destroyed`)
      return 'shipDestroyed'
    }

    if (this.spawnedThisStage >= stage.hazardCount && !hasLive()) {
      if (this.stageIndex + 1 < this.stages.length) {
        this.stageIndex += 1
        this.stageElapsed = 0
        this.spawnedThisStage = 0
        console.log(`[SERVER] Encounter ${this.id} stage ${this.stageIndex} ${this.currentTurret()}`)
        return 'stageStarted'
      }
      return 'cleared'
    }

    return 'running'
  }

  dispose(): void {
    clearLive()
  }
}
