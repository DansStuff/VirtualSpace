import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { shipVirtualPosition, shipVirtualRotation } from '../ship'
import { SHIP_ROUTE, type ShipRoute } from './route'

/** World units per second at mid-leg (ease-in-out averages to this). */
export const SHIP_CRUISE_SPEED = 800

/** Placeholder park time until an encounter calls `resumeFromStop()`. */
export const HOLD_SECONDS = 2

/**
 * Bake density for the runtime polyline. Follow is a linear lerp between these samples
 * (writePositionAt), not a live Catmull-Rom eval.
 *
 * SAMPLE_SPACING is the target gap in virtual units. A waypoint-to-waypoint chord longer
 * than MAX_SEGMENT_SAMPLES * SAMPLE_SPACING (800) gets coarser samples, so tight bends
 * across a huge gap can look slightly faceted. Raise/remove the cap if that shows up.
 */
const SAMPLE_SPACING = 4
const MIN_SEGMENT_SAMPLES = 12
const MAX_SEGMENT_SAMPLES = 200
const TANGENT_LOOKAHEAD = 15
const TANGENT_EPSILON = 1e-6
const KNOT_EPSILON = 1e-4
/**
 * Bank from the Y of currentHeading × nextHeading (unit vectors on XZ).
 * Cross Y > 0 is a right turn, < 0 is a left turn.
 *
 * BANK_GAIN is degrees of roll per unit of that cross Y (which is sin of the heading change).
 * A gentle turn might be ~0.1, so 70 → about 7°. Raise it to lean harder on the same curve;
 * MAX_BANK_DEGREES still clamps the result.
 *
 * If the ship banks the wrong way, negate BANK_GAIN (70 → -70). That flips left/right
 * without changing how strong the lean is.
 *
 * ROLL_SMOOTH is how fast roll eases toward the target (higher = snappier).
 */
const MAX_BANK_DEGREES = 55
const BANK_GAIN = -400
const ROLL_SMOOTH = 2

/** Extra yaw so virtual forward matches a 180° Y flip of the ship GLTF. Applied after bank. */
const MODEL_YAW = Quaternion.fromAngleAxis(180, Vector3.Up())

const scratchPoint: RoutePoint = { x: 0, z: 0 }
const scratchAhead: RoutePoint = { x: 0, z: 0 }
const scratchNext: RoutePoint = { x: 0, z: 0 }
const scratchForward: Vector3.Mutable = Vector3.create(1, 0, 0)
const scratchBankAxis: Vector3 = Vector3.Forward()

type RoutePoint = { x: number; z: number }

type Sample = {
  s: number
  x: number
  z: number
}

type PreparedLeg = {
  stopId: string
  length: number
  duration: number
  lookAhead: number
  samples: Sample[]
}

type PathState = {
  legIndex: number
  elapsed: number
  holding: boolean
  holdElapsed: number
  finished: boolean
  /** Stop id while holding; 'start' before the first leg; null while transiting. */
  currentStopId: string | null
  /** Smoothed bank in degrees. Positive = roll right. */
  roll: number
}

function dist(a: RoutePoint, b: RoutePoint): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  return Math.sqrt(dx * dx + dz * dz)
}

function lerpPoint(a: RoutePoint, b: RoutePoint, ta: number, tb: number, t: number): RoutePoint {
  if (Math.abs(tb - ta) < 1e-8) return { x: a.x, z: a.z }
  const u = (t - ta) / (tb - ta)
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u }
}

/** Centripetal Catmull-Rom (α = 0.5) from p1 to p2, t in [0, 1]. Avoids cusps on uneven points. */
function interpolatePoint(p0: RoutePoint, p1: RoutePoint, p2: RoutePoint, p3: RoutePoint, t: number): RoutePoint {
  const t0 = 0
  const t1 = t0 + Math.pow(Math.max(dist(p0, p1), KNOT_EPSILON), 0.5)
  const t2 = t1 + Math.pow(Math.max(dist(p1, p2), KNOT_EPSILON), 0.5)
  const t3 = t2 + Math.pow(Math.max(dist(p2, p3), KNOT_EPSILON), 0.5)
  const tVal = t1 + (t2 - t1) * t
  const a1 = lerpPoint(p0, p1, t0, t1, tVal)
  const a2 = lerpPoint(p1, p2, t1, t2, tVal)
  const a3 = lerpPoint(p2, p3, t2, t3, tVal)
  const b1 = lerpPoint(a1, a2, t0, t2, tVal)
  const b2 = lerpPoint(a2, a3, t1, t3, tVal)
  return lerpPoint(b1, b2, t1, t2, tVal)
}

/**
 * Normalized distance along a leg for normalized time `t`.
 * 0 = constant speed; 1 = accel first half, decel second half; above 1 = softer
 * holds at the ends and a sharper mid-leg (slider goes to 4).
 */
function accelDecelProgress(t: number, amount: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const a = Math.min(4, Math.max(0, amount))
  if (a >= 1) {
    const p = 1 + a
    if (t < 0.5) return Math.pow(2 * t, p) / 2
    return 1 - Math.pow(2 * (1 - t), p) / 2
  }
  const ramp = a * 0.5
  if (ramp < 1e-6) return t
  const peak = 1 / (1 - ramp)
  if (t < ramp) {
    return (peak * t * t) / (2 * ramp)
  }
  if (t <= 1 - ramp) {
    return peak * (ramp / 2 + (t - ramp))
  }
  const rest = 1 - t
  return 1 - (peak * rest * rest) / (2 * ramp)
}

/** Catmull-Rom handles for an open path (no wrap from last leg back to first). */
function segmentHandles(legs: ShipRoute['legs'], legIndex: number, segIndex: number): {
  p0: RoutePoint
  p1: RoutePoint
  p2: RoutePoint
  p3: RoutePoint
} {
  const pts = legs[legIndex].points
  const p1 = pts[segIndex]
  const p2 = pts[segIndex + 1]
  const p0 =
    segIndex === 0
      ? legIndex > 0
        ? legs[legIndex - 1].points[legs[legIndex - 1].points.length - 2]
        : p1
      : pts[segIndex - 1]
  const p3 =
    segIndex === pts.length - 2
      ? legIndex < legs.length - 1
        ? legs[legIndex + 1].points[1]
        : p2
      : pts[segIndex + 2]
  return { p0, p1, p2, p3 }
}

function prepareLegs(route: ShipRoute): PreparedLeg[] {
  const prepared: PreparedLeg[] = []
  for (let legIndex = 0; legIndex < route.legs.length; legIndex++) {
    const leg = route.legs[legIndex]
    const samples: Sample[] = []
    let length = 0
    if (leg.points.length >= 2) {
      let prev = leg.points[0]
      samples.push({ s: 0, x: prev.x, z: prev.z })
      const segments = leg.points.length - 1
      for (let seg = 0; seg < segments; seg++) {
        const { p0, p1, p2, p3 } = segmentHandles(route.legs, legIndex, seg)
        const count = Math.min(
          MAX_SEGMENT_SAMPLES,
          Math.max(MIN_SEGMENT_SAMPLES, Math.ceil(dist(p1, p2) / SAMPLE_SPACING))
        )
        for (let i = 1; i <= count; i++) {
          const point = interpolatePoint(p0, p1, p2, p3, i / count)
          const step = dist(prev, point)
          if (step < 1e-6) continue
          length += step
          samples.push({ s: length, x: point.x, z: point.z })
          prev = point
        }
      }
    }
    prepared.push({
      stopId: leg.stopId,
      length,
      duration: length > 1 ? length / SHIP_CRUISE_SPEED : 0,
      lookAhead: Math.min(TANGENT_LOOKAHEAD, Math.max(4, length * 0.02)),
      samples
    })
  }
  return prepared
}

/** Writes the point at arc-length `s` into `out`. No allocations. */
function writePositionAt(leg: PreparedLeg, s: number, out: RoutePoint): void {
  const samples = leg.samples
  if (samples.length === 0) {
    out.x = 0
    out.z = 0
    return
  }
  if (samples.length === 1 || leg.length <= 0) {
    out.x = samples[0].x
    out.z = samples[0].z
    return
  }
  const clamped = s < 0 ? 0 : s > leg.length ? leg.length : s
  let lo = 0
  let hi = samples.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (samples[mid].s <= clamped) lo = mid
    else hi = mid
  }
  const a = samples[lo]
  const b = samples[hi]
  const span = b.s - a.s
  const u = span > 1e-8 ? (clamped - a.s) / span : 0
  out.x = a.x + (b.x - a.x) * u
  out.z = a.z + (b.z - a.z) * u
}

function applyLookAndBank(targetRoll: number, dt: number): void {
  if (dt <= 0) {
    state.roll = targetRoll
  } else {
    state.roll += (targetRoll - state.roll) * Math.min(1, dt * ROLL_SMOOTH)
  }
  const facing = Quaternion.lookRotation(scratchForward)
  const banked = Quaternion.multiply(facing, Quaternion.fromAngleAxis(state.roll, scratchBankAxis))
  const oriented = Quaternion.multiply(banked, MODEL_YAW)
  shipVirtualRotation.x = oriented.x
  shipVirtualRotation.y = oriented.y
  shipVirtualRotation.z = oriented.z
  shipVirtualRotation.w = oriented.w
}

/** Y of unit(current) × unit(next). Negative = left turn, positive = right. */
function headingCrossY(ax: number, az: number, bx: number, bz: number): number {
  const aLen = Math.sqrt(ax * ax + az * az)
  const bLen = Math.sqrt(bx * bx + bz * bz)
  if (aLen < 1e-8 || bLen < 1e-8) return 0
  return (az * bx - ax * bz) / (aLen * bLen)
}

function bankFromHeadings(ax: number, az: number, bx: number, bz: number): number {
  const crossY = headingCrossY(ax, az, bx, bz)
  const roll = crossY * BANK_GAIN
  if (roll > MAX_BANK_DEGREES) return MAX_BANK_DEGREES
  if (roll < -MAX_BANK_DEGREES) return -MAX_BANK_DEGREES
  return roll
}

function applySampledPose(leg: PreparedLeg, s: number, updateHeading: boolean, dt: number): void {
  writePositionAt(leg, s, scratchPoint)
  shipVirtualPosition.x = scratchPoint.x
  shipVirtualPosition.y = SHIP_ROUTE.y
  shipVirtualPosition.z = scratchPoint.z

  let targetRoll = 0
  if (updateHeading) {
    const look = leg.lookAhead
    writePositionAt(leg, s + look, scratchAhead)
    let tx = scratchAhead.x - scratchPoint.x
    let tz = scratchAhead.z - scratchPoint.z
    let haveNext = true
    if (tx * tx + tz * tz < TANGENT_EPSILON) {
      writePositionAt(leg, s - look, scratchAhead)
      tx = scratchPoint.x - scratchAhead.x
      tz = scratchPoint.z - scratchAhead.z
      haveNext = false
    }
    const lenSq = tx * tx + tz * tz
    if (lenSq < TANGENT_EPSILON) {
      applyLookAndBank(0, dt)
      return
    }
    const inv = 1 / Math.sqrt(lenSq)
    scratchForward.x = tx * inv
    scratchForward.y = 0
    scratchForward.z = tz * inv

    if (haveNext) {
      writePositionAt(leg, s + look * 2, scratchNext)
      targetRoll = bankFromHeadings(tx, tz, scratchNext.x - scratchAhead.x, scratchNext.z - scratchAhead.z)
    }
  }

  applyLookAndBank(targetRoll, dt)
}

const preparedLegs = prepareLegs(SHIP_ROUTE)

const state: PathState = {
  legIndex: 0,
  elapsed: 0,
  holding: true,
  holdElapsed: 0,
  finished: false,
  currentStopId: preparedLegs.length > 0 ? 'start' : null,
  roll: 0
}

let skipHold = false

{
  const startLeg = preparedLegs[0]
  if (startLeg && startLeg.samples.length > 0) {
    applySampledPose(startLeg, 0, true, 0)
  }
}

/** Skip the rest of the current stop hold and start the next leg. Ignored while transiting. */
export function resumeFromStop(): void {
  if (state.holding && !state.finished) {
    skipHold = true
  }
}

export function isShipStopped(): boolean {
  return state.holding
}

export function currentStopId(): string | null {
  return state.currentStopId
}

/**
 * Advances the ship's virtual pose along authored legs: ease in/out, then hold at each stop.
 * The visible ship Transform stays fixed; only shipVirtualPosition / Rotation change.
 */
export function ShipPathSystem(dt: number): void {
  if (preparedLegs.length === 0) return

  const step = Math.min(dt, 0.1)

  if (state.holding) {
    applyLookAndBank(0, step)
    if (state.finished) return
    state.holdElapsed += step
    if (skipHold || state.holdElapsed >= HOLD_SECONDS) {
      skipHold = false
      state.holding = false
      state.holdElapsed = 0
      state.currentStopId = null
      state.elapsed = 0
    }
    return
  }

  const leg = preparedLegs[state.legIndex]
  if (!leg || leg.duration <= 0) {
    enterHold(leg ? leg.stopId : null, leg)
    finishOrAdvance()
    return
  }

  state.elapsed += step
  const u = accelDecelProgress(state.elapsed / leg.duration, SHIP_ROUTE.accelDecel)
  applySampledPose(leg, u * leg.length, true, step)

  if (state.elapsed >= leg.duration) {
    enterHold(leg.stopId, leg)
    finishOrAdvance()
  }
}

function finishOrAdvance(): void {
  if (state.legIndex >= preparedLegs.length - 1) {
    state.finished = true
  } else {
    state.legIndex += 1
  }
}

function enterHold(stopId: string | null, leg: PreparedLeg | undefined): void {
  state.holding = true
  state.holdElapsed = 0
  state.currentStopId = stopId
  state.elapsed = 0
  if (!leg) return
  writePositionAt(leg, leg.length, scratchPoint)
  shipVirtualPosition.x = scratchPoint.x
  shipVirtualPosition.y = SHIP_ROUTE.y
  shipVirtualPosition.z = scratchPoint.z
}
