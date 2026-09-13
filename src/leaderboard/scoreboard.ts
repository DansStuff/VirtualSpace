import {
  ColliderLayer,
  engine,
  Entity,
  GltfContainer,
  InputAction,
  inputSystem,
  Material,
  MeshCollider,
  MeshRenderer,
  Name,
  PointerEvents,
  PointerEventType,
  TextAlignMode,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { EntityNames } from '../../assets/scene/entity-names'
import { SCENE_SHIP_POSITION } from '../constants'
import { contributionMapFromRows, type MissionRecord } from '../players/contributions'
import { showRoundResults } from '../ui/roundResults'
import { DUMMY_WEEKLY_MISSIONS } from './dummyWeek'

/** Default Blender cube is 2×2×2, centered, extents ±1. Front is local +Z (Creator Hub / DCL forward). */
const CUBE_HALF = 1
const CUBE_SIZE = CUBE_HALF * 2
const ROW_COUNT = 5
const ROW_GAP = 0.06
const POINTER_DISTANCE = 30
const LABEL_FONT_SIZE = 1.4

const rowEntities: Entity[] = []
const rowMissions = new Map<Entity, MissionRecord>()

function rowHeight(): number {
  return (CUBE_SIZE - ROW_GAP * (ROW_COUNT - 1)) / ROW_COUNT
}

function rowLocalY(index: number): number {
  return CUBE_HALF - index * (rowHeight() + ROW_GAP) - rowHeight() / 2
}

function createRow(parent: Entity, index: number, mission: MissionRecord, parentScale: Vector3): Entity {
  const height = rowHeight()
  const planeScale = Vector3.create(CUBE_SIZE, height, 1)
  const entity = engine.addEntity()
  Transform.create(entity, {
    parent,
    position: Vector3.create(0, rowLocalY(index), CUBE_HALF),
    rotation: Quaternion.fromEulerDegrees(0, 180, 0),
    scale: planeScale
  })
  MeshRenderer.setPlane(entity)
  MeshCollider.setPlane(entity, ColliderLayer.CL_POINTER)
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(0.1, 0.12, 0.16, 0.96),
    metallic: 0,
    roughness: 0.8,
    emissiveColor: Color3.create(0.08, 0.1, 0.14),
    emissiveIntensity: 0.4,
    castShadows: false
  })
  PointerEvents.create(entity, {
    pointerEvents: [
      {
        eventType: PointerEventType.PET_DOWN,
        eventInfo: {
          button: InputAction.IA_POINTER,
          hoverText: `View mission #${index + 1}`,
          maxDistance: POINTER_DISTANCE,
          showFeedback: true,
          showHighlight: true
        }
      }
    ]
  })

  const label = engine.addEntity()
  Transform.create(label, {
    parent: entity,
    position: Vector3.create(0, 0, -0.02),
    scale: Vector3.create(
      1 / (planeScale.x * parentScale.x),
      1 / (planeScale.y * parentScale.y),
      1 / Math.max(parentScale.z, 0.001)
    )
  })
  TextShape.create(label, {
    text: `#${index + 1}  ${mission.furthestEncounter}`,
    fontSize: LABEL_FONT_SIZE,
    textColor: Color4.create(0.92, 0.93, 0.95, 1),
    outlineColor: Color4.Black(),
    outlineWidth: 0.08,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })

  rowEntities.push(entity)
  rowMissions.set(entity, mission)
  return entity
}

function ScoreboardClickSystem(): void {
  for (const entity of rowEntities) {
    if (!inputSystem.getInputCommand(InputAction.IA_POINTER, PointerEventType.PET_DOWN, entity)) {
      continue
    }
    const mission = rowMissions.get(entity)
    if (!mission) return
    showRoundResults(contributionMapFromRows(mission.contributions), mission.won)
    return
  }
}

function findScoreboardEntity(): Entity | null {
  for (const [entity, name] of engine.getEntitiesWith(Name)) {
    if (name.value === EntityNames.Scoreboard) return entity
  }
  return null
}

function resolveAnchor(): { entity: Entity; scale: Vector3 } {
  const named = findScoreboardEntity()
  if (named !== null) {
    GltfContainer.deleteFrom(named)
    return { entity: named, scale: Transform.get(named).scale }
  }

  console.log('[CLIENT] Scoreboard entity missing; using ship-origin fallback')
  const fallback = engine.addEntity()
  Transform.create(fallback, {
    position: Vector3.clone(SCENE_SHIP_POSITION),
    rotation: Quaternion.fromEulerDegrees(0, 0, 0)
  })
  return { entity: fallback, scale: Vector3.One() }
}

export function setupScoreboard(): void {
  const anchor = resolveAnchor()

  for (let i = 0; i < ROW_COUNT; i++) {
    const mission = DUMMY_WEEKLY_MISSIONS[i]
    if (!mission) continue
    createRow(anchor.entity, i, mission, anchor.scale)
  }

  engine.addSystem(ScoreboardClickSystem)
}
