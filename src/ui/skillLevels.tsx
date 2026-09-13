import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import {
  UI_ENGINEERING_ICON_PATH,
  UI_GUNNER_ICON_PATH,
  UI_VIRTUAL_HEIGHT,
  UI_VIRTUAL_WIDTH
} from '../constants'
import { DEFAULT_PLAYER_STATS, getPlayerStats } from '../players/stats'

const PANEL_WIDTH = 280
const PANEL_HEIGHT = 112
const PANEL_MARGIN = 32
const ROW_HEIGHT = 44
const ICON_SIZE = 36
const LABEL_WIDTH = 150
const LEVEL_WIDTH = 48

const PANEL_COLOR = Color4.create(0.1, 0.12, 0.16, 0.86)
const LABEL_COLOR = Color4.create(0.7, 0.74, 0.8, 1)
const LEVEL_COLOR = Color4.create(0.92, 0.93, 0.95, 1)

function localSkillLevels() {
  const me = getPlayer()
  if (!me) return DEFAULT_PLAYER_STATS
  return getPlayerStats(me.userId)
}

function SkillRow(iconSrc: string, label: string, level: number, key: string) {
  return (
    <UiEntity
      key={key}
      uiTransform={{
        width: '100%',
        height: ROW_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center'
      }}
    >
      <UiEntity
        uiTransform={{
          width: ICON_SIZE,
          height: ICON_SIZE,
          margin: { right: 12 }
        }}
        uiBackground={{
          texture: { src: iconSrc },
          textureMode: 'stretch'
        }}
      />
      <Label
        value={label}
        fontSize={18}
        color={LABEL_COLOR}
        textAlign="middle-left"
        uiTransform={{ width: LABEL_WIDTH, height: ROW_HEIGHT }}
      />
      <Label
        value={`${level}`}
        fontSize={22}
        color={LEVEL_COLOR}
        textAlign="middle-right"
        uiTransform={{ width: LEVEL_WIDTH, height: ROW_HEIGHT }}
      />
    </UiEntity>
  )
}

function SkillLevelsUi() {
  const stats = localSkillLevels()

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
      <UiEntity
        uiTransform={{
          width: PANEL_WIDTH,
          height: PANEL_HEIGHT,
          positionType: 'absolute',
          position: { top: PANEL_MARGIN, right: PANEL_MARGIN },
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 12
        }}
        uiBackground={{ color: PANEL_COLOR }}
      >
        {SkillRow(UI_GUNNER_ICON_PATH, 'Gunner', stats.gunnerLevel, 'gunner')}
        {SkillRow(UI_ENGINEERING_ICON_PATH, 'Engineering', stats.engineeringLevel, 'engineering')}
      </UiEntity>
    </UiEntity>
  )
}

export function setupSkillLevelsUi() {
  const owner = engine.addEntity()
  ReactEcsRenderer.addUiRenderer(owner, SkillLevelsUi, {
    virtualWidth: UI_VIRTUAL_WIDTH,
    virtualHeight: UI_VIRTUAL_HEIGHT
  })
}
