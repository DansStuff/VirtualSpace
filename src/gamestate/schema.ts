import { engine, Schemas } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

export const GameState = engine.defineComponent('game:State', {
  encounterId: Schemas.String,
  hullHp: Schemas.Int,
  inEncounter: Schemas.Boolean,
  missionStarted: Schemas.Boolean
})

export type GameStateSnapshot = {
  encounterId: string
  hullHp: number
  inEncounter: boolean
  missionStarted: boolean
}

if (isServer()) {
  GameState.validateBeforeChange((value) => {
    return value.senderAddress === AUTH_SERVER_PEER_ID
  })
}
