import { engine, Schemas, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

const DEFAULT_SPIN_DEGREES_PER_SECOND = 30

export const Spinner = engine.defineComponent(
  'Spinner',
  {
    axis: Schemas.Vector3,
    degreesPerSecond: Schemas.Float
  },
  {
    axis: Vector3.Up(),
    degreesPerSecond: DEFAULT_SPIN_DEGREES_PER_SECOND
  }
)

export function SpinSystem(dt: number) {
  for (const [entity, spinner] of engine.getEntitiesWith(Spinner, Transform)) {
    const transform = Transform.getMutable(entity)
    transform.rotation = Quaternion.multiply(
      transform.rotation,
      Quaternion.fromAngleAxis(dt * spinner.degreesPerSecond, spinner.axis)
    )
  }
}
