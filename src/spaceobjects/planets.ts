import {
  engine,
  Entity,
  GltfContainer,
  GltfNodeModifiers,
  Schemas,
  Transform
} from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
import { isServer } from '@dcl/sdk/network'
import {
  PLANET_ENCLOSING_SPHERE_RADIUS,
  SCENE_SHIP_POSITION,
  STAR_BASE_COLOR,
  STAR_MODEL_PATH,
  STAR_SPAWN_COUNT_DEFAULT,
  STAR_VIRTUAL_RADIUS
} from '../constants'
import { SHIP_ROUTE } from '../path/route'
import { shipVirtualPosition, shipVirtualRotation } from '../ship'
import { AsteroidSystem } from './asteroids'
import { projectVirtualBodyToSceneSphere } from './projection'

export const PlanetData = engine.defineComponent('PlanetData', {
  position: Schemas.Vector3,
  name: Schemas.String,
  /** Virtual-space radius. Imported models are authored at radius 1; this drives apparent size. */
  radius: Schemas.Float
})

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
export function spawnDistantStars(count: number = STAR_SPAWN_COUNT_DEFAULT): void {
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

    const entity = createPlanet(STAR_MODEL_PATH, {
      name: `Star_${i}`,
      position,
      radius: STAR_VIRTUAL_RADIUS
    })

    // Slight per-star orange tint (0.15–0.45), stable across reloads.
    const tintStrength = 0.6 + ((i * 0.618) % 1) * 1
    applyStarOrangeTint(entity, tintStrength)
  }
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
 * Each frame, reproject every planet onto the fixed enclosing sphere at scene center.
 * Rays start at the local player (inside the sphere) and travel in the virtual
 * celestial direction until they hit the shell.
 */
export function PlanetSystem(_dt: number) {
  // Step 1: read the ship's virtual pose (not the fixed scene Transform).
  const virtualPosition = shipVirtualPosition
  const virtualRotation = shipVirtualRotation

  // Step 2: ray origin is the player; sphere stays fixed at the ship / scene anchor.
  let rayOrigin = SCENE_SHIP_POSITION
  if (Transform.has(engine.PlayerEntity)) {
    rayOrigin = Transform.get(engine.PlayerEntity).position
  }

  // Step 3: visit every planet that has both simulation data and a scene Transform.
  for (const [entity, planet] of engine.getEntitiesWith(PlanetData, Transform)) {
    // Step 4: get a writable Transform so we can move/scale the visible planet model.
    const transform = Transform.getMutable(entity)

    // Step 5: player → celestial direction → intersection with the fixed sphere.
    const projection = projectVirtualBodyToSceneSphere(
      planet.position,
      virtualPosition,
      virtualRotation,
      SCENE_SHIP_POSITION,
      rayOrigin,
      PLANET_ENCLOSING_SPHERE_RADIUS,
      planet.radius
    )

    // Step 6: apply projected pose (center on the fixed enclosing sphere).
    transform.position = projection.position
    transform.rotation = projection.rotation
    transform.scale = Vector3.create(projection.scale, projection.scale, projection.scale)
  }
}

export function setupSpaceObjects() {
  if (isServer()) return
  spawnPlanetsFromRoute()
  // spawnDistantStars(40)
  // setupAsteroids()
  engine.addSystem(PlanetSystem)
  engine.addSystem(AsteroidSystem)
}
