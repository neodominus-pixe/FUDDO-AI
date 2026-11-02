import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { familyFor, type ShapeFamily } from '@/lib/shapes'

// Forms that have a hand-built model in public/models, swapped in for the procedural mesh once the plate is on
// screen. The procedural shape stays in the model the server builds, so a download, a snapshot taken before the
// file arrives and a missing file all still show a pizza.
//
// Each model is authored in metres, Y up, the lowest point at Y = 0 and centred on X and Z. `radius` and `crown`
// are what it is fitted by: the procedural forms are unit-sized, -1..1 across and -1..1 up, and that is the space the
// layout scales and seats toppings in. The crown is the crust's mean height around the ring, not its highest blister.
// `browning` turns the model's greyscale cooking colour (1 = raw, darker = more done) into what an oven actually does to
// dough: grey multiplied onto a beige dough reads as khaki and mud, where real crust goes gold, then brown, then char.
// The stops are chosen as they should look on screen and converted to linear, as `shade` does for the built shapes.
type Authored = { url: string; radius: number; crown: number; browning?: Array<[number, [number, number, number]]> }

const DOUGH_BROWNING: Authored['browning'] = [
  [0.55, [0.34, 0.21, 0.12]],
  [0.63, [0.58, 0.37, 0.2]],
  [0.72, [0.78, 0.55, 0.32]],
  [0.82, [0.9, 0.74, 0.52]],
  [0.92, [0.97, 0.91, 0.8]],
  [1, [1, 1, 1]],
]

const AUTHORED: Partial<Record<ShapeFamily, Authored>> = {
  // Built in Blender (docs/blender/pizza.blend): 30 cm across, crust 2.55 cm, deck 0.5 cm -- which puts the deck at
  // -0.61 in unit space, the level DECK_LEVEL.pizza seats the sauce and toppings at.
  pizza: { url: '/models/pizza.glb', radius: 0.15, crown: 0.0255, browning: DOUGH_BROWNING },
}

function browned(g: THREE.BufferGeometry, stops: NonNullable<Authored['browning']>) {
  const col = g.getAttribute('color')
  if (!col) return
  const out = new Float32Array(col.count * 3)
  for (let i = 0; i < col.count; i++) {
    const v = col.getX(i)
    let k = 1
    while (k < stops.length - 1 && stops[k][0] < v) k++
    const [v0, c0] = stops[k - 1]
    const [v1, c1] = stops[k]
    const f = Math.min(1, Math.max(0, (v - v0) / (v1 - v0)))
    for (let j = 0; j < 3; j++) out[i * 3 + j] = Math.pow(c0[j] + (c1[j] - c0[j]) * f, 2.2)
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3))
}

const cache = new Map<ShapeFamily, Promise<THREE.BufferGeometry | null>>()

// The models are Draco-compressed. The decoder is served from public/draco, copied from
// node_modules/three/examples/jsm/libs/draco/gltf: copy it again whenever three is upgraded, since the two must match.
// One decoder for every model, made on first use so nothing is fetched until a plate needs it.
let draco: DRACOLoader | null = null
function loader() {
  draco ??= new DRACOLoader().setDecoderPath('/draco/')
  return new GLTFLoader().setDRACOLoader(draco)
}

function geometryFor(form: ShapeFamily): Promise<THREE.BufferGeometry | null> {
  const hit = cache.get(form)
  if (hit) return hit
  const a = AUTHORED[form]
  if (!a) return Promise.resolve(null)
  const job = loader()
    .loadAsync(a.url)
    .then((gltf) => {
      let found: THREE.BufferGeometry | null = null
      gltf.scene.traverse((o) => {
        if (!found && (o as THREE.Mesh).isMesh) found = (o as THREE.Mesh).geometry
      })
      if (!found) return null
      const g = found as THREE.BufferGeometry
      // Into unit space: the rim at 1, the bottom at -1 and the crust at 1. applyMatrix4 carries the normals through
      // the non-uniform scale correctly.
      const s = 1 / a.radius
      const sy = 2 / a.crown
      g.applyMatrix4(new THREE.Matrix4().makeScale(s, sy, s).premultiply(new THREE.Matrix4().makeTranslation(0, -1, 0)))
      if (a.browning) browned(g, a.browning)
      g.computeBoundingBox()
      g.computeBoundingSphere()
      return g
    })
    // A file that is missing or broken leaves the procedural shape in place; it is not worth breaking the plate over.
    .catch(() => null)
  cache.set(form, job)
  return job
}

// What a mesh is: the builder writes its form into the node's extras. Models saved before it did fall back to the
// name, which the loader has turned spaces into underscores in.
function formOf(o: THREE.Object3D): ShapeFamily | null {
  const d = o.userData ?? {}
  if (typeof d.form === 'string') return d.form as ShapeFamily
  if (typeof d.key !== 'string' || typeof d.role !== 'string' || d.key === 'sauce') return null
  return familyFor(o.name.replace(/_/g, ' '), d.role)
}

// The glTF the builder writes: one buffer, carried as a base64 data URI (lib/engine/gltf/writer.ts).
type Gltf = {
  nodes: Array<{ mesh?: number; extras?: { form?: string } } & Record<string, unknown>>
  meshes: Array<{ primitives: Array<{ attributes: Record<string, number>; indices?: number; material?: number } & Record<string, unknown>> } & Record<string, unknown>>
  accessors: Array<{ bufferView?: number } & Record<string, unknown>>
  bufferViews: Array<{ buffer: number; byteOffset?: number; byteLength: number } & Record<string, unknown>>
  buffers: Array<{ byteLength: number; uri?: string }>
} & Record<string, unknown>

const DATA_URI = /^data:[^;]*;base64,/

function fromBase64(uri: string) {
  const s = atob(uri.replace(DATA_URI, ''))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

function toBase64(bytes: Uint8Array) {
  // In slices: String.fromCharCode over a whole model's bytes overflows the call stack.
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/**
 * The model as it is downloaded: the builder's glTF with the hand-built meshes written into it in place of the
 * procedural ones, the same swap the viewer makes on screen. Leaves the model as it was for anything that has no
 * hand-built mesh, or whose mesh could not be loaded.
 */
export async function withAuthored(source: object): Promise<object> {
  const gltf = structuredClone(source) as Gltf
  if (gltf.buffers?.length !== 1 || !gltf.buffers[0].uri || !DATA_URI.test(gltf.buffers[0].uri)) return source
  const forms = new Set<ShapeFamily>()
  for (const n of gltf.nodes) if (n.mesh !== undefined && n.extras?.form && AUTHORED[n.extras.form as ShapeFamily]) forms.add(n.extras.form as ShapeFamily)
  if (!forms.size) return source
  const geometries = new Map<ShapeFamily, THREE.BufferGeometry>()
  for (const form of forms) {
    const g = await geometryFor(form)
    if (g) geometries.set(form, g)
  }
  if (!geometries.size) return source

  const chunks: Uint8Array[] = [fromBase64(gltf.buffers[0].uri)]
  let offset = chunks[0].byteLength
  const push = (bytes: Uint8Array, target: number) => {
    const pad = (4 - (offset % 4)) % 4
    if (pad) {
      chunks.push(new Uint8Array(pad))
      offset += pad
    }
    chunks.push(bytes)
    gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target })
    offset += bytes.byteLength
    return gltf.bufferViews.length - 1
  }

  // One mesh per form and material, written in the same layout as the builder's own: float positions and normals,
  // 16-bit indices, and the browning as four normalised bytes.
  const written = new Map<string, number>()
  const meshFor = (form: ShapeFamily, g: THREE.BufferGeometry, material: number | undefined) => {
    const key = `${form}|${material}`
    const hit = written.get(key)
    if (hit !== undefined) return hit
    const pos = g.getAttribute('position')
    const nrm = g.getAttribute('normal')
    const col = g.getAttribute('color')
    const count = pos.count
    const positions = new Float32Array(count * 3)
    const normals = new Float32Array(count * 3)
    const colors = new Uint8Array(count * 4)
    for (let i = 0; i < count; i++) {
      positions.set([pos.getX(i), pos.getY(i), pos.getZ(i)], i * 3)
      normals.set([nrm.getX(i), nrm.getY(i), nrm.getZ(i)], i * 3)
      const c = col ? [col.getX(i), col.getY(i), col.getZ(i), col.itemSize > 3 ? col.getW(i) : 1] : [1, 1, 1, 1]
      colors.set(c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)), i * 4)
    }
    const index = g.getIndex()!
    const big = count > 0xffff
    const indices = big ? Uint32Array.from(index.array) : Uint16Array.from(index.array)
    const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute)
    const accessor = (view: number, componentType: number, n: number, type: string, extra: object = {}) =>
      gltf.accessors.push({ bufferView: view, componentType, count: n, type, ...extra }) - 1
    const attributes = {
      POSITION: accessor(push(new Uint8Array(positions.buffer), 34962), 5126, count, 'VEC3', { min: box.min.toArray(), max: box.max.toArray() }),
      NORMAL: accessor(push(new Uint8Array(normals.buffer), 34962), 5126, count, 'VEC3'),
      COLOR_0: accessor(push(colors, 34962), 5121, count, 'VEC4', { normalized: true }),
    }
    const indicesAt = accessor(push(new Uint8Array(indices.buffer), 34963), big ? 5125 : 5123, indices.length, 'SCALAR')
    const mesh = gltf.meshes.push({ name: form, primitives: [{ attributes, indices: indicesAt, ...(material !== undefined ? { material } : {}) }] }) - 1
    written.set(key, mesh)
    return mesh
  }

  for (const n of gltf.nodes) {
    const form = n.extras?.form as ShapeFamily | undefined
    const g = form && geometries.get(form)
    if (n.mesh === undefined || !form || !g) continue
    n.mesh = meshFor(form, g, gltf.meshes[n.mesh].primitives[0]?.material)
  }

  const all = new Uint8Array(offset)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.byteLength
  }
  return prune(gltf, all)
}

// Drops the meshes nothing stands on any more -- the procedural shapes that were replaced -- with their accessors and
// the bytes behind them, and renumbers what is left.
function prune(gltf: Gltf, bytes: Uint8Array): Gltf {
  const meshMap = new Map<number, number>()
  const meshes: Gltf['meshes'] = []
  for (const n of gltf.nodes) {
    if (n.mesh === undefined) continue
    if (!meshMap.has(n.mesh)) meshMap.set(n.mesh, meshes.push(gltf.meshes[n.mesh]) - 1)
    n.mesh = meshMap.get(n.mesh)
  }
  const accMap = new Map<number, number>()
  const accessors: Gltf['accessors'] = []
  const keep = (i: number) => {
    if (!accMap.has(i)) accMap.set(i, accessors.push(gltf.accessors[i]) - 1)
    return accMap.get(i)!
  }
  for (const m of meshes)
    for (const p of m.primitives) {
      for (const k of Object.keys(p.attributes)) p.attributes[k] = keep(p.attributes[k])
      if (p.indices !== undefined) p.indices = keep(p.indices)
    }
  const views: Gltf['bufferViews'] = []
  const chunks: Uint8Array[] = []
  let offset = 0
  const viewMap = new Map<number, number>()
  for (const a of accessors) {
    if (a.bufferView === undefined) continue
    if (!viewMap.has(a.bufferView)) {
      const v = gltf.bufferViews[a.bufferView]
      const start = v.byteOffset ?? 0
      chunks.push(bytes.subarray(start, start + v.byteLength))
      views.push({ ...v, byteOffset: offset })
      offset += v.byteLength
      const pad = (4 - (offset % 4)) % 4
      if (pad) {
        chunks.push(new Uint8Array(pad))
        offset += pad
      }
      viewMap.set(a.bufferView, views.length - 1)
    }
    a.bufferView = viewMap.get(a.bufferView)
  }
  const total = new Uint8Array(offset)
  let at = 0
  for (const c of chunks) {
    total.set(c, at)
    at += c.byteLength
  }
  return {
    ...gltf,
    meshes,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: offset, uri: `data:application/octet-stream;base64,${toBase64(total)}` }],
  }
}

/** Puts the hand-built models in place of the procedural meshes they stand for. Resolves once every swap is done. */
export async function swapAuthored(root: THREE.Object3D): Promise<void> {
  const wanted: Array<{ mesh: THREE.Mesh; form: ShapeFamily }> = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const form = formOf(m)
    if (form && AUTHORED[form]) wanted.push({ mesh: m, form })
  })
  await Promise.all(
    wanted.map(async ({ mesh, form }) => {
      const g = await geometryFor(form)
      if (!g) return
      mesh.geometry.dispose()
      mesh.geometry = g.clone()
      // The browning is in the vertex colours, multiplied into the piece's own colour.
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        ;(mat as THREE.MeshStandardMaterial).vertexColors = true
        mat.needsUpdate = true
      }
    }),
  )
}
