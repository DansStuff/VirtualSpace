export const HAZARD_RADIUS = 4

/** Seconds between hazard spawns. */
export const HAZARD_SPAWN_INTERVAL = 2

/** Virtual-space distance ahead of the ship to place a spawned hazard. */
export const HAZARD_SPAWN_DISTANCE = 240

/** Virtual-space distance from the ship at the end of an asteroid's flight. */
export const HAZARD_IMPACT_DISTANCE = 8

/** Random spawn cone in front of the ship (full width / height, degrees). */
export const HAZARD_CONE_HORIZONTAL_DEGREES = 120
export const HAZARD_CONE_VERTICAL_DEGREES = 20

export type EncounterParams = {
  hazardCount: number
  /** Seconds each asteroid exists before it hits the ship (unless shot). */
  flightTime: number
  // later: asteroidHp, etc.
}

export const encounterParams: Record<string, EncounterParams> = {
  'encounter-1': { hazardCount: 4, flightTime: 4 },
  'encounter-2': { hazardCount: 4, flightTime: 4 },
  'encounter-3': { hazardCount: 4, flightTime: 4 },
  'encounter-4': { hazardCount: 4, flightTime: 4 },
  'encounter-5': { hazardCount: 4, flightTime: 4 },
  'encounter-6': { hazardCount: 4, flightTime: 4 },
  'encounter-7': { hazardCount: 4, flightTime: 4 }
}
