import { engine, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

/**
 * Radius of the fixed enclosing celestial sphere (scene meters).
 * Ship / sphere center sits at (R, R, R) so the shell fits a 2R cube from the origin.
 */
export const ENCLOSING_SPHERE_RADIUS = 40//64

/**
 * Smaller enclosing sphere for asteroids (closer shell than planets/stars).
 * Center remains SCENE_SHIP_POSITION; only the projection radius differs.
 */
export const ASTEROID_ENCLOSING_SPHERE_RADIUS = 20

/** Fixed scene-space anchor for the visible ship model (center of the enclosing sphere). */
export const SCENE_SHIP_POSITION = Vector3.create(
  64,
  64,
  64
)

/** Pull celestial body centers inward from the shell along the view ray (meters). */
export const CELESTIAL_SPHERE_INSET = 0.75

/** Assumed player camera vertical FOV (degrees). Angular matching is FOV-independent. */
export const STANDARD_PLAYER_FOV_DEGREES = 50

// NOTE: the ship should be synced once multiplayer is implemented
export const ship = engine.addEntity()

// The rendered ship never leaves this scene position — motion is virtual only.
Transform.create(ship, {
  position: SCENE_SHIP_POSITION,
  rotation: Quaternion.Identity()
})

/**
 * Virtual pose of the ship in space.
 * PlanetSystem reads these each frame; ShipPathSystem (or gameplay) writes them.
 * The scene Transform above stays fixed at SCENE_SHIP_POSITION.
 */
export const shipVirtualPosition: Vector3.Mutable = Vector3.create(0, 0, 0)
export const shipVirtualRotation: Quaternion.Mutable = Quaternion.Identity()
