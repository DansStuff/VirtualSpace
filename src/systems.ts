import { engine, Entity, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { AsteroidData, PlanetData } from './components'
import {
  ASTEROID_ENCLOSING_SPHERE_RADIUS,
  ENCLOSING_SPHERE_RADIUS,
  FIGURE8_MIDPOINT,
  FIGURE8_SCALE,
  SCENE_SHIP_POSITION,
  shipVirtualPosition,
  shipVirtualRotation
} from './ship'
import { projectVirtualBodyToSceneSphere } from './utilities'

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
      ENCLOSING_SPHERE_RADIUS,
      planet.radius
    )

    // Step 6: apply projected pose (center on the fixed enclosing sphere).
    transform.position = projection.position
    transform.rotation = projection.rotation
    transform.scale = Vector3.create(projection.scale, projection.scale, projection.scale)
  }
}

/** Degrees per second — slow tumble, not a fast spin. */
const ASTEROID_SPIN_SPEED = 12

type AsteroidSpinState = { axis: Vector3; angle: number }
const asteroidSpinState = new Map<Entity, AsteroidSpinState>()

/** Uniform random unit vector so each asteroid tumbles on its own axis. */
function randomUnitAxis(): Vector3 {
  const theta = Math.random() * Math.PI * 2
  const z = Math.random() * 2 - 1
  const radius = Math.sqrt(1 - z * z)
  return Vector3.create(radius * Math.cos(theta), radius * Math.sin(theta), z)
}

/**
 * Each frame, reproject asteroids like planets onto a smaller enclosing sphere,
 * then apply a slow local tumble on top of the celestial orientation.
 */
export function AsteroidSystem(dt: number) {
  const virtualPosition = shipVirtualPosition
  const virtualRotation = shipVirtualRotation

  let rayOrigin = SCENE_SHIP_POSITION
  if (Transform.has(engine.PlayerEntity)) {
    rayOrigin = Transform.get(engine.PlayerEntity).position
  }

  for (const [entity, asteroid] of engine.getEntitiesWith(AsteroidData, Transform)) {
    const transform = Transform.getMutable(entity)

    const projection = projectVirtualBodyToSceneSphere(
      asteroid.position,
      virtualPosition,
      virtualRotation,
      SCENE_SHIP_POSITION,
      rayOrigin,
      ASTEROID_ENCLOSING_SPHERE_RADIUS,
      asteroid.radius
    )

    let spin = asteroidSpinState.get(entity)
    if (!spin) {
      spin = { axis: randomUnitAxis(), angle: 0 }
      asteroidSpinState.set(entity, spin)
    }
    spin.angle += dt * ASTEROID_SPIN_SPEED
    const tumble = Quaternion.fromAngleAxis(spin.angle, spin.axis)

    transform.position = projection.position
    transform.rotation = Quaternion.multiply(projection.rotation, tumble)
    transform.scale = Vector3.create(projection.scale, projection.scale, projection.scale)
  }
}

// Figure-8 (Bernoulli lemniscate) test path with foci at FOCUS_A / FOCUS_B.
const SPEED = 0.2

let pathT = 0

/** Bernoulli lemniscate in XZ, centered on FIGURE8_MIDPOINT, foci at FOCUS_A/B. */
function lemniscatePosition(t: number): Vector3.Mutable {
  const sinT = Math.sin(t)
  const cosT = Math.cos(t)
  const denom = 1 + sinT * sinT
  return Vector3.create(
    FIGURE8_MIDPOINT.x + (FIGURE8_SCALE * cosT) / denom,
    FIGURE8_MIDPOINT.y,
    FIGURE8_MIDPOINT.z + (FIGURE8_SCALE * sinT * cosT) / denom
  )
}

/**
 * Animates the ship's *virtual* pose along a figure-8 around the two test planets.
 * The visible ship model stays at SCENE_SHIP_POSITION.
 */
export function TestShipAnimator(dt: number) {
  // Step 1: advance the path parameter.
  pathT += SPEED * dt

  // Step 2: place the virtual ship on the lemniscate.
  const position = lemniscatePosition(pathT)
  shipVirtualPosition.x = position.x
  shipVirtualPosition.y = position.y
  shipVirtualPosition.z = position.z

  // Step 3: face along the path tangent only (no bank — nearest-focus roll flips caused jumps).
  const ahead = lemniscatePosition(pathT + 0.01)
  const tangent = Vector3.normalize(Vector3.subtract(ahead, position))
  const facing = Quaternion.lookRotation(tangent)
  shipVirtualRotation.x = facing.x
  shipVirtualRotation.y = facing.y
  shipVirtualRotation.z = facing.z
  shipVirtualRotation.w = facing.w
}

