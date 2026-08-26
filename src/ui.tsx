import { Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import ReactEcs, { Button, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { room } from './networking/messages'

let missionStarted = false
let showRestart = false

export function markMissionStarted() {
  missionStarted = true
  showRestart = false
}

export function markMissionComplete() {
  showRestart = true
}

export function markMissionReset() {
  missionStarted = false
  showRestart = false
}

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiMenu, { virtualWidth: 1920, virtualHeight: 1080 })
}

function requestMissionStart() {
  if (missionStarted || !isStateSyncronized()) return
  room.send('requestMissionStart', { requestedAt: Date.now() })
}

function requestNewMission() {
  if (!showRestart || !isStateSyncronized()) return
  room.send('requestNewMission', { requestedAt: Date.now() })
}

export const uiMenu = () => (
  <UiEntity
    uiTransform={{
      width: '100%',
      height: '100%',
      display: missionStarted && !showRestart ? 'none' : 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end'
    }}
  >
    <Button
      value="Start Mission"
      variant="primary"
      fontSize={22}
      color={Color4.White()}
      uiTransform={{
        width: 280,
        height: 64,
        margin: { bottom: 80 },
        display: missionStarted || showRestart ? 'none' : 'flex'
      }}
      onMouseDown={requestMissionStart}
    />
    <Button
      value="Restart"
      variant="primary"
      fontSize={22}
      color={Color4.White()}
      uiTransform={{
        width: 280,
        height: 64,
        margin: { bottom: 80 },
        display: showRestart ? 'flex' : 'none'
      }}
      onMouseDown={requestNewMission}
    />
  </UiEntity>
)
