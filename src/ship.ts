import { engine, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

/** Fixed scene-space anchor for the visible ship model. */
export const SCENE_SHIP_POSITION = Vector3.create(40, 40, 40)

/** Radius of the enclosing sphere centered on the ship; planets are pinned to this shell. */
export const ENCLOSING_SPHERE_RADIUS = 40

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
