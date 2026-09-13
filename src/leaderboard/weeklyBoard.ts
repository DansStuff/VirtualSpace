import { isServer } from '@dcl/sdk/network'
import { type MissionRecord, type RoundContributionRow } from '../players/contributions'
import { compareWeeklyMissions, utcIsoWeekId, WEEKLY_TOP_N } from './week'

export type WeeklyBoard = {
  weekId: string
  missions: MissionRecord[]
}

const STORAGE_KEY = 'weeklyMissions'

let board: WeeklyBoard = emptyBoard()
let loadPromise: Promise<void> | null = null

function emptyBoard(weekId: string = utcIsoWeekId()): WeeklyBoard {
  return { weekId, missions: [] }
}

function parseContribution(raw: unknown): RoundContributionRow | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as { playerId?: unknown; damage?: unknown; repairs?: unknown }
  if (typeof row.playerId !== 'string' || row.playerId.length === 0) return null
  if (typeof row.damage !== 'number' || !Number.isFinite(row.damage)) return null
  if (typeof row.repairs !== 'number' || !Number.isFinite(row.repairs)) return null
  return {
    playerId: row.playerId,
    damage: Math.max(0, Math.floor(row.damage)),
    repairs: Math.max(0, Math.floor(row.repairs))
  }
}

function parseMission(raw: unknown): MissionRecord | null {
  if (typeof raw !== 'object' || raw === null) return null
  const mission = raw as { won?: unknown; furthestEncounter?: unknown; contributions?: unknown }
  if (typeof mission.won !== 'boolean') return null
  if (typeof mission.furthestEncounter !== 'string' || mission.furthestEncounter.length === 0) return null
  if (!Array.isArray(mission.contributions)) return null
  const contributions: RoundContributionRow[] = []
  for (const row of mission.contributions) {
    const parsed = parseContribution(row)
    if (!parsed) return null
    contributions.push(parsed)
  }
  return { won: mission.won, furthestEncounter: mission.furthestEncounter, contributions }
}

function parseBoard(raw: string | undefined | null): WeeklyBoard | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { weekId?: unknown; missions?: unknown }
    if (typeof parsed.weekId !== 'string' || parsed.weekId.length === 0) return null
    if (!Array.isArray(parsed.missions)) return null
    const missions: MissionRecord[] = []
    for (const mission of parsed.missions) {
      const row = parseMission(mission)
      if (!row) return null
      missions.push(row)
    }
    return { weekId: parsed.weekId, missions }
  } catch {
    return null
  }
}

function rollToCurrentWeek(): boolean {
  const weekId = utcIsoWeekId()
  if (board.weekId === weekId) return false
  board = emptyBoard(weekId)
  return true
}

async function persist(): Promise<void> {
  const { Storage } = await import('@dcl/sdk/server')
  const saved = await Storage.set(STORAGE_KEY, JSON.stringify(board))
  if (!saved) {
    console.log(`[SERVER] WeeklyBoard persist failed (${board.weekId})`)
  }
}

async function loadBoard(): Promise<void> {
  const { Storage } = await import('@dcl/sdk/server')
  let raw: string | undefined | null = null
  try {
    raw = await Storage.get<string>(STORAGE_KEY)
  } catch {
    raw = null
  }

  const loaded = parseBoard(raw)
  board = loaded ?? emptyBoard()
  if (rollToCurrentWeek()) {
    console.log(`[SERVER] WeeklyBoard reset for ${board.weekId}`)
    await persist()
    return
  }
  if (!loaded) {
    await persist()
  }
}

async function ensureLoaded(): Promise<void> {
  if (!loadPromise) loadPromise = loadBoard()
  await loadPromise
}

export function setupWeeklyBoard(): void {
  if (!isServer()) return
  loadPromise = loadBoard()
}

export async function getWeeklyBoardSnapshot(): Promise<WeeklyBoard> {
  await ensureLoaded()
  if (rollToCurrentWeek()) {
    console.log(`[SERVER] WeeklyBoard reset for ${board.weekId}`)
    await persist()
  }
  return { weekId: board.weekId, missions: board.missions.slice() }
}

export async function recordWeeklyMission(mission: MissionRecord): Promise<WeeklyBoard> {
  await ensureLoaded()
  if (rollToCurrentWeek()) {
    console.log(`[SERVER] WeeklyBoard reset for ${board.weekId}`)
  }
  board.missions.push(mission)
  board.missions.sort(compareWeeklyMissions)
  board.missions = board.missions.slice(0, WEEKLY_TOP_N)
  await persist()
  return { weekId: board.weekId, missions: board.missions.slice() }
}
