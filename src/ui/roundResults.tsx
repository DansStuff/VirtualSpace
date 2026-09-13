import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { UI_VIRTUAL_HEIGHT, UI_VIRTUAL_WIDTH } from '../constants'
import { room } from '../networking/messages'
import { contributionMapFromRows, type RoundContribution } from '../players/contributions'

type ResultRow = {
  playerId: string
  damage: number
  repairs: number
}

const PANEL_WIDTH = 720
const PANEL_HEIGHT = 560
const TITLE_HEIGHT = 48
const HEADER_HEIGHT = 36
const ROW_HEIGHT = 48
const PORTRAIT_SIZE = 36
const CLOSE_WIDTH = 160
const CLOSE_HEIGHT = 48
const COL_CREW = 320
const COL_NAME = 274
const COL_STAT = 160

const BACKDROP_COLOR = Color4.create(0, 0, 0, 0.55)
const PANEL_COLOR = Color4.create(0.1, 0.12, 0.16, 0.96)
const TITLE_WIN_COLOR = Color4.create(0.45, 0.85, 0.5, 1)
const TITLE_LOSS_COLOR = Color4.create(1, 0.35, 0.28, 1)
const HEADER_COLOR = Color4.create(0.7, 0.74, 0.8, 1)
const ROW_COLOR = Color4.create(0.92, 0.93, 0.95, 1)
const EMPTY_COLOR = Color4.create(0.6, 0.62, 0.66, 1)

let visible = false
let won = false
let rows: ResultRow[] = []

function truncateWallet(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function displayName(address: string): string {
  return getPlayer({ userId: address })?.name || truncateWallet(address)
}

export function showRoundResults(
  contributions: ReadonlyMap<string, RoundContribution>,
  didWin: boolean
): void {
  won = didWin
  rows = [...contributions.entries()]
    .map(([playerId, stats]) => ({
      playerId,
      damage: stats.damage,
      repairs: stats.repairs
    }))
    .sort((a, b) => b.damage - a.damage || b.repairs - a.repairs)
  visible = true
}

function hideRoundResults() {
  visible = false
}

function ResultRowView(row: ResultRow, key: string) {
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
          width: COL_CREW,
          height: ROW_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center'
        }}
      >
        <UiEntity
          uiTransform={{
            width: PORTRAIT_SIZE,
            height: PORTRAIT_SIZE,
            margin: { right: 10 }
          }}
          uiBackground={{
            avatarTexture: { userId: row.playerId },
            textureMode: 'stretch'
          }}
        />
        <Label
          value={displayName(row.playerId)}
          fontSize={18}
          color={ROW_COLOR}
          textAlign="middle-left"
          uiTransform={{ width: COL_NAME, height: ROW_HEIGHT }}
        />
      </UiEntity>
      <Label
        value={`${row.damage}`}
        fontSize={18}
        color={ROW_COLOR}
        textAlign="middle-center"
        uiTransform={{ width: COL_STAT, height: ROW_HEIGHT }}
      />
      <Label
        value={`${row.repairs}`}
        fontSize={18}
        color={ROW_COLOR}
        textAlign="middle-center"
        uiTransform={{ width: COL_STAT, height: ROW_HEIGHT }}
      />
    </UiEntity>
  )
}

function RoundResultsUi() {
  if (!visible) {
    return <UiEntity uiTransform={{ width: '100%', height: '100%' }} />
  }

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'block'
      }}
      uiBackground={{ color: BACKDROP_COLOR }}
    >
      <UiEntity
        uiTransform={{
          width: PANEL_WIDTH,
          height: PANEL_HEIGHT,
          flexDirection: 'column',
          alignItems: 'center',
          padding: 24
        }}
        uiBackground={{ color: PANEL_COLOR }}
      >
        <Label
          value={won ? 'MISSION COMPLETE' : 'SHIP DESTROYED'}
          fontSize={32}
          color={won ? TITLE_WIN_COLOR : TITLE_LOSS_COLOR}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: TITLE_HEIGHT, margin: { bottom: 16 } }}
        />
        <UiEntity
          uiTransform={{
            width: '100%',
            height: HEADER_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            margin: { bottom: 8 }
          }}
        >
          <Label
            value="Crew"
            fontSize={16}
            color={HEADER_COLOR}
            textAlign="middle-left"
            uiTransform={{ width: COL_CREW, height: HEADER_HEIGHT }}
          />
          <Label
            value="Damage"
            fontSize={16}
            color={HEADER_COLOR}
            textAlign="middle-center"
            uiTransform={{ width: COL_STAT, height: HEADER_HEIGHT }}
          />
          <Label
            value="Repairs"
            fontSize={16}
            color={HEADER_COLOR}
            textAlign="middle-center"
            uiTransform={{ width: COL_STAT, height: HEADER_HEIGHT }}
          />
        </UiEntity>
        <UiEntity
          uiTransform={{
            width: '100%',
            height: 340,
            flexDirection: 'column',
            overflow: 'scroll',
            margin: { bottom: 16 }
          }}
        >
          {rows.length === 0 ? (
            <Label
              value="No contributions recorded"
              fontSize={18}
              color={EMPTY_COLOR}
              textAlign="middle-center"
              uiTransform={{ width: '100%', height: ROW_HEIGHT }}
            />
          ) : (
            rows.map((row) => ResultRowView(row, row.playerId))
          )}
        </UiEntity>
        <Button
          value="Close"
          variant="primary"
          fontSize={20}
          color={Color4.White()}
          uiTransform={{ width: CLOSE_WIDTH, height: CLOSE_HEIGHT }}
          onMouseDown={hideRoundResults}
        />
      </UiEntity>
    </UiEntity>
  )
}

export function setupRoundResultsUi() {
  const owner = engine.addEntity()
  ReactEcsRenderer.addUiRenderer(owner, RoundResultsUi, {
    virtualWidth: UI_VIRTUAL_WIDTH,
    virtualHeight: UI_VIRTUAL_HEIGHT
  })

  let appliedResultsAt = 0
  room.onMessage('notifyRoundResults', (data) => {
    if (data.endedAt <= appliedResultsAt) return
    appliedResultsAt = data.endedAt
    showRoundResults(contributionMapFromRows(data.contributions), data.won)
  })
}
