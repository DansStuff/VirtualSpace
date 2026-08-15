import { engine, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

/**
 * Radius of the fixed enclosing celestial sphere (scene meters).
 * Ship / sphere center sits at (R, R, R) so the shell fits a 2R cube from the origin.
 */
export const ENCLOSING_SPHERE_RADIUS = 64

/** Fixed scene-space anchor for the visible ship model (center of the enclosing sphere). */
export const SCENE_SHIP_POSITION = Vector3.create(
  ENCLOSING_SPHERE_RADIUS,
  ENCLOSING_SPHERE_RADIUS,
  ENCLOSING_SPHERE_RADIUS
)

/** Pull celestial body centers inward from the shell along the view ray (meters). */
export const CELESTIAL_SPHERE_INSET = 0.75

/** Assumed player camera vertical FOV (degrees). Angular matching is FOV-independent. */
export const STANDARD_PLAYER_FOV_DEGREES = 50

/** Virtual-space foci for the figure-8 test path (and the two test planets). */
export const FOCUS_A = Vector3.create(0, 0, 0)
export const FOCUS_B = Vector3.create(20000, 0, 0)
export const FIGURE8_MIDPOINT = Vector3.create(
  (FOCUS_A.x + FOCUS_B.x) / 2,
  (FOCUS_A.y + FOCUS_B.y) / 2,
  (FOCUS_A.z + FOCUS_B.z) / 2
)
/** Half-distance between foci; Bernoulli scale a = c * √2. */
export const FIGURE8_FOCUS_HALF_SEPARATION = Vector3.distance(FOCUS_A, FOCUS_B) / 2
/** >1 enlarges the figure-8 so the path clears planet surfaces. */
export const FIGURE8_RADIUS_SCALE = 1.12
export const FIGURE8_SCALE = FIGURE8_FOCUS_HALF_SEPARATION * Math.SQRT2 * FIGURE8_RADIUS_SCALE

// NOTE: the ship should be synced once multiplayer is implemented
export const ship = engine.addEntity()

// The rendered ship never leaves this scene position — motion is virtual only.
Transform.create(ship, {
  position: SCENE_SHIP_POSITION,
  rotation: Quaternion.Identity()
})

/**
 * Virtual pose of the ship in space.
 * PlanetSystem reads these each frame; TestShipAnimator (or gameplay) writes them.
 * The scene Transform above stays fixed at SCENE_SHIP_POSITION.
 */
export const shipVirtualPosition: Vector3.Mutable = Vector3.create(0, 0, 0)
export const shipVirtualRotation: Quaternion.Mutable = Quaternion.Identity()
