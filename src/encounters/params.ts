export type EncounterParams = {
  hazardCount: number
  /** Seconds each asteroid exists before it hits the ship (unless shot). */
  flightTime: number
  asteroidHp: number
}

export const encounterParams: Record<string, EncounterParams> = {
  'encounter-1': { hazardCount: 4, flightTime: 4, asteroidHp: 1 },
  'encounter-2': { hazardCount: 4, flightTime: 4, asteroidHp: 1 },
  'encounter-3': { hazardCount: 4, flightTime: 4, asteroidHp: 1 },
  'encounter-4': { hazardCount: 4, flightTime: 4, asteroidHp: 1 },
  'encounter-5': { hazardCount: 4, flightTime: 4, asteroidHp: 1 },
  'encounter-6': { hazardCount: 4, flightTime: 4, asteroidHp: 1 },
  'encounter-7': { hazardCount: 4, flightTime: 4, asteroidHp: 1 }
}
