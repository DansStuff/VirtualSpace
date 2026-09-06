import { Color3, Color4, Vector3 } from '@dcl/sdk/math'

// MARK: Simulation

/** Clamp for per-frame `dt` so a hitch cannot jump the sim too far. */
export const SIMULATION_MAX_DELTA_SECONDS = 0.1

// MARK: Ship

/** Fixed scene-space anchor for the visible ship model (center of the enclosing sphere). */
export const SCENE_SHIP_POSITION = Vector3.create(64, 64, 64)

/** World units per second at mid-leg (ease-in-out averages to this). */
export const SHIP_CRUISE_SPEED = 800

/**
 * Bank from the Y of currentHeading × nextHeading (unit vectors on XZ).
 * Cross Y > 0 is a right turn, < 0 is a left turn.
 *
 * SHIP_BANK_GAIN is degrees of roll per unit of that cross Y (which is sin of the heading change).
 * A gentle turn might be ~0.1, so 70 → about 7°. Raise it to lean harder on the same curve;
 * SHIP_MAX_BANK_DEGREES still clamps the result.
 *
 * If the ship banks the wrong way, negate SHIP_BANK_GAIN (70 → -70). That flips left/right
 * without changing how strong the lean is.
 *
 * SHIP_ROLL_SMOOTH is how fast roll eases toward the target (higher = snappier).
 */
export const SHIP_MAX_BANK_DEGREES = 55
export const SHIP_BANK_GAIN = -400
export const SHIP_ROLL_SMOOTH = 2

/** Extra yaw so virtual forward matches a Y flip of the ship GLTF. Applied after bank. */
export const SHIP_MODEL_YAW_DEGREES = 180

/** Starting hull hit points. The HUD bar is hullHp / this value. */
export const SHIP_BASE_HULL_HP = 100

// MARK: Path

/**
 * Runtime id of the origin hold. The first point of the first authored leg is Start;
 * it is not an encounter in the path editor. The ship waits here until the mission starts.
 */
export const PATH_START_STOP_ID = 'start'

/**
 * Bake density for the runtime polyline. Follow is a linear lerp between these samples,
 * not a live Catmull-Rom eval.
 *
 * PATH_SAMPLE_SPACING is the target gap in virtual units. A waypoint-to-waypoint chord longer
 * than PATH_MAX_SEGMENT_SAMPLES * PATH_SAMPLE_SPACING (800) gets coarser samples, so tight bends
 * across a huge gap can look slightly faceted. Raise/remove the cap if that shows up.
 */
export const PATH_SAMPLE_SPACING = 4
export const PATH_MIN_SEGMENT_SAMPLES = 12
export const PATH_MAX_SEGMENT_SAMPLES = 200

/** How far ahead (virtual units) to sample for heading / bank. */
export const PATH_TANGENT_LOOKAHEAD = 15
/** Floor on per-leg lookahead distance. */
export const PATH_TANGENT_LOOKAHEAD_MIN = 4
/** Extra lookahead as a fraction of leg length. */
export const PATH_TANGENT_LOOKAHEAD_LENGTH_FRACTION = 0.02
/** Below this squared length, a sampled tangent is treated as zero. */
export const PATH_TANGENT_EPSILON = 1e-6
/** Minimum knot spacing for centripetal Catmull-Rom (avoids divide-by-zero on coincident points). */
export const PATH_CATMULL_ROM_KNOT_EPSILON = 1e-4

// MARK: Projection

/**
 * Projection-shell radius for planets/stars (scene meters).
 * Does not place the ship — the center is always SCENE_SHIP_POSITION.
 * Smaller values pull bodies onto a closer shell; apparent angular size is unchanged.
 */
export const PLANET_ENCLOSING_SPHERE_RADIUS = 40 // previously 64

/**
 * Smaller enclosing sphere for asteroids (closer shell than planets/stars).
 * Center remains SCENE_SHIP_POSITION; only the projection radius differs.
 */
export const ASTEROID_ENCLOSING_SPHERE_RADIUS = 20

/** Pull celestial body centers inward from the shell along the view ray (meters). */
export const CELESTIAL_SPHERE_INSET = 0.75

/** Assumed player camera vertical FOV (degrees). Angular matching is FOV-independent. */
export const STANDARD_PLAYER_FOV_DEGREES = 50

/** Minimum Transform scale for a projected radius-1 mesh. */
export const PROJECTED_BODY_MIN_SCALE = 0.01

/**
 * Half-angle of the rear planet-cull cone (degrees). Full sector is 90°.
 * Scene +Z is the ship's stern (SHIP_MODEL_YAW_DEGREES = 180); bodies with
 * localDir.z >= cos(this angle) sit behind the hull and are hidden.
 */
export const PLANET_CULL_BEHIND_HALF_ANGLE_DEGREES = 60

// MARK: Stars

export const STAR_MODEL_PATH = 'assets/scene/Models/Star.gltf'

/** Virtual-space radius for distant background stars (models are authored at radius 1). */
export const STAR_VIRTUAL_RADIUS = 85

/** Star.gltf baseColorFactor (RGB) — tint is applied relative to this. */
export const STAR_BASE_COLOR = { r: 0.8, g: 0.8, b: 0.8 }

export const STAR_SPAWN_COUNT_DEFAULT = 20

/**
 * Virtual-space distance for background stars.
 * 1.5× the farthest authored planet (Planet_8 at ~21029 from origin).
 */
export const STAR_SPAWN_DISTANCE = 31544

// MARK: Hazards

export const HAZARD_ASTEROID_MODEL_PATH = 'assets/scene/Models/Asteroid.gltf'
export const HAZARD_TARGETING_CROSSHAIR_TEXTURE_PATH = 'assets/scene/Images/crosshair1.png'

/** Pre-warmed incoming-asteroid entity trees. The pool grows if this is exhausted. */
export const HAZARD_ASTEROID_POOL_SIZE = 10

/** Virtual-space radius of an incoming asteroid (models are authored at radius 1). */
export const HAZARD_RADIUS = 4

/** Seconds between hazard spawns during an encounter. */
export const HAZARD_SPAWN_INTERVAL = 2

/** Virtual-space distance ahead of the ship to place a spawned hazard. */
export const HAZARD_SPAWN_DISTANCE = 240

/** Virtual-space distance from the ship at the end of an asteroid's flight. */
export const HAZARD_IMPACT_DISTANCE = 8

/** Upward-only spawn pitch, degrees above the turret look axis. Sampled from 0 to this value. */
export const HAZARD_CONE_VERTICAL_DEGREES = 20

/** Seconds between damage ticks on a locked asteroid. First hit waits one full interval. */
export const HAZARD_DAMAGE_INTERVAL = 0.5

/** Local tumble rate applied on top of celestial orientation. */
export const HAZARD_SPIN_DEGREES_PER_SECOND = 60

/** Max scene-space distance for the click-to-target aim cone. */
export const HAZARD_RAYCAST_MAX_DISTANCE = 40

/** Aim-assist cone half-angle (degrees) for click-to-target. */
export const HAZARD_AIM_CONE_HALF_ANGLE_DEGREES = 6

/** Minimum time between successful target-lock requests. */
export const HAZARD_TARGET_COOLDOWN_SECONDS = 0.5

/** Uniform scale of the billboard crosshair parented to a hazard. */
export const HAZARD_TARGETING_INDICATOR_SCALE = 4

/** How many targeter portraits each reticule shows. */
export const HAZARD_TARGETING_PORTRAIT_COUNT = 3

/** Radius of the portrait ring around the reticule center (plane is 1×1). */
export const HAZARD_TARGETING_PORTRAIT_RADIUS = 0.55

/** Local Z so portraits sit in front of the reticule plane. */
export const HAZARD_TARGETING_PORTRAIT_Z = -0.1

/** First portrait at 3 o'clock; remaining portraits step clockwise (downward). */
export const HAZARD_TARGETING_PORTRAIT_START_ANGLE_DEGREES = 0
export const HAZARD_TARGETING_PORTRAIT_STEP_DEGREES = -60

/** Local scale of each portrait plane relative to the 1×1 reticule. */
export const HAZARD_TARGETING_PORTRAIT_SCALE = 0.2

/** Local offset of the "Target Locked" label from the reticule center (plane is 1×1). */
export const HAZARD_TARGETING_LOCKED_OFFSET = Vector3.create(0, 0.55, -0.1)

/** TextShape fontSize for the local-player lock label. Inverse-scaled by the reticule parent. */
export const HAZARD_TARGETING_LOCKED_FONT_SIZE = 8

export const HAZARD_SELECT_SOUND_PATH = 'assets/scene/Sounds/select1.mp3'
export const HAZARD_HIT_SHIP_SOUND_PATH = 'assets/scene/Sounds/boom1.mp3'

// MARK: Ship Weapons

/** How long a laser plane stays visible after each shot. */
export const SHIP_LASER_LIFETIME_SECONDS = 0.15

/** Scene-space width of the laser plane (local X). Length is the ship-to-asteroid distance. */
export const SHIP_LASER_WIDTH = 0.25

/** Offset from SCENE_SHIP_POSITION to the laser origin, slightly above the ship roof. */
export const SHIP_LASER_ORIGIN_OFFSET = Vector3.create(0, 7, -6)

/** Camera-local offset from the weapon pose (+Z look, +Y up, +X right). */
export const WEAPON_CAMERA_LOCAL_OFFSET = Vector3.create(0, -3, 2)

/** Seconds to blend into / out of a weapon VirtualCamera. */
export const WEAPON_CAMERA_TRANSITION_SECONDS = 0.5

/** Vertical FOV in degrees while a weapon VirtualCamera is active. */
export const WEAPON_CAMERA_FOV_DEGREES = 60

export const SHIP_LASER_SOUND_PATH = 'assets/scene/Sounds/laser1.mp3'

/** Shots per second with one player targeting. Extra players multiply this, up to SHIP_LASER_MAX_TARGETERS. */
export const SHIP_LASER_BASE_FIRE_RATE = 1.5

/** Target-count clamp for shot frequency. 1 player = base rate; 5+ players = 5× base. */
export const SHIP_LASER_MAX_TARGETERS = 5

/** Pre-warmed laser plane entities. The pool grows if this is exhausted. */
export const SHIP_LASER_POOL_SIZE = 16

export const SHIP_LASER_ALBEDO_COLOR = Color4.create(0.45, 0.05, 0.85, 1)
export const SHIP_LASER_EMISSIVE_COLOR = Color3.create(0.7, 0.15, 1)
export const SHIP_LASER_EMISSIVE_INTENSITY = 4

// MARK: Encounters

export type TurretId = 'left' | 'center' | 'right'

/** Horizontal spawn frustum around a cached gun look. Vertical uses HAZARD_CONE_VERTICAL_DEGREES. */
export const TURRET_SPAWN_FRUSTUM = {
  /** 16:9 @ 60 vFOV is ~91; 80 keeps rocks off the bezel. */
  horizontalFovDegrees: 80,
  inset: 0.55
}

/** Seconds after a stage signal before the first spawn. */
export const ENCOUNTER_STAGE_TELEGRAPH_SECONDS = 2

export type EncounterStage = {
  turret: TurretId
  hazardCount: number
  /** Seconds each asteroid exists before it hits the ship (unless shot). */
  flightTime: number
  asteroidHp: number
  /** Hull damage dealt when an asteroid reaches the ship. */
  asteroidDamage: number
}

export type EncounterParams = {
  stages: EncounterStage[]
}

function defaultEncounterStages(): EncounterStage[] {
  return [
    { turret: 'left', hazardCount: 2, flightTime: 8, asteroidHp: 6, asteroidDamage: 10 },
    { turret: 'right', hazardCount: 2, flightTime: 8, asteroidHp: 6, asteroidDamage: 10 },
    { turret: 'center', hazardCount: 2, flightTime: 8, asteroidHp: 6, asteroidDamage: 10 }
  ]
}

export const ENCOUNTER_PARAMS: Record<string, EncounterParams> = {
  'encounter-1': { stages: defaultEncounterStages() },
  'encounter-2': { stages: defaultEncounterStages() },
  'encounter-3': { stages: defaultEncounterStages() },
  'encounter-4': { stages: defaultEncounterStages() },
  'encounter-5': { stages: defaultEncounterStages() },
  'encounter-6': { stages: defaultEncounterStages() },
  'encounter-7': { stages: defaultEncounterStages() }
}

export const ENCOUNTER_STAGE_SOUND_PATH = 'assets/scene/Sounds/fail1.mp3'

// MARK: UI

export const UI_VIRTUAL_WIDTH = 1920
export const UI_VIRTUAL_HEIGHT = 1080
export const UI_MISSION_BUTTON_FONT_SIZE = 22
export const UI_MISSION_BUTTON_WIDTH = 280
export const UI_MISSION_BUTTON_HEIGHT = 64
export const UI_MISSION_BUTTON_MARGIN_BOTTOM = 80
export const UI_MISSION_STATUS_LABEL_WIDTH = 560
export const UI_HEALTH_BAR_WIDTH = 480
export const UI_HEALTH_BAR_HEIGHT = 36
export const UI_HEALTH_BAR_MARGIN_TOP = 32
export const UI_HEALTH_BAR_FONT_SIZE = 18
export const UI_SHIP_DESTROYED_DURATION_SECONDS = 3
export const UI_SHIP_DESTROYED_FONT_SIZE = 48
export const UI_SHIP_DESTROYED_LABEL_WIDTH = 720
export const UI_SHIP_DESTROYED_LABEL_HEIGHT = 72
export const UI_ENCOUNTER_STAGE_DURATION_SECONDS = 2
export const UI_ENCOUNTER_STAGE_FONT_SIZE = 48
export const UI_ENCOUNTER_STAGE_LABEL_WIDTH = 720
export const UI_ENCOUNTER_STAGE_LABEL_HEIGHT = 72
