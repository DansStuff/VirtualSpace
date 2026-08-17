import { Schemas, engine } from '@dcl/sdk/ecs'

export const PlanetData = engine.defineComponent('PlanetData', {
  position: Schemas.Vector3,
  name: Schemas.String,
  /** Virtual-space radius. Imported models are authored at radius 1; this drives apparent size. */
  radius: Schemas.Float
})

/**
 * Virtual-space asteroid body. Projected like planets, but onto ASTEROID_ENCLOSING_SPHERE_RADIUS.
 * Models are authored at radius 1; `radius` is the virtual size for apparent scale.
 */
export const AsteroidData = engine.defineComponent('AsteroidData', {
  position: Schemas.Vector3,
  radius: Schemas.Float
})
