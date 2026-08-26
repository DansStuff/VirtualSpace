import { Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import ReactEcs, { Button, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import {
  UI_MISSION_BUTTON_FONT_SIZE,
  UI_MISSION_BUTTON_HEIGHT,
  UI_MISSION_BUTTON_MARGIN_BOTTOM,
  UI_MISSION_BUTTON_WIDTH,
  UI_VIRTUAL_HEIGHT,
  UI_VIRTUAL_WIDTH
} from './constants'
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
  ReactEcsRenderer.setUiRenderer(uiMenu, { virtualWidth: UI_VIRTUAL_WIDTH, virtualHeight: UI_VIRTUAL_HEIGHT })
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
      fontSize={UI_MISSION_BUTTON_FONT_SIZE}
      color={Color4.White()}
      uiTransform={{
        width: UI_MISSION_BUTTON_WIDTH,
        height: UI_MISSION_BUTTON_HEIGHT,
        margin: { bottom: UI_MISSION_BUTTON_MARGIN_BOTTOM },
        display: missionStarted || showRestart ? 'none' : 'flex'
      }}
      onMouseDown={requestMissionStart}
    />
    <Button
      value="Restart"
      variant="primary"
      fontSize={UI_MISSION_BUTTON_FONT_SIZE}
      color={Color4.White()}
      uiTransform={{
        width: UI_MISSION_BUTTON_WIDTH,
        height: UI_MISSION_BUTTON_HEIGHT,
        margin: { bottom: UI_MISSION_BUTTON_MARGIN_BOTTOM },
        display: showRestart ? 'flex' : 'none'
      }}
      onMouseDown={requestNewMission}
    />
  </UiEntity>
)
