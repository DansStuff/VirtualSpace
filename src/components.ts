import { Schemas, engine } from '@dcl/sdk/ecs'

export const PlanetData = engine.defineComponent('PlanetData', {
  position: Schemas.Vector3,
  name: Schemas.String,
  /** Virtual-space radius. Imported models are authored at radius 1; this drives apparent size. */
  radius: Schemas.Float
})

/** Tag for scene asteroids. Extra spin/orbit data can be added later. */
export const AsteroidData = engine.defineComponent('AsteroidData', {})
