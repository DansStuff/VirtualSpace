/**
 * One server-side fight instance. The state machine creates, ticks, and
 * disposes it. No `room` or `processEvent` — tick results are interpreted
 * by the machine.
 */
import {
  BASE_ASTEROID_DAMAGE,
  BASE_ASTEROID_HP,
  BASE_SAUCER_DAMAGE,
  BASE_SAUCER_HP,
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
    this.spawnDueHazards(stage)

    tick(step)

    if (getGameState().hullHp <= 0) {
      console.log(`[SERVER] Ship destroyed`)
      return 'shipDestroyed'
    }

    if (this.stageFullySpawned(stage) && !hasLive()) {
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

  private spawnDueHazards(stage: EncounterStage): void {
    if (stage.kind === 'saucer') {
      if (this.spawnedThisStage > 0) return
      if (this.stageElapsed < ENCOUNTER_STAGE_TELEGRAPH_SECONDS) return
      const hazardId = spawn(this.id, {
        kind: 'saucer',
        turret: stage.turret,
        hp: BASE_SAUCER_HP * stage.hpMultiplier,
        fireInterval: stage.saucerFireInterval,
        shotDamage: Math.round(BASE_SAUCER_DAMAGE * stage.damageMultiplier)
      })
      this.spawnedThisStage = 1
      console.log(`[SERVER] Encounter ${this.id} stage ${this.stageIndex} spawned saucer ${hazardId}`)
      return
    }

    while (
      this.spawnedThisStage < stage.hazardCount &&
      this.stageElapsed >= ENCOUNTER_STAGE_TELEGRAPH_SECONDS + this.spawnedThisStage * HAZARD_SPAWN_INTERVAL
    ) {
      const hazardId = spawn(this.id, {
        kind: 'asteroid',
        turret: stage.turret,
        flightTime: stage.flightTime,
        hp: BASE_ASTEROID_HP * stage.hpMultiplier,
        impactDamage: Math.round(BASE_ASTEROID_DAMAGE * stage.damageMultiplier)
      })
      this.spawnedThisStage += 1
      console.log(
        `[SERVER] Encounter ${this.id} stage ${this.stageIndex} spawned hazard ${hazardId} (${this.spawnedThisStage}/${stage.hazardCount})`
      )
    }
  }

  private stageFullySpawned(stage: EncounterStage): boolean {
    return stage.kind === 'saucer' ? this.spawnedThisStage >= 1 : this.spawnedThisStage >= stage.hazardCount
  }

  dispose(): void {
    clearLive()
  }
}
