import { engine, Entity, GltfContainer, GltfNodeModifiers, Name, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
import { EntityNames } from '../assets/scene/entity-names'
import { AsteroidData, PlanetData } from './components'
import { SHIP_ROUTE, routePlanetCentroid } from './path/route'

export type PlanetSpawnData = {
  name: string
  position: Vector3
  /** Virtual-space radius. Models are authored at radius 1; this sets true simulated size. */
  radius: number
}

export function createPlanet(modelPath: string, data: PlanetSpawnData): Entity {
  const entity = engine.addEntity()

  // Models must be origin-centered with radius 1. Baked glTF node translations get multiplied
  // by Transform.scale and will fling the mesh off-screen once PlanetSystem applies apparent size.
  GltfContainer.create(entity, { src: modelPath })
  Transform.create(entity, { position: data.position })
  PlanetData.create(entity, {
    name: data.name,
    position: data.position,
    radius: data.radius
  })

  return entity
}

const STAR_MODEL = 'assets/scene/Models/Star.gltf'

/** Tweak this to make all distant stars larger or smaller (virtual radius multiplier). */
export const STAR_SIZE = 10

/** Star.gltf baseColorFactor (RGB) — tint is applied relative to this. */
const STAR_BASE_COLOR = { r: 0.8, g: 0.8, b: 0.8 }

/**
 * Override the star GLTF PBR colors with a slight orange tint.
 * DCL cannot read the loaded material at runtime; we re-apply known base values + tint.
 */
function applyStarOrangeTint(entity: Entity, tintStrength: number): void {
  // Push toward orange: keep red, pull green a little, pull blue more.
  const r = Math.min(1, STAR_BASE_COLOR.r + tintStrength * 0.25)
  const g = STAR_BASE_COLOR.g * (1 - tintStrength * 0.25)
  const b = STAR_BASE_COLOR.b * (1 - tintStrength * 0.55)

  GltfNodeModifiers.create(entity, {
    modifiers: [
      {
        path: '',
        material: {
          material: {
            $case: 'pbr',
            pbr: {
              albedoColor: Color4.create(r, g, b, 1),
              emissiveColor: Color3.create(r, g, b),
              emissiveIntensity: 3
            }
          }
        }
      }
    ]
  })
}

/**
 * Spawns distant background stars at varied directions and distances.
 * Uses PlanetData so PlanetSystem projects them onto the enclosing sphere.
 */
export function spawnDistantStars(count: number = 20): void {
  for (let i = 0; i < count; i++) {
    // Deterministic "random" directions so the field is stable across reloads.
    const yaw = (i / count) * Math.PI * 2 + i * 0.37
    const pitch = -0.8 + ((i * 0.618) % 1) * 1.6
    const distance = 800 + ((i * 9973) % 4200)

    const cosPitch = Math.cos(pitch)
    const position = Vector3.create(
      Math.cos(yaw) * cosPitch * distance,
      Math.sin(pitch) * distance,
      Math.sin(yaw) * cosPitch * distance
    )

    const radius = STAR_SIZE

    const entity = createPlanet(STAR_MODEL, {
      name: `Star_${i}`,
      position,
      radius
    })

    // Slight per-star orange tint (0.15–0.45), stable across reloads.
    const tintStrength = 0.6 + ((i * 0.618) % 1) * 1
    applyStarOrangeTint(entity, tintStrength)
  }
}

const ASTEROID_MODEL = 'assets/scene/Models/Asteroid.gltf'

/** Client-only visual for a hazard. `position` is virtual-space; AsteroidSystem projects it. */
export function spawnHazard(position: Vector3, radius: number): Entity {
  const entity = engine.addEntity()
  GltfContainer.create(entity, { src: ASTEROID_MODEL })
  Transform.create(entity, { position: Vector3.clone(position) })
  AsteroidData.create(entity, {
    position: Vector3.clone(position),
    radius
  })
  return entity
}

/** Spawns authored planets from the path-editor route table. */
export function spawnPlanetsFromRoute(): void {
  for (const planet of SHIP_ROUTE.planets) {
    createPlanet(planet.model, {
      name: planet.name,
      position: Vector3.create(planet.x, planet.y, planet.z),
      radius: planet.radius
    })
  }
}

/**
 * Tags every scene-hierarchy entity named Asteroid.gltf with AsteroidData.
 * Assigns a virtual-space pose near the planet centroid so AsteroidSystem can project it.
 */
/*
export function setupAsteroids(): void {
  const centroid = routePlanetCentroid(SHIP_ROUTE)
  let asteroidIndex = 0
  for (const [entity, name] of engine.getEntitiesWith(Name, Transform)) {
    if (name.value !== EntityNames.Asteroid_gltf || AsteroidData.has(entity)) {
      continue
    }

    const yaw = asteroidIndex * 2.4
    const position = Vector3.create(
      centroid.x + Math.cos(yaw) * 40,
      centroid.y + ((asteroidIndex % 3) - 1) * 8,
      centroid.z + Math.sin(yaw) * 40
    )
    AsteroidData.create(entity, {
      position,
      radius: 4
    })
    asteroidIndex++
  }
}
  */

