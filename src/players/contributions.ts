export type RoundContribution = {
  damage: number
  repairs: number
}

const contributions = new Map<string, RoundContribution>()

function contributionKey(playerAddress: string): string {
  return playerAddress.toLowerCase()
}

function getOrCreate(playerAddress: string): RoundContribution {
  const key = contributionKey(playerAddress)
  const existing = contributions.get(key)
  if (existing) return existing
  const created: RoundContribution = { damage: 0, repairs: 0 }
  contributions.set(key, created)
  return created
}

export function addDamage(playerAddress: string, amount: number): void {
  if (amount <= 0) return
  getOrCreate(playerAddress).damage += amount
}

export function addRepair(playerAddress: string): void {
  getOrCreate(playerAddress).repairs += 1
}

export function resetContributions(): void {
  contributions.clear()
}

export function getContributions(): ReadonlyMap<string, RoundContribution> {
  return contributions
}

export type RoundContributionRow = {
  playerId: string
  damage: number
  repairs: number
}

export function snapshotContributions(): RoundContributionRow[] {
  const rows: RoundContributionRow[] = []
  for (const [playerId, row] of contributions) {
    rows.push({ playerId, damage: row.damage, repairs: row.repairs })
  }
  return rows
}

/** Temporary: dump the table for logging. */
export function stringifyContributions(): string {
  return JSON.stringify([...contributions])
}
