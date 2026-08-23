import { Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import ReactEcs, { Button, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { room } from './shared/messages'

let missionStarted = false

export function markMissionStarted() {
  missionStarted = true
}

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiMenu, { virtualWidth: 1920, virtualHeight: 1080 })
}

function requestMissionStart() {
  if (missionStarted || !isStateSyncronized()) return
  room.send('requestMissionStart', {})
}

export const uiMenu = () => (
  <UiEntity
    uiTransform={{
      width: '100%',
      height: '100%',
      display: missionStarted ? 'none' : 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end'
    }}
  >
    <Button
      value="Start Mission"
      variant="primary"
      fontSize={22}
      color={Color4.White()}
      uiTransform={{ width: 280, height: 64, margin: { bottom: 80 } }}
      onMouseDown={requestMissionStart}
    />
  </UiEntity>
)
