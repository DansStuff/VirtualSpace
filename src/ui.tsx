import { Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import {
  UI_HEALTH_BAR_FONT_SIZE,
  UI_HEALTH_BAR_HEIGHT,
  UI_HEALTH_BAR_MARGIN_TOP,
  UI_HEALTH_BAR_WIDTH,
  UI_MISSION_BUTTON_FONT_SIZE,
  UI_MISSION_BUTTON_HEIGHT,
  UI_MISSION_BUTTON_MARGIN_BOTTOM,
  UI_MISSION_BUTTON_WIDTH,
  UI_MISSION_STATUS_LABEL_WIDTH,
  UI_VIRTUAL_HEIGHT,
  UI_VIRTUAL_WIDTH
} from './constants'
import { room } from './networking/messages'

let missionStarted = false
let showRestart = false
let turretOccupied = false
let shipHealth = 100

const MISSION_STATUS_COLOR = Color4.create(0.55, 0.55, 0.55, 1)
const HEALTH_BAR_BACKGROUND = Color4.Red()
const HEALTH_BAR_FOREGROUND = Color4.Green()

export function markTurretOccupied() {
  turretOccupied = true
}

export function markTurretExited() {
  turretOccupied = false
}

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
  turretOccupied = false
}

export function setShipHealth(percent: number) {
  shipHealth = Math.max(0, Math.min(100, percent))
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

function requestLeaveTurret() {
  markTurretExited()
}

function inMissionHud() {
  return missionStarted && !showRestart
}

export const uiMenu = () => (
  <UiEntity
    uiTransform={{
      width: '100%',
      height: '100%'
    }}
  >
    <UiEntity
      uiTransform={{
        width: '100%',
        height: UI_HEALTH_BAR_HEIGHT,
        positionType: 'absolute',
        position: { top: UI_HEALTH_BAR_MARGIN_TOP, left: 0 },
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <UiEntity
        uiTransform={{
          width: UI_HEALTH_BAR_WIDTH,
          height: UI_HEALTH_BAR_HEIGHT
        }}
      >
        <UiEntity
          uiTransform={{ width: '100%', height: '100%' }}
          uiBackground={{ color: HEALTH_BAR_BACKGROUND }}
        >
          <UiEntity
            uiTransform={{ width: `${shipHealth}%`, height: '100%' }}
            uiBackground={{ color: HEALTH_BAR_FOREGROUND }}
          />
        </UiEntity>
        <Label
          value="Hull Status"
          fontSize={UI_HEALTH_BAR_FONT_SIZE}
          color={Color4.Black()}
          textAlign="middle-center"
          uiTransform={{
            width: '100%',
            height: '100%',
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            zIndex: 1
          }}
        />
      </UiEntity>
    </UiEntity>

    <UiEntity
      uiTransform={{
        width: '100%',
        height: UI_MISSION_BUTTON_HEIGHT + UI_MISSION_BUTTON_MARGIN_BOTTOM,
        positionType: 'absolute',
        position: { bottom: 0, left: 0 },
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
      <Label
        value="Mission in progress: join the fight!"
        fontSize={UI_MISSION_BUTTON_FONT_SIZE}
        color={MISSION_STATUS_COLOR}
        textAlign="middle-center"
        uiTransform={{
          width: UI_MISSION_STATUS_LABEL_WIDTH,
          height: UI_MISSION_BUTTON_HEIGHT,
          margin: { bottom: UI_MISSION_BUTTON_MARGIN_BOTTOM },
          display: inMissionHud() && !turretOccupied ? 'flex' : 'none'
        }}
      />
      <Button
        value="Back to ship"
        variant="primary"
        fontSize={UI_MISSION_BUTTON_FONT_SIZE}
        color={Color4.White()}
        uiTransform={{
          width: UI_MISSION_BUTTON_WIDTH,
          height: UI_MISSION_BUTTON_HEIGHT,
          margin: { bottom: UI_MISSION_BUTTON_MARGIN_BOTTOM },
          display: inMissionHud() && turretOccupied ? 'flex' : 'none'
        }}
        onMouseDown={requestLeaveTurret}
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
  </UiEntity>
)
