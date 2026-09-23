import { engine, Entity, MeshRenderer, Transform, VisibilityComponent } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { directionFromTo } from '../utilities'

const worldDown = Vector3.Down()

/** Hidden, unparented 1×1 plane for a beam. The caller sets the material. */
export function createBeamStrip(position: Vector3, width: number): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, {
    position: Vector3.clone(position),
    scale: Vector3.create(width, 1, 1)
  })
  MeshRenderer.setPlane(entity)
  VisibilityComponent.create(entity, { visible: false })
  return entity
}

/**
 * Rotation for a plane lying along the beam: local +Y is origin→target, local +Z is
 * world-down projected onto the plane perpendicular to the beam (visible from below).
 */
function beamRotation(beamDir: Vector3): Quaternion.Mutable {
  const zAxis = Vector3.normalize(
    Vector3.subtract(worldDown, Vector3.scale(beamDir, Vector3.dot(worldDown, beamDir)))
  )
  return Quaternion.lookRotation(zAxis, beamDir)
}

/** Stretch the plane from `from` to `to` with the given width (local X). */
export function poseBeamStrip(entity: Entity, from: Vector3, to: Vector3, width: number): void {
  const length = Vector3.distance(from, to)
  const transform = Transform.getMutable(entity)
  transform.position = Vector3.lerp(from, to, 0.5)
  transform.rotation = beamRotation(directionFromTo(from, to))
  transform.scale = Vector3.create(width, Math.max(length, 0.01), 1)
}
