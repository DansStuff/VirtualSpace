import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

export const Messages = {

  
  // Client → Server
  requestMissionStart: Schemas.Map({}),
  requestInitialState: Schemas.Map({}),
  requestHazardTarget: Schemas.Map({
    hazardId: Schemas.Int
  }),

  // Server → Client
  notifyMissionStart: Schemas.Map({
    encounterId: Schemas.String,
    startedAt: Schemas.Int64
  }),
  notifyHazardSpawn: Schemas.Map({
    hazardId: Schemas.Int,
    encounterId: Schemas.String,
    position: Schemas.Vector3
  }),
  notifyHazardShot: Schemas.Map({
    hazardId: Schemas.Int,
    playerAddress: Schemas.String
  })
}

export const room = registerMessages(Messages)
