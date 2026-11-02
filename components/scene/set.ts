import * as THREE from 'three'
import type { PropsId, TableId } from '@/lib/types'

// The set the plate is photographed on: the light it is photographed in, the surface it stands on, and the things that
// lie beside it. Kept apart from the viewer for the same reason look.ts is: this is appearance, and it changes often.

export const TABLE_LABELS: Record<TableId, string> = {
  studio: 'Studio floor',
  oak: 'Oak table',
  marble: 'White marble',
  linen: 'Linen cloth',
  slate: 'Dark slate',
  concrete: 'Concrete',
}

export const PROPS_LABELS: Record<PropsId, string> = {
  none: 'No props',
  cutlery: 'Cutlery',
  napkin: 'Napkin',
  both: 'Cutlery and napkin',
}

// --- The light --------------------------------------------------------------------------------------------------------

/**
 * A photographer's studio, as something to reflect: a dark room with a large softbox up and to one side, a thin strip
 * light behind, a white card to fill from the front, an overhead panel, and a warm bounce off the table. This is what
 * puts a window-shaped highlight on a glazed plate and on a sauce, which is most of what makes them look wet and real.
 * (The room probe used before lit everything evenly, so nothing ever had a highlight with a shape.)
 */
export function studioEnvironment(): THREE.Scene {
  const env = new THREE.Scene()
  const room = new THREE.Mesh(new THREE.BoxGeometry(24, 12, 24), new THREE.MeshBasicMaterial({ color: 0x23201d, side: THREE.BackSide }))
  room.position.y = 5
  env.add(room)

  const panel = (width: number, height: number, power: number, color: number, at: [number, number, number]) => {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide })
    material.toneMapped = false
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
    mesh.position.set(...at)
    mesh.lookAt(0, 0.5, 0)
    env.add(mesh)
  }
  panel(7, 5, 9, 0xfff3e0, [-6, 6.5, -2]) // the main softbox, high, to the left and a little behind
  panel(1.4, 6, 14, 0xffffff, [5.5, 4, -7]) // a strip light behind and to the right, for an edge on everything
  panel(5, 3, 2.2, 0xe8eeff, [3, 2.2, 8]) // a white card in front, to open the shadows
  panel(6, 6, 3.5, 0xffffff, [0, 10.5, 0]) // an overhead panel
  panel(10, 10, 0.9, 0xd9b48a, [0, -0.6, 0]) // the table, bouncing warm light back up
  return env
}

// --- The surface ------------------------------------------------------------------------------------------------------

function hash(x: number, y: number, seed: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

// Value noise that repeats every `period` cells, so a texture tiles without a seam.
function tile(x: number, y: number, period: number, seed: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const wrap = (n: number) => ((n % period) + period) % period
  const a = hash(wrap(xi), wrap(yi), seed)
  const b = hash(wrap(xi + 1), wrap(yi), seed)
  const c = hash(wrap(xi), wrap(yi + 1), seed)
  const d = hash(wrap(xi + 1), wrap(yi + 1), seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(x: number, y: number, period: number, seed: number, octaves = 4) {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let p = period
  for (let i = 0; i < octaves; i++) {
    sum += tile(x * (p / period), y * (p / period), p, seed + i * 13) * amp
    norm += amp
    p *= 2
    amp *= 0.5
  }
  return sum / norm
}

const SIZE = 512
const mixc = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

type Painter = (u: number, v: number) => number[]

// Each painter gives a colour for a point on a tile (u, v in 0..1), and every one of them tiles.
const PAINT: Partial<Record<TableId, Painter>> = {
  oak(u, v) {
    // Four planks side by side, each its own shade, with grain running along them.
    const plank = Math.floor(v * 4)
    const shade = 0.82 + hash(plank, 0, 5) * 0.3
    const along = fbm(u * 3, v * 4 * 14, 12, 7 + plank, 3)
    const ring = Math.sin((fbm(u * 2, v * 4 * 5, 8, 11 + plank, 3) * 6 + v * 4 * 9) * Math.PI) * 0.5 + 0.5
    let c = mixc([112, 76, 46], [158, 112, 70], along)
    c = mixc(c, [92, 58, 34], ring * 0.35)
    const seam = Math.abs(((v * 4) % 1) - 0.5) > 0.488 ? 0.45 : 1
    return [c[0] * shade * seam, c[1] * shade * seam, c[2] * shade * seam]
  },
  marble(u, v) {
    // White stone with a few long, soft grey veins, bent by a second noise so they wander.
    const warp = fbm(u * 3, v * 3, 3, 3, 3) * 1.4
    const vein1 = Math.abs(fbm(u * 2 + warp, v * 2 + warp * 0.6, 4, 9, 4) - 0.5)
    const vein2 = Math.abs(fbm(u * 4 + warp * 0.5, v * 4 - warp, 8, 21, 3) - 0.5)
    let c = [243, 241, 237]
    // Fine veins, soft at the edges: marble is mostly white, and the veins are what is left over.
    c = mixc(c, [150, 153, 162], Math.pow(Math.max(0, 1 - vein1 / 0.011), 1.6) * 0.62)
    c = mixc(c, [196, 198, 206], Math.pow(Math.max(0, 1 - vein2 / 0.009), 1.4) * 0.45)
    const cloud = fbm(u * 3, v * 3, 3, 33, 3)
    return [c[0] - cloud * 10, c[1] - cloud * 10, c[2] - cloud * 9]
  },
  linen(u, v) {
    // A woven cloth: a fine over-and-under grid of threads, uneven in thickness.
    const warpThread = Math.sin(u * 160 * Math.PI) * 0.5 + 0.5
    const weftThread = Math.sin(v * 160 * Math.PI) * 0.5 + 0.5
    const over = (Math.floor(u * 80) + Math.floor(v * 80)) % 2 === 0
    const t = over ? warpThread : weftThread
    const slub = fbm(u * 8, v * 8, 8, 5, 3)
    const base = mixc([205, 192, 170], [233, 223, 204], slub)
    const k = 0.91 + t * 0.1
    return [base[0] * k, base[1] * k, base[2] * k]
  },
  slate(u, v) {
    const m = fbm(u * 4, v * 4, 4, 2, 5)
    const fleck = hash(Math.floor(u * 256), Math.floor(v * 256), 6) > 0.985 ? 22 : 0
    const c = mixc([38, 40, 44], [66, 68, 74], m)
    return [c[0] + fleck, c[1] + fleck, c[2] + fleck]
  },
  concrete(u, v) {
    // Cloudy, uneven grey, with small air holes where the pour trapped bubbles: irregular, and in clusters, not a grid.
    const m = fbm(u * 3, v * 3, 3, 4, 5)
    const cloud = fbm(u * 12, v * 12, 12, 21, 3)
    const holes = fbm(u * 64, v * 64, 64, 9, 2)
    const t = Math.max(0, Math.min(1, (holes - 0.7) / 0.12))
    const pit = -22 * t * t * (0.4 + cloud)
    const c = mixc([118, 117, 114], [158, 156, 152], m * 0.7 + cloud * 0.3)
    return [c[0] + pit, c[1] + pit, c[2] + pit]
  },
}

const TABLE_FEEL: Record<Exclude<TableId, 'studio'>, { roughness: number; metalness?: number; tileSize: number; clearcoat?: number }> = {
  oak: { roughness: 0.55, tileSize: 5.5, clearcoat: 0.15 },
  marble: { roughness: 0.14, tileSize: 8, clearcoat: 0.5 },
  linen: { roughness: 0.96, tileSize: 2.4 },
  slate: { roughness: 0.62, tileSize: 5 },
  concrete: { roughness: 0.88, tileSize: 6 },
}

const cache = new Map<TableId, THREE.CanvasTexture>()

/** The surface texture for a table, painted once and kept. */
export function tableTexture(kind: Exclude<TableId, 'studio'>): THREE.CanvasTexture {
  const hit = cache.get(kind)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(SIZE, SIZE)
  const paint = PAINT[kind]!
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b] = paint(x / SIZE, y / SIZE)
      const i = (y * SIZE + x) * 4
      image.data[i] = Math.max(0, Math.min(255, r))
      image.data[i + 1] = Math.max(0, Math.min(255, g))
      image.data[i + 2] = Math.max(0, Math.min(255, b))
      image.data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  // The table is a disc 48 units across; each tile covers `tileSize` of them.
  texture.repeat.set(48 / TABLE_FEEL[kind].tileSize, 48 / TABLE_FEEL[kind].tileSize)
  cache.set(kind, texture)
  return texture
}

/** Dresses the table's material as a surface. `studio` is the plain floor the editor always had; its colour follows the theme. */
export function dressTable(material: THREE.MeshPhysicalMaterial, kind: TableId, plain: { color: number; envMapIntensity: number }) {
  if (kind === 'studio') {
    material.map = null
    material.bumpMap = null
    material.color.set(plain.color)
    material.roughness = 0.95
    material.clearcoat = 0
    material.envMapIntensity = plain.envMapIntensity
  } else {
    const feel = TABLE_FEEL[kind]
    const texture = tableTexture(kind)
    material.map = texture
    material.bumpMap = kind === 'linen' || kind === 'oak' || kind === 'concrete' ? texture : null
    material.bumpScale = kind === 'linen' ? 0.5 : 0.8
    material.color.set(0xffffff)
    material.roughness = feel.roughness
    material.clearcoat = feel.clearcoat ?? 0
    material.clearcoatRoughness = 0.25
    material.envMapIntensity = 0.7
  }
  material.needsUpdate = true
}

// --- Things beside the plate -----------------------------------------------------------------------------------------

function flat(shape: THREE.Shape, depth: number, bevel = 0.006): THREE.BufferGeometry {
  // Drawn in X (along) and Y (across), thickened along Z, then laid on the table: Z becomes up.
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 14 })
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

function knife(): THREE.Mesh {
  const s = new THREE.Shape()
  // Handle, then the blade, whose edge curves up to the tip and whose back is straight.
  s.moveTo(0, -0.034)
  s.lineTo(0.7, -0.034)
  s.lineTo(0.72, -0.05)
  s.quadraticCurveTo(1.15, -0.062, 1.5, 0.0)
  s.quadraticCurveTo(1.15, 0.05, 0.72, 0.05)
  s.lineTo(0.7, 0.034)
  s.lineTo(0, 0.034)
  s.quadraticCurveTo(-0.03, 0, 0, -0.034)
  return new THREE.Mesh(flat(s, 0.012, 0.004), metal())
}

function fork(): THREE.Group {
  const group = new THREE.Group()
  const handle = new THREE.Shape()
  handle.moveTo(0, -0.034)
  handle.lineTo(0.72, -0.03)
  handle.quadraticCurveTo(0.9, -0.03, 0.98, -0.085)
  handle.lineTo(1.2, -0.088)
  handle.lineTo(1.2, 0.088)
  handle.lineTo(0.98, 0.085)
  handle.quadraticCurveTo(0.9, 0.03, 0.72, 0.03)
  handle.lineTo(0, 0.034)
  handle.quadraticCurveTo(-0.03, 0, 0, -0.034)
  group.add(new THREE.Mesh(flat(handle, 0.012, 0.004), metal()))
  // Four tines, each a long thin rounded bar.
  for (let i = 0; i < 4; i++) {
    const y = -0.066 + i * 0.044
    const tine = new THREE.Shape()
    tine.moveTo(1.18, y - 0.014)
    tine.lineTo(1.5, y - 0.011)
    tine.quadraticCurveTo(1.53, y, 1.5, y + 0.011)
    tine.lineTo(1.18, y + 0.014)
    tine.lineTo(1.18, y - 0.014)
    group.add(new THREE.Mesh(flat(tine, 0.012, 0.003), metal()))
  }
  return group
}

function metal() {
  // Polished steel shows what is around it, and a dark room gives it nothing: it would read as black. A slightly brushed
  // finish and a lot of the soft light do what a real knife does in a bright kitchen.
  return new THREE.MeshPhysicalMaterial({ color: 0xf0f2f5, metalness: 0.9, roughness: 0.34, envMapIntensity: 2.4 })
}

function napkin(): THREE.Mesh {
  // A folded cloth: a slab with soft corners and a slightly puckered top, in the same linen as the table cloth.
  const s = new THREE.Shape()
  const w = 0.62
  const h = 0.78
  const r = 0.05
  s.moveTo(-w + r, -h)
  s.lineTo(w - r, -h)
  s.quadraticCurveTo(w, -h, w, -h + r)
  s.lineTo(w, h - r)
  s.quadraticCurveTo(w, h, w - r, h)
  s.lineTo(-w + r, h)
  s.quadraticCurveTo(-w, h, -w, h - r)
  s.lineTo(-w, -h + r)
  s.quadraticCurveTo(-w, -h, -w + r, -h)
  const geometry = flat(s, 0.035, 0.014)
  const pos = geometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, pos.getY(i) + (pos.getY(i) > 0.02 ? Math.sin(x * 9 + z * 5) * 0.004 + Math.sin(z * 13) * 0.003 : 0))
  }
  geometry.computeVertexNormals()
  const texture = tableTexture('linen')
  const map = texture.clone()
  map.needsUpdate = true
  map.repeat.set(2, 2)
  const material = new THREE.MeshPhysicalMaterial({ map, color: 0xfaf6ee, roughness: 0.96, sheen: 0.4, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffffff) })
  return new THREE.Mesh(geometry, material)
}

/**
 * The props for a plating, placed to either side of a plate `half` units from its middle to its side (1 for the round plate;
 * a bowl and a board are wider): the fork on the left, the knife on
 * the right, a folded napkin under the fork if there is one. None of them can be picked or dragged; they are scenery.
 */
export function buildProps(kind: PropsId, half = 1): THREE.Group {
  const group = new THREE.Group()
  // Everything is laid out for a plate of 1 and moved out by however much wider this one is.
  const out = Math.max(0, half - 1)
  const cutlery = kind === 'cutlery' || kind === 'both'
  const cloth = kind === 'napkin' || kind === 'both'
  let forkLift = 0
  if (cloth) {
    const n = napkin()
    n.position.set(-1.95 - out, 0, 0.12)
    n.rotation.y = 0.07
    group.add(n)
    forkLift = 0.045
  }
  if (cutlery) {
    const f = fork()
    // They are drawn along x with the handle at the origin. Turning a quarter about the vertical sends +x to -z: the
    // handle toward the diner and the tines and blade away from them, which is how they are laid.
    f.rotation.y = Math.PI / 2 + 0.04
    f.position.set((cloth ? -1.95 : -1.42) - out, forkLift, 0.95)
    group.add(f)
    const k = knife()
    k.rotation.y = Math.PI / 2 - 0.03
    k.position.set(1.42 + out, 0, 0.95)
    group.add(k)
  }
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  return group
}

/** Frees a props group's geometry and materials. */
export function disposeProps(group: THREE.Object3D) {
  group.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.geometry.dispose()
    const material = m.material as THREE.Material
    material.dispose()
  })
}
