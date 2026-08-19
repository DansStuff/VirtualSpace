import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { shipVirtualPosition, shipVirtualRotation } from '../ship'
import { SHIP_ROUTE, type ShipRoute } from './route'

/** World units per second at mid-leg (ease-in-out averages to this). */
export const SHIP_CRUISE_SPEED = 2500

/** Placeholder park time until an encounter calls `resumeFromStop()`. */
export const HOLD_SECONDS = 4

const SAMPLES_PER_SEGMENT = 32
const TANGENT_EPSILON = 1e-6

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
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

function interpolatePoint(p0: RoutePoint, p1: RoutePoint, p2: RoutePoint, p3: RoutePoint, t: number): RoutePoint {
  return {
    x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
    z: catmullRom(p0.z, p1.z, p2.z, p3.z, t)
  }
}

/**
 * Normalized distance along a leg for normalized time `t`.
 * `amount` 0 = constant speed; 1 = accel for the first half, decel for the second.
 */
function accelDecelProgress(t: number, amount: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const ramp = Math.min(1, Math.max(0, amount)) * 0.5
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
        for (let i = 1; i <= SAMPLES_PER_SEGMENT; i++) {
          const t = i / SAMPLES_PER_SEGMENT
          const point = interpolatePoint(p0, p1, p2, p3, t)
          const dx = point.x - prev.x
          const dz = point.z - prev.z
          length += Math.sqrt(dx * dx + dz * dz)
          samples.push({ s: length, x: point.x, z: point.z })
          prev = point
        }
      }
    }
    prepared.push({
      stopId: leg.stopId,
      length,
      duration: length > 1 ? length / SHIP_CRUISE_SPEED : 0,
      samples
    })
  }
  return prepared
}

function sampleAt(leg: PreparedLeg, s: number): { x: number; z: number; tx: number; tz: number } {
  const samples = leg.samples
  if (samples.length === 0) {
    return { x: 0, z: 0, tx: 1, tz: 0 }
  }
  if (samples.length === 1 || leg.length <= 0) {
    return { x: samples[0].x, z: samples[0].z, tx: 1, tz: 0 }
  }
  const clamped = Math.min(leg.length, Math.max(0, s))
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
  const x = a.x + (b.x - a.x) * u
  const z = a.z + (b.z - a.z) * u
  let tx = b.x - a.x
  let tz = b.z - a.z
  if (tx * tx + tz * tz < TANGENT_EPSILON) {
    const next = samples[Math.min(samples.length - 1, hi + 1)]
    tx = next.x - a.x
    tz = next.z - a.z
  }
  return { x, z, tx, tz }
}

function applyPose(x: number, y: number, z: number, tx: number, tz: number, updateFacing: boolean): void {
  shipVirtualPosition.x = x
  shipVirtualPosition.y = y
  shipVirtualPosition.z = z
  if (!updateFacing) return
  const lenSq = tx * tx + tz * tz
  if (lenSq < TANGENT_EPSILON) return
  const inv = 1 / Math.sqrt(lenSq)
  const facing = Quaternion.lookRotation(Vector3.create(tx * inv, 0, tz * inv))
  shipVirtualRotation.x = facing.x
  shipVirtualRotation.y = facing.y
  shipVirtualRotation.z = facing.z
  shipVirtualRotation.w = facing.w
}

const preparedLegs = prepareLegs(SHIP_ROUTE)

const state: PathState = {
  legIndex: 0,
  elapsed: 0,
  holding: true,
  holdElapsed: 0,
  finished: false,
  currentStopId: preparedLegs.length > 0 ? 'start' : null
}

let skipHold = false

{
  const startLeg = preparedLegs[0]
  if (startLeg && startLeg.samples.length > 0) {
    const pose = sampleAt(startLeg, 0)
    applyPose(pose.x, SHIP_ROUTE.y, pose.z, pose.tx, pose.tz, true)
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
  const pose = sampleAt(leg, u * leg.length)
  applyPose(pose.x, SHIP_ROUTE.y, pose.z, pose.tx, pose.tz, true)

  if (state.elapsed >= leg.duration) {
    const end = sampleAt(leg, leg.length)
    applyPose(end.x, SHIP_ROUTE.y, end.z, end.tx, end.tz, true)
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
  const end = sampleAt(leg, leg.length)
  applyPose(end.x, SHIP_ROUTE.y, end.z, end.tx, end.tz, false)
}
