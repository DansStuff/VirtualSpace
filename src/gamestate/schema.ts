import { engine, Schemas } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

export const GameState = engine.defineComponent('game:State', {
  encounterId: Schemas.String,
  hullHp: Schemas.Int,
  inEncounter: Schemas.Boolean,
  missionStarted: Schemas.Boolean,
  /** true = turret online; false = broken */
  turret1: Schemas.Boolean,
  turret2: Schemas.Boolean,
  turret3: Schemas.Boolean,
  /** true = breach active */
  breach1: Schemas.Boolean,
  breach2: Schemas.Boolean,
  breach3: Schemas.Boolean,
  breach4: Schemas.Boolean,
  breach5: Schemas.Boolean,
  breach6: Schemas.Boolean
})

export type GameStateSnapshot = {
  encounterId: string
  hullHp: number
  inEncounter: boolean
  missionStarted: boolean
  turret1: boolean
  turret2: boolean
  turret3: boolean
  breach1: boolean
  breach2: boolean
  breach3: boolean
  breach4: boolean
  breach5: boolean
  breach6: boolean
}

if (isServer()) {
  GameState.validateBeforeChange((value) => {
    return value.senderAddress === AUTH_SERVER_PEER_ID
  })
}
