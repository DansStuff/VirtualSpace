import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

export const Messages = {

  
  // Client → Server
  // Empty Map payloads can be dropped by the transport (seen on server→client).
  // Keep a timestamp so these always have a body.
  requestMissionStart: Schemas.Map({
    requestedAt: Schemas.Int64
  }),
  requestInitialState: Schemas.Map({
    requestedAt: Schemas.Int64
  }),
  requestHazardTarget: Schemas.Map({
    hazardId: Schemas.Int
  }),
  requestNewMission: Schemas.Map({
    requestedAt: Schemas.Int64
  }),
  requestRepairBreach: Schemas.Map({
    breachId: Schemas.Int
  }),

  // Server → Client
  notifyMissionStart: Schemas.Map({
    encounterId: Schemas.String,
    startedAt: Schemas.Int64
  }),
  notifyHazardSpawn: Schemas.Map({
    hazardId: Schemas.Int,
    encounterId: Schemas.String,
    position: Schemas.Vector3,
    flightTime: Schemas.Float
  }),
  notifyHazardTargeted: Schemas.Map({
    hazardId: Schemas.Int,
    targeters: Schemas.Array(Schemas.String)
  }),
  notifyHazardDestroyed: Schemas.Map({
    hazardId: Schemas.Int,
    /** true = hit the ship; false = shot down */
    hitShip: Schemas.Boolean
  }),
  notifyEncounterEnd: Schemas.Map({
    encounterId: Schemas.String
  }),
  notifyEncounterStage: Schemas.Map({
    turret: Schemas.String,
    startedAt: Schemas.Int64
  }),
  notifyNewMission: Schemas.Map({
    resetAt: Schemas.Int64
  }),
  notifyShipDestroyed: Schemas.Map({
    destroyedAt: Schemas.Int64
  })
}

export const room = registerMessages(Messages)
