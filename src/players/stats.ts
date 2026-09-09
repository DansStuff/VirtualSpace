import { engine, Entity, Schemas } from '@dcl/sdk/ecs'
import { isServer, syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

export const PlayerStats = engine.defineComponent('game:PlayerStats', {
  playerId: Schemas.String,
  gunnerLevel: Schemas.Int,
  engineeringLevel: Schemas.Int
})

export type PlayerStatsSnapshot = {
  playerId: string
  gunnerLevel: number
  engineeringLevel: number
}

export const DEFAULT_PLAYER_STATS: Omit<PlayerStatsSnapshot, 'playerId'> = {
  gunnerLevel: 1,
  engineeringLevel: 1
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
    engineeringLevel: DEFAULT_PLAYER_STATS.engineeringLevel
  }
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

function parseStoredStats(raw: string | undefined | null): Omit<PlayerStatsSnapshot, 'playerId'> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { gunnerLevel?: unknown; engineeringLevel?: unknown }
    const gunnerLevel =
      typeof parsed.gunnerLevel === 'number' && Number.isFinite(parsed.gunnerLevel)
        ? Math.max(0, Math.floor(parsed.gunnerLevel))
        : null
    const engineeringLevel =
      typeof parsed.engineeringLevel === 'number' && Number.isFinite(parsed.engineeringLevel)
        ? Math.max(0, Math.floor(parsed.engineeringLevel))
        : null
    if (gunnerLevel === null || engineeringLevel === null) return null
    return { gunnerLevel, engineeringLevel }
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
    engineeringLevel: stats.engineeringLevel
  })
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
    return
  }

  const defaults = defaultSnapshot(statsKey(playerAddress))
  const saved = await Storage.player.set(playerAddress, STATS_STORAGE_KEY, storedStatsPayload(defaults))
  if (!saved) {
    console.log(`[SERVER] PlayerStats seed failed for ${playerAddress}`)
  }
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
