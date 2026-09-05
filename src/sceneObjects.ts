import { engine, Entity, Name } from '@dcl/sdk/ecs'

function isBreachName(name: string): boolean {
  return name.startsWith('Breach')
}

function isConsoleName(name: string): boolean {
  return name.endsWith('WeaponConsole')
}

function initBreach(_entity: Entity): void {}

function initConsole(_entity: Entity): void {}

export function setupSceneObjects(): void {
  for (const [entity, name] of engine.getEntitiesWith(Name)) {
    if (isBreachName(name.value)) {
      initBreach(entity)
      continue
    }
    if (isConsoleName(name.value)) {
      initConsole(entity)
    }
  }
}
