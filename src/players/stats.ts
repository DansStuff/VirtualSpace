import { isServer } from '@dcl/sdk/network'

export type PlayerStats = {
  damage: number
}

export const DEFAULT_PLAYER_STATS: PlayerStats = {
  damage: 1
}

const playerStats = new Map<string, PlayerStats>()

function statsKey(playerAddress: string): string {
  return playerAddress.toLowerCase()
}

export function getPlayerDamage(playerAddress: string): number {
  return playerStats.get(statsKey(playerAddress))?.damage ?? DEFAULT_PLAYER_STATS.damage
}

export function loadPlayerStats(_playerAddress: string): void {
  // Future: load upgrades from storage / API
}

export function onPlayerConnected(playerAddress: string): void {
  loadPlayerStats(playerAddress)
}

export function setupPlayers() {
  if (!isServer()) return
}
