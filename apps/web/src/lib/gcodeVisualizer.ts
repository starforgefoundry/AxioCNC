import colornames from 'colornames'
import Toolpath from 'gcode-toolpath'
import { BufferGeometry, BufferAttribute, Vector3, Color, ArcCurve } from 'three'

// Color definitions matching legacy implementation
const defaultColor = new Color(colornames('lightgrey') as string)
const motionColor = {
  'G0': new Color(colornames('green') as string),
  'G1': new Color(colornames('blue') as string),
  'G2': new Color(colornames('deepskyblue') as string),
  'G3': new Color(colornames('deepskyblue') as string)
}

// Minimum squared distance between consecutive vertices (mm²).
// Vertices closer than this are skipped during visualization to avoid
// creating huge geometry for files with tiny XY movements (e.g. continuous
// A-axis rotation programs where XYZ barely changes between lines).
// 0.1mm is sub-pixel at typical CNC visualization zoom levels.
const MIN_DISTANCE_SQ = 0.1 * 0.1

export interface GCodeFrame {
  data: string
  vertexIndex: number
}

export interface GCodeGeometryResult {
  geometry: BufferGeometry
  frames: GCodeFrame[]
  boundingBox?: {
    min: Vector3
    max: Vector3
  }
  firstVertex?: Vector3 // First vertex position for offset calculations
}

// Simple cache for processGCode to avoid redundant parsing of the same G-code
let _cachedGcodeInput: string | null = null
let _cachedGcodeResult: GCodeGeometryResult | null = null

/**
 * Shared parsing logic used by both sync and async code paths.
 * Creates a Toolpath instance with addLine/addArcCurve callbacks that apply
 * vertex decimation - skipping vertices within MIN_DISTANCE_SQ of the previous one.
 *
 * Returns the toolpath interpreter and the arrays it populates.
 */
function createDecimatedToolpath() {
  const positions: number[] = []
  const colors: number[] = []
  const frames: GCodeFrame[] = []
  let initialPosition: Vector3 | undefined = undefined

  // Decimation state - tracks the last emitted vertex for distance checks
  let lastX = NaN
  let lastY = NaN
  let lastZ = NaN
  let lastMotion: string | undefined = undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolpath: any = new (Toolpath as any)({
    // Called for each line segment (G0, G1 moves)
    addLine: (modal: { motion?: string }, v1: { x: number; y: number; z: number }, v2: { x: number; y: number; z: number }) => {
      const { motion } = modal
      const color = motion ? (motionColor[motion as keyof typeof motionColor] || defaultColor) : defaultColor

      // Capture the initial position from the first move's start point (v1)
      if (initialPosition === undefined) {
        initialPosition = new Vector3(v1.x, v1.y, v1.z)
      }

      // Vertex decimation: skip points too close to the previous vertex.
      // Always keep vertex when motion type changes (G0↔G1 transitions)
      // to preserve color boundaries in the polyline.
      const dx = v2.x - lastX
      const dy = v2.y - lastY
      const dz = v2.z - lastZ
      const distSq = dx * dx + dy * dy + dz * dz

      if (distSq < MIN_DISTANCE_SQ && motion === lastMotion) {
        return
      }

      lastX = v2.x
      lastY = v2.y
      lastZ = v2.z
      lastMotion = motion

      positions.push(v2.x, v2.y, v2.z)
      colors.push(color.r, color.g, color.b)
    },

    // Called for each arc curve (G2, G3 moves)
    addArcCurve: (
      modal: { motion?: string; plane?: string },
      v1: { x: number; y: number; z: number },
      v2: { x: number; y: number; z: number },
      v0: { x: number; y: number; z: number }
    ) => {
      const { motion, plane } = modal

      // Capture the initial position from the first arc's start point (v1) if not already set
      if (initialPosition === undefined) {
        initialPosition = new Vector3(v1.x, v1.y, v1.z)
      }
      const isClockwise = motion === 'G2'
      const radius = Math.sqrt(
        ((v1.x - v0.x) ** 2) + ((v1.y - v0.y) ** 2)
      )
      const startAngle = Math.atan2(v1.y - v0.y, v1.x - v0.x)
      let endAngle = Math.atan2(v2.y - v0.y, v2.x - v0.x)

      // Draw full circle if startAngle and endAngle are both zero
      if (startAngle === endAngle) {
        endAngle += (2 * Math.PI)
      }

      const arcCurve = new ArcCurve(
        v0.x, // aX
        v0.y, // aY
        radius, // aRadius
        startAngle, // aStartAngle
        endAngle, // aEndAngle
        isClockwise // isClockwise
      )
      const divisions = 30
      const points = arcCurve.getPoints(divisions)
      const color = motion ? (motionColor[motion as keyof typeof motionColor] || defaultColor) : defaultColor

      for (let i = 0; i < points.length; ++i) {
        const point = points[i]
        const z = v1.z + ((v2.z - v1.z) / points.length) * i

        let px: number, py: number, pz: number
        if (plane === 'G17') { // XY-plane
          px = point.x; py = point.y; pz = z
        } else if (plane === 'G18') { // ZX-plane
          px = point.y; py = z; pz = point.x
        } else if (plane === 'G19') { // YZ-plane
          px = z; py = point.x; pz = point.y
        } else {
          px = point.x; py = point.y; pz = z
        }

        // Apply decimation to arc points too, but always keep the last
        // point of each arc for continuity with the next segment
        const isLast = (i === points.length - 1)
        if (!isLast) {
          const adx = px - lastX
          const ady = py - lastY
          const adz = pz - lastZ
          if (adx * adx + ady * ady + adz * adz < MIN_DISTANCE_SQ) {
            continue
          }
        }

        lastX = px
        lastY = py
        lastZ = pz

        positions.push(px, py, pz)
        colors.push(color.r, color.g, color.b)
      }

      lastMotion = motion
    }
  })

  return { toolpath, positions, colors, frames, getInitialPosition: () => initialPosition }
}

/**
 * Build a GCodeGeometryResult from raw position/color/frame arrays.
 */
function buildGeometryResult(
  positions: number[],
  colors: number[],
  frames: GCodeFrame[],
  initialPosition: Vector3 | undefined
): GCodeGeometryResult {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  geometry.computeBoundingBox()

  let boundingBox: { min: Vector3; max: Vector3 } | undefined
  if (geometry.boundingBox) {
    boundingBox = {
      min: geometry.boundingBox.min.clone(),
      max: geometry.boundingBox.max.clone()
    }
  } else if (positions.length > 0) {
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i])
      maxX = Math.max(maxX, positions[i])
      minY = Math.min(minY, positions[i + 1])
      maxY = Math.max(maxY, positions[i + 1])
      minZ = Math.min(minZ, positions[i + 2])
      maxZ = Math.max(maxZ, positions[i + 2])
    }
    boundingBox = {
      min: new Vector3(minX, minY, minZ),
      max: new Vector3(maxX, maxY, maxZ)
    }
  }

  return {
    geometry,
    frames,
    boundingBox,
    firstVertex: initialPosition
  }
}

/**
 * Process G-code string synchronously and generate Three.js BufferGeometry.
 * Results are cached - repeated calls with the same gcode string return the cached result.
 * Applies vertex decimation to skip near-identical vertices.
 *
 * @param gcode - G-code string to process
 * @returns Geometry data with frames for animation/stepping through the toolpath
 */
export function processGCode(gcode: string | null | undefined): GCodeGeometryResult | null {
  if (!gcode) {
    return null
  }

  // Return cached result if input hasn't changed
  if (gcode === _cachedGcodeInput && _cachedGcodeResult) {
    return _cachedGcodeResult
  }

  const { toolpath, positions, colors, frames, getInitialPosition } = createDecimatedToolpath()

  // Process G-code synchronously
  if (toolpath && typeof (toolpath as { loadFromStringSync?: (gcode: string, callback: (line: string) => void) => void }).loadFromStringSync === 'function') {
    (toolpath as { loadFromStringSync: (gcode: string, callback: (line: string) => void) => void }).loadFromStringSync(gcode, (line: string) => {
      frames.push({
        data: line,
        vertexIndex: Math.floor(positions.length / 3)
      })
    })
  }

  const result = buildGeometryResult(positions, colors, frames, getInitialPosition())

  // Cache the result
  _cachedGcodeInput = gcode
  _cachedGcodeResult = result

  return result
}

// Number of G-code lines to process per chunk before yielding to the UI thread.
// Targets ~16ms per chunk (one frame at 60fps) to keep the UI responsive.
// At ~15μs per line (parse + interpret), 1000 lines ≈ 15ms.
const ASYNC_CHUNK_SIZE = 1000

/**
 * Process G-code asynchronously in chunks, yielding to the UI thread between
 * chunks so the loading spinner stays animated and the browser remains responsive.
 *
 * Populates the same cache as processGCode, so subsequent sync calls return
 * the cached result instantly.
 *
 * @param gcode - G-code string to process
 * @param signal - Optional AbortSignal to cancel processing early
 * @returns Geometry data, or null if cancelled / empty input
 */
export async function processGCodeAsync(
  gcode: string | null | undefined,
  signal?: AbortSignal
): Promise<GCodeGeometryResult | null> {
  if (!gcode) {
    return null
  }

  // Return cached result if input hasn't changed
  if (gcode === _cachedGcodeInput && _cachedGcodeResult) {
    return _cachedGcodeResult
  }

  const { toolpath, positions, colors, frames, getInitialPosition } = createDecimatedToolpath()

  if (!toolpath || typeof (toolpath as { loadFromStringSync?: unknown }).loadFromStringSync !== 'function') {
    return null
  }

  const typedToolpath = toolpath as { loadFromStringSync: (gcode: string, callback: (line: string) => void) => void }

  // Split into lines and process in chunks
  const lines = gcode.split('\n')
  const totalLines = lines.length

  for (let start = 0; start < totalLines; start += ASYNC_CHUNK_SIZE) {
    // Check for cancellation between chunks
    if (signal?.aborted) {
      return null
    }

    // If the sync path populated the cache while we were yielding, use it
    if (gcode === _cachedGcodeInput && _cachedGcodeResult) {
      return _cachedGcodeResult
    }

    const end = Math.min(start + ASYNC_CHUNK_SIZE, totalLines)
    const chunk = lines.slice(start, end).join('\n')

    typedToolpath.loadFromStringSync(chunk, (line: string) => {
      frames.push({
        data: line,
        vertexIndex: Math.floor(positions.length / 3)
      })
    })

    // Yield to UI thread between chunks (skip yield for the last chunk)
    if (end < totalLines) {
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    }
  }

  // Final cancellation check
  if (signal?.aborted) {
    return null
  }

  const result = buildGeometryResult(positions, colors, frames, getInitialPosition())

  // Cache the result
  _cachedGcodeInput = gcode
  _cachedGcodeResult = result

  return result
}
