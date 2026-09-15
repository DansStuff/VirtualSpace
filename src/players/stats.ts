import { engine, Entity, Schemas } from '@dcl/sdk/ecs'
import { isServer, syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import { ENGINEERING_XP_GROWTH, ENGINEERING_XP_LEVEL_1, GUNNER_XP_GROWTH, GUNNER_XP_LEVEL_1, SKILL_MAX_LEVEL } from '../constants'

export const PlayerStats = engine.defineComponent('game:PlayerStats', {
  playerId: Schemas.String,
  gunnerLevel: Schemas.Int,
  engineeringLevel: Schemas.Int,
  gunnerXp: Schemas.Int,
  engineeringXp: Schemas.Int
})

export type PlayerStatsSnapshot = {
  playerId: string
  gunnerLevel: number
  engineeringLevel: number
  gunnerXp: number
  engineeringXp: number
}

export type SkillId = 'gunner' | 'engineering'

export const DEFAULT_PLAYER_STATS: Omit<PlayerStatsSnapshot, 'playerId'> = {
  gunnerLevel: 1,
  engineeringLevel: 1,
  gunnerXp: 0,
  engineeringXp: 0
}

const STATS_STORAGE_KEY = 'stats'
const RESERVED_ENTITY_SLOT = 512

const playerEntities = new Map<string, Entity>()

if (isServer()) {
  PlayerStats.validateBeforeChange((value) => {
    return value.senderAddress === AUTH_SERVER_PEER_ID
  })
}

function statsKey(playerAddress: string): string {
  return playerAddress.toLowerCase()
}

function defaultSnapshot(playerId: string): PlayerStatsSnapshot {
  return {
    playerId,
    gunnerLevel: DEFAULT_PLAYER_STATS.gunnerLevel,
    engineeringLevel: DEFAULT_PLAYER_STATS.engineeringLevel,
    gunnerXp: DEFAULT_PLAYER_STATS.gunnerXp,
    engineeringXp: DEFAULT_PLAYER_STATS.engineeringXp
  }
}

function xpBase(skill: SkillId): number {
  return skill === 'gunner' ? GUNNER_XP_LEVEL_1 : ENGINEERING_XP_LEVEL_1
}

function xpGrowth(skill: SkillId): number {
  return skill === 'gunner' ? GUNNER_XP_GROWTH : ENGINEERING_XP_GROWTH
}

export function xpToNextLevel(level: number, skill: SkillId): number {
  if (level >= SKILL_MAX_LEVEL) return 0
  return Math.round(xpBase(skill) * Math.pow(xpGrowth(skill), level - 1))
}

export function skillProgress(level: number, xp: number, skill: SkillId): number {
  if (level >= SKILL_MAX_LEVEL) return 1
  const need = xpToNextLevel(level, skill)
  if (need <= 0) return 0
  return Math.max(0, Math.min(1, xp / need))
}

function clampLevel(value: number): number {
  return Math.max(1, Math.min(SKILL_MAX_LEVEL, Math.floor(value)))
}

function clampXp(value: number): number {
  return Math.max(0, Math.floor(value))
}

function applyXp(level: number, xp: number, amount: number, skill: SkillId): { level: number; xp: number } {
  if (level >= SKILL_MAX_LEVEL) return { level: SKILL_MAX_LEVEL, xp: 0 }
  let nextLevel = level
  let nextXp = xp + amount
  while (nextLevel < SKILL_MAX_LEVEL) {
    const need = xpToNextLevel(nextLevel, skill)
    if (nextXp < need) break
    nextXp -= need
    nextLevel += 1
  }
  if (nextLevel >= SKILL_MAX_LEVEL) return { level: SKILL_MAX_LEVEL, xp: 0 }
  return { level: nextLevel, xp: nextXp }
}

function findPlayerStatsEntity(playerAddress: string): Entity | null {
  const key = statsKey(playerAddress)
  const cached = playerEntities.get(key)
  if (cached !== undefined && PlayerStats.getOrNull(cached) !== null) {
    return cached
  }
  for (const [entity, data] of engine.getEntitiesWith(PlayerStats)) {
    if ((entity & 0xffff) < RESERVED_ENTITY_SLOT) continue
    if (data.playerId.toLowerCase() !== key) continue
    return entity
  }
  return null
}

function getOrCreatePlayerEntity(playerAddress: string): Entity {
  const key = statsKey(playerAddress)
  const cached = playerEntities.get(key)
  if (cached !== undefined && PlayerStats.getOrNull(cached) !== null) return cached
  if (cached !== undefined) {
    playerEntities.delete(key)
    try {
      engine.removeEntity(cached)
    } catch {
      /* already gone */
    }
  }

  for (const [entity, data] of engine.getEntitiesWith(PlayerStats)) {
    if ((entity & 0xffff) < RESERVED_ENTITY_SLOT) continue
    if (data.playerId.toLowerCase() !== key) continue
    playerEntities.set(key, entity)
    return entity
  }

  const entity = engine.addEntity()
  PlayerStats.create(entity, defaultSnapshot(key))
  syncEntity(entity, [PlayerStats.componentId])
  playerEntities.set(key, entity)
  return entity
}

function parseLevel(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return clampLevel(value)
}

function parseXp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return clampXp(value)
}

function parseStoredStats(raw: string | undefined | null): Omit<PlayerStatsSnapshot, 'playerId'> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as {
      gunnerLevel?: unknown
      engineeringLevel?: unknown
      gunnerXp?: unknown
      engineeringXp?: unknown
    }
    const gunnerLevel = parseLevel(parsed.gunnerLevel)
    const engineeringLevel = parseLevel(parsed.engineeringLevel)
    if (gunnerLevel === null || engineeringLevel === null) return null
    return {
      gunnerLevel,
      engineeringLevel,
      gunnerXp: parseXp(parsed.gunnerXp),
      engineeringXp: parseXp(parsed.engineeringXp)
    }
  } catch {
    return null
  }
}

export function getPlayerStats(playerAddress: string): PlayerStatsSnapshot {
  const entity = findPlayerStatsEntity(playerAddress)
  if (entity === null) return defaultSnapshot(statsKey(playerAddress))
  return PlayerStats.getOrNull(entity) ?? defaultSnapshot(statsKey(playerAddress))
}

export function getGunnerLevel(playerAddress: string): number {
  return getPlayerStats(playerAddress).gunnerLevel
}

export function getEngineeringLevel(playerAddress: string): number {
  return getPlayerStats(playerAddress).engineeringLevel
}

function storedStatsPayload(stats: Omit<PlayerStatsSnapshot, 'playerId'>): string {
  return JSON.stringify({
    gunnerLevel: stats.gunnerLevel,
    engineeringLevel: stats.engineeringLevel,
    gunnerXp: stats.gunnerXp,
    engineeringXp: stats.engineeringXp
  })
}

async function persistPlayerStats(playerAddress: string): Promise<void> {
  if (!isServer()) return
  const stats = getPlayerStats(playerAddress)
  const { Storage } = await import('@dcl/sdk/server')
  const saved = await Storage.player.set(playerAddress, STATS_STORAGE_KEY, storedStatsPayload(stats))
  if (!saved) {
    console.log(`[SERVER] PlayerStats persist failed for ${playerAddress}`)
  }
}

async function loadPlayerStats(playerAddress: string): Promise<void> {
  if (!isServer()) return
  const entity = getOrCreatePlayerEntity(playerAddress)
  const { Storage } = await import('@dcl/sdk/server')

  let raw: string | undefined | null = null
  try {
    raw = await Storage.player.get<string>(playerAddress, STATS_STORAGE_KEY)
  } catch {
    raw = null
  }

  const loaded = parseStoredStats(raw)
  if (loaded) {
    const mutable = PlayerStats.getMutableOrNull(entity)
    if (!mutable) return
    mutable.gunnerLevel = loaded.gunnerLevel
    mutable.engineeringLevel = loaded.engineeringLevel
    mutable.gunnerXp = loaded.gunnerXp
    mutable.engineeringXp = loaded.engineeringXp
    return
  }

  const defaults = defaultSnapshot(statsKey(playerAddress))
  const saved = await Storage.player.set(playerAddress, STATS_STORAGE_KEY, storedStatsPayload(defaults))
  if (!saved) {
    console.log(`[SERVER] PlayerStats seed failed for ${playerAddress}`)
  }
}

export function awardSkillXp(playerAddress: string, skill: SkillId, amount: number): void {
  if (!isServer() || amount <= 0) return
  const entity = getOrCreatePlayerEntity(playerAddress)
  const mutable = PlayerStats.getMutableOrNull(entity)
  if (!mutable) return

  if (skill === 'gunner') {
    const next = applyXp(mutable.gunnerLevel, mutable.gunnerXp, amount, 'gunner')
    mutable.gunnerLevel = next.level
    mutable.gunnerXp = next.xp
  } else {
    const next = applyXp(mutable.engineeringLevel, mutable.engineeringXp, amount, 'engineering')
    mutable.engineeringLevel = next.level
    mutable.engineeringXp = next.xp
  }

  void persistPlayerStats(playerAddress)
}

export function onPlayerConnected(playerAddress: string): void {
  if (!isServer()) return
  getOrCreatePlayerEntity(playerAddress)
  void loadPlayerStats(playerAddress)
}

function reconcilePlayerEntities(): void {
  for (const [entity, data] of engine.getEntitiesWith(PlayerStats)) {
    if ((entity & 0xffff) < RESERVED_ENTITY_SLOT) continue
    const key = data.playerId.toLowerCase()
    const existing = playerEntities.get(key)
    if (existing === undefined) {
      playerEntities.set(key, entity)
    } else if (existing !== entity) {
      engine.removeEntity(entity)
    }
  }
}

export function setupPlayers() {
  if (!isServer()) return
  reconcilePlayerEntities()
}
