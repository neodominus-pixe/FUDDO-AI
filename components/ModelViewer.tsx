'use client'

import { useEffect, useRef, type KeyboardEvent } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { buildProps, disposeProps, dressTable, studioEnvironment } from './scene/set'
import { swapAuthored } from './scene/authored'
import { translucentFood, applyLighting, clearPhoto, disposePhotos, dress, loadPhoto, setPhoto, surfaceFor, toPhysical, type LightingPreset, type Lights } from './scene/look'
import type { TextureMap } from '@/lib/client/ingredient-textures'
import { normalizeIngredient } from '@/lib/ingredients'
import { hexToLinear, resolveHex } from '@/lib/palette'
import { MAX_STROKE_POINTS, pathLength, simplify, type Pt } from '@/lib/engine/layout/brush'
import { orient } from '@/lib/engine/layout'
import { clampToPlate, computePoses, elementHex, toFrame, type Pose, type ScenePoses } from '@/lib/scene/poses'
import { snapPoint, type Guide } from '@/lib/scene/snap'
import { strokeIndex, translateStroke } from '@/lib/scene/strokes'
import { SAUCE_KEY, type Dish, type PlatingSpec, type SceneStyle } from '@/lib/types'

const HIGHLIGHT = 0xff7a1a
const FRAME_MIN = 0.06
const FRAME_MAX = 0.94
const clampFrame = (n: number) => Math.min(FRAME_MAX, Math.max(FRAME_MIN, n))

export type CameraView = 'top' | 'three-quarter' | 'side'

/** A saved viewpoint: where the camera is and what it looks at. */
export type CameraPose = { position: [number, number, number]; target: [number, number, number] }

export type CameraCommand = { view?: CameraView; pose?: CameraPose; nonce: number }

/**
 * What the editor is working on. The model is built once for `baseline`; `live` is the spec as it stands now.
 * The viewer moves, turns, resizes and recolours the pieces already on screen to match `live`, so those edits
 * never rebuild the model, and a drag follows the pointer instead of waiting for the server.
 */
export type SceneSpecs = { dish: Dish; baseline: PlatingSpec; live: PlatingSpec }

// Fixed viewpoints, so it is always one click back to a known angle instead of
// hunting for it by orbiting.
const CAMERA: Record<CameraView, [number, number, number]> = {
  top: [0, 3.15, 0.001],
  'three-quarter': [1.9, 1.5, 2.3],
  side: [0, 0.62, 3.05],
}
const TARGET: [number, number, number] = [0, 0.16, 0]
// The distance the presets were authored at. Framing scales against it rather
// than replacing it, so a plate still looks the way it always did.
const BASE_DISTANCE = Math.hypot(...CAMERA['three-quarter'])

type Home = { pos: THREE.Vector3 }
type Target = { pos: THREE.Vector3; scale?: THREE.Vector3; quat?: THREE.Quaternion }


export default function ModelViewer({
  gltf,
  url,
  scene: specs = null,
  editable = false,
  transparent = false,
  plateRadius = 0.4,
  selection = [],
  locked = [],
  solo = null,
  turntable = false,
  snap = true,
  guides = false,
  brush = false,
  onStroke,
  lighting = 'studio',
  setting = null,
  textures = null,
  reframe = false,
  reframeView = 'three-quarter',
  zoom = 1,
  onReady,
  cameraCommand = null,
  snapshotCommand = null,
  onSnapshot,
  captureCommand = null,
  onMove,
  onSelect,
  onCapture,
}: {
  gltf?: object | null
  url?: string | null
  scene?: SceneSpecs | null
  editable?: boolean
  // Drops the backdrop and the table, leaving the food on a clear canvas with
  // only its shadow under it. The landing page's hero sits on the page's own
  // lighting and would otherwise show a grey disc where the table is.
  transparent?: boolean
  plateRadius?: number
  // The keys of the selected pieces; the last is the one the panels edit.
  selection?: string[]
  // Pieces that can be selected but not carried off.
  locked?: string[]
  // Shows one piece alone, which is how you check what it looks like without anything in front of it.
  solo?: string | null
  turntable?: boolean
  // Catches a dragged piece on the plate's axes, rings and the rows of the other pieces.
  snap?: boolean
  // Draws the plate's axes and rings all the time, not only while something is being dragged.
  guides?: boolean
  // Paint mode: a drag across the plate draws a stroke of sauce instead of moving food. Hold Alt to orbit meanwhile.
  brush?: boolean
  // A finished stroke, as points in frame coordinates (the same space the spec stores).
  onStroke?: (points: Array<[number, number]>) => void
  // How the plate is lit.
  lighting?: LightingPreset
  // What the plate stands on, what lies beside it, and whether the background is softly out of focus.
  setting?: SceneStyle | null
  // Photographic surfaces to wrap onto the food, by normalised ingredient name. Pieces without one keep their colour.
  textures?: TextureMap | null
  // Re-frame the camera on every new model, instead of only the first. For a viewer that is a camera, not a place to look around.
  reframe?: boolean
  // Where each re-framed model is looked at from. 'flat-top' is straight down with almost no perspective, so the picture's
  // edges are exactly the plating's own 0..1 frame (plate centre in the middle, plate radius as laid out).
  reframeView?: CameraView | 'flat-top'
  // How close the camera stands, as a fraction of the usual distance. Below 1 is closer.
  zoom?: number
  // Called once a newly loaded model is on screen with its photographs applied and a couple of frames drawn.
  onReady?: () => void
  // A nonce, so clicking the same preset twice still snaps back to it.
  cameraCommand?: CameraCommand | null
  // Bumping the nonce asks where the camera is now, for saving as a bookmark.
  snapshotCommand?: { nonce: number } | null
  onSnapshot?: (pose: CameraPose) => void
  // Bumping the nonce asks for a snapshot of whatever is on screen right now.
  captureCommand?: { nonce: number } | null
  // Reports a finished drag in frame coordinates -- the same space the 2D drag
  // writes -- so both editors feed one overrides map on the spec. `lift` is how
  // much higher than the plate the piece now stands, when it was set on another.
  onMove?: (moves: Array<{ key: string; x: number; y: number; lift?: number }>) => void
  // `additive` is true when shift (or ctrl/cmd) was held, which adds to or removes from the selection.
  onSelect?: (key: string | null, additive: boolean) => void
  onCapture?: (dataUrl: string) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const modelRef = useRef<THREE.Group | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  // The pieces of the loaded model, by element key. A piece is one node, except the sauce, which is many.
  const elementsRef = useRef<Map<string, THREE.Object3D[]>>(new Map())
  // Where the viewer is easing each node to. Dropped when it arrives.
  const targetsRef = useRef<Map<THREE.Object3D, Target>>(new Map())
  const lightsRef = useRef<Lights | null>(null)
  const lightingRef = useRef<LightingPreset>(lighting)
  const settingRef = useRef<SceneStyle | null>(setting)
  // Re-dress the table, set out the props, switch the focus effect: each is set by the effect that built the scene.
  const dressSceneRef = useRef<(() => void) | null>(null)
  const texturesRef = useRef<TextureMap | null>(textures)
  const reframeRef = useRef(reframe)
  const reframeViewRef = useRef(reframeView)
  const zoomRef = useRef(zoom)
  const onReadyRef = useRef(onReady)
  // Photographs still on their way to a piece, so "ready" can wait for them.
  const photoJobsRef = useRef<Array<Promise<unknown>>>([])
  const guideGroupRef = useRef<THREE.Group | null>(null)
  const staticGuidesRef = useRef<THREE.Group | null>(null)
  // Where this particular dish wants the camera, measured from the food once it
  // is loaded. Re-framing on every swap would yank the view out from under
  // anyone who had orbited it, so it is applied on the first model and whenever
  // a preset is clicked.
  const focusRef = useRef<{ target: [number, number, number]; distance: number }>({
    target: TARGET,
    distance: BASE_DISTANCE,
  })
  const framedRef = useRef(false)
  const controlsRef = useRef<OrbitControls | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const onCaptureRef = useRef(onCapture)
  const onSnapshotRef = useRef(onSnapshot)
  const turntableRef = useRef(turntable)
  const interactingRef = useRef(false)
  const draggingRef = useRef(false)

  const editableRef = useRef(editable)
  const radiusRef = useRef(plateRadius)
  const plateHalfRef = useRef(1)
  const onMoveRef = useRef(onMove)
  const onSelectRef = useRef(onSelect)
  const specsRef = useRef<SceneSpecs | null>(specs)
  const selectionRef = useRef<string[]>(selection)
  const lockedRef = useRef<Set<string>>(new Set(locked))
  const soloRef = useRef<string | null>(solo)
  const snapRef = useRef(snap)
  const brushRef = useRef(brush)
  const onStrokeRef = useRef(onStroke)
  // The baseline never changes while a model is on screen, so its poses are worked out once, not per frame.
  const baseCacheRef = useRef<{ spec: PlatingSpec; dish: Dish; poses: ScenePoses } | null>(null)

  // The render loop and pointer handlers read these "latest value" refs. They are refreshed right after every
  // render (never during one), which is as fresh as any of them can observe.
  useEffect(() => {
    onCaptureRef.current = onCapture
    onSnapshotRef.current = onSnapshot
    turntableRef.current = turntable
    editableRef.current = editable
    radiusRef.current = plateRadius
    onMoveRef.current = onMove
    onSelectRef.current = onSelect
    specsRef.current = specs
    selectionRef.current = selection
    lockedRef.current = new Set(locked)
    soloRef.current = solo
    snapRef.current = snap
    brushRef.current = brush
    onStrokeRef.current = onStroke
    lightingRef.current = lighting
    settingRef.current = setting
    texturesRef.current = textures
    reframeRef.current = reframe
    reframeViewRef.current = reframeView
    zoomRef.current = zoom
    onReadyRef.current = onReady
  })

  // Points the camera at this dish's focus, along a preset direction or along
  // whatever direction it is already looking from.
  function applyFocus(
    camera: THREE.PerspectiveCamera | null,
    controls: OrbitControls | null,
    view?: CameraView,
  ) {
    if (!camera || !controls) return
    const { target } = focusRef.current
    // Cutlery and a napkin sit well outside the plate, so a framing that only fits the plate would cut them off.
    const wide = settingRef.current?.props && settingRef.current.props !== 'none' ? 1.32 : 1
    const distance = focusRef.current.distance * zoomRef.current * wide
    const from = view ? CAMERA[view] : ([camera.position.x, camera.position.y, camera.position.z] as const)
    const dir = new THREE.Vector3(from[0], from[1], from[2]).sub(new THREE.Vector3(...target))
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0.001)
    camera.position.copy(new THREE.Vector3(...target).add(dir.normalize().multiplyScalar(distance)))
    controls.target.set(...target)
    controls.update()
  }

  // Every piece owns its materials, so recolouring or highlighting one never touches another that happened to
  // share the same colour in the file.
  function meshesOf(nodes: THREE.Object3D[]) {
    const out: THREE.Mesh[] = []
    for (const n of nodes) n.traverse((o) => (o as THREE.Mesh).isMesh && out.push(o as THREE.Mesh))
    return out
  }

  // What a piece is, from the dish: garnish takes a leafier finish than the rest.
  function computeRole(key: string) {
    const info = specsRef.current
    if (!info) return undefined
    const base = baseCacheRef.current?.spec === info.baseline ? baseCacheRef.current.poses : computePoses(info.dish, info.baseline)
    return base.meta.get(key)?.role
  }

  function computeName(key: string) {
    const info = specsRef.current
    if (!info) return undefined
    const base = baseCacheRef.current?.spec === info.baseline ? baseCacheRef.current.poses : computePoses(info.dish, info.baseline)
    return base.meta.get(key)?.name
  }

  // Wraps each piece's photograph onto it, once the photograph has arrived. A piece with none keeps its colour.
  function applyTextures() {
    const info = specsRef.current
    if (!info) return
    const maps = texturesRef.current
    const baseline = baseCacheRef.current?.spec === info.baseline ? baseCacheRef.current.poses : computePoses(info.dish, info.baseline)
    const sauceName = info.dish.components.find((c) => c.role === 'sauce')?.name
    for (const [key, nodes] of elementsRef.current) {
      const name = key === SAUCE_KEY || strokeIndex(key) !== null ? sauceName : baseline.meta.get(key)?.name
      const entry = name && maps ? maps[normalizeIngredient(name)] : undefined
      for (const m of meshesOf(nodes)) {
        // The fat on a steak is pale on purpose: the photograph of the meat would turn it brown again. A glass is
        // clear, and has no surface of its own for a photograph to be wrapped on.
        if (/[ _](fat|glass)$/.test(m.name) || m.userData.__translucent) continue
        if (!entry) {
          if (m.userData.__photoUrl) {
            clearPhoto(m)
            delete m.userData.__photoUrl
          }
          continue
        }
        if (m.userData.__photoUrl === entry.url) continue
        m.userData.__photoUrl = entry.url
        const base = m.userData.__base as [number, number, number] | undefined
        // A shell laid over a piece (its crust) is a hung child; it is a little darker than the body.
        const overlay = nodes.every((n) => n !== m)
        const job = loadPhoto(entry.url)
          .then((map) => {
            // The piece may have been replaced, or given another photograph, while this one was on its way.
            if (m.userData.__photoUrl === entry.url && base) setPhoto(m, map, base, overlay ? 0.72 : 1)
          })
          .catch(() => {
            if (m.userData.__photoUrl === entry.url) delete m.userData.__photoUrl
          })
        photoJobsRef.current.push(job)
      }
    }
  }

  function paintSelection(keys: string[]) {
    const chosen = new Set(keys)
    for (const [k, nodes] of elementsRef.current) {
      for (const m of meshesOf(nodes)) {
        const mat = m.material as THREE.MeshStandardMaterial
        if (!mat.emissive) continue
        if (chosen.has(k)) {
          mat.emissive.set(HIGHLIGHT)
          mat.emissiveIntensity = 0.2
        } else {
          mat.emissive.set(0x000000)
          mat.emissiveIntensity = 0
        }
      }
    }
  }

  // Solo: one piece alone. The plate stays, so it still reads as a serving.
  function applySolo(key: string | null) {
    for (const [k, nodes] of elementsRef.current) for (const n of nodes) n.visible = !key || k === key
  }

  // Where each piece should stand for a spec. `instant` snaps them there; otherwise they ease, which is what
  // keeps a rebuilt layout from looking like a jump. `except` is the piece the hand is holding.
  function applyPoses(spec: PlatingSpec, instant: boolean, except?: string, held?: { key: string; lift: number }) {
    const info = specsRef.current
    const elements = elementsRef.current
    if (!info || !elements.size) return
    const sp = computePoses(info.dish, spec)
    const cached = baseCacheRef.current
    const base =
      cached && cached.spec === info.baseline && cached.dish === info.dish
        ? cached.poses
        : computePoses(info.dish, info.baseline)
    baseCacheRef.current = { spec: info.baseline, dish: info.dish, poses: base }

    const place = (node: THREE.Object3D, t: Target) => {
      if (instant || node.userData.__held) {
        node.position.copy(t.pos)
        if (t.scale) node.scale.copy(t.scale)
        if (t.quat) node.quaternion.copy(t.quat)
        targetsRef.current.delete(node)
      } else targetsRef.current.set(node, t)
    }

    for (const [key, nodes] of elements) {
      if (key === except) continue
      if (key === SAUCE_KEY) {
        // The marks are posed one by one, in the order the model builder placed them; a drizzle is one more
        // node after them, carried by however far its middle has moved.
        if (nodes.length !== sp.sauceMarks.length + sp.strokes.length || sp.strokes.length !== base.strokes.length) continue
        sp.sauceMarks.forEach((m, i) => place(nodes[i], poseTarget(m, 0, false)))
        sp.strokes.forEach((at, i) => {
          const n = nodes[sp.sauceMarks.length + i]
          const was = base.strokes[i]
          const home = n.userData.__home as Home | undefined
          if (home && was) place(n, { pos: new THREE.Vector3(home.pos.x + at.x - was.x, home.pos.y, home.pos.z + at.z - was.z) })
        })
        continue
      }
      // A painted stroke is its own piece, carried by however far its middle has moved.
      const si = strokeIndex(key)
      if (si !== null) {
        const at = sp.brush.find((b) => b.index === si)
        const was = base.brush.find((b) => b.index === si)
        const home = nodes[0]?.userData.__home as Home | undefined
        if (at && was && home) place(nodes[0], { pos: new THREE.Vector3(home.pos.x + at.x - was.x, home.pos.y, home.pos.z + at.z - was.z) })
        continue
      }
      const pose = sp.poses.get(key)
      if (!pose || !nodes[0]) continue
      place(nodes[0], poseTarget(pose, held?.key === key ? held.lift : 0))
    }

    // Colour: what the piece renders in now, against what the model was built with.
    const tint = (key: string, ratio: [number, number, number]) => {
      for (const m of meshesOf(elements.get(key) ?? [])) {
        const base = m.userData.__base as [number, number, number] | undefined
        if (!base) continue
        ;(m.material as THREE.MeshStandardMaterial).color.setRGB(
          Math.min(1, base[0] * ratio[0]),
          Math.min(1, base[1] * ratio[1]),
          Math.min(1, base[2] * ratio[2]),
          THREE.LinearSRGBColorSpace,
        )
      }
    }
    const ratioOf = (to: string, from: string): [number, number, number] => {
      const a = hexToLinear(to)
      const b = hexToLinear(from)
      return [a[0] / Math.max(b[0], 1e-4), a[1] / Math.max(b[1], 1e-4), a[2] / Math.max(b[2], 1e-4)]
    }
    for (const [key, meta] of sp.meta) {
      const was = base.meta.get(key) ?? meta
      tint(key, ratioOf(elementHex(meta, spec, key), elementHex(was, info.baseline, key)))
    }
    const sauceName = info.dish.components.find((c) => c.role === 'sauce')?.name
    // A painted stroke is the same sauce, so it is recoloured with it.
    const sauceRatio = sauceName
      ? ratioOf(resolveHex(sauceName, 'sauce', spec.tweaks?.[SAUCE_KEY]?.c), resolveHex(sauceName, 'sauce', info.baseline.tweaks?.[SAUCE_KEY]?.c))
      : null
    if (sauceRatio) for (const key of elements.keys()) if (key === SAUCE_KEY || strokeIndex(key) !== null) tint(key, sauceRatio)
  }

  function poseTarget(pose: Pose, lift: number, turn = true): Target {
    return {
      pos: new THREE.Vector3(pose.x, pose.y + lift, pose.z),
      scale: new THREE.Vector3(pose.sx, pose.sy, pose.sz),
      // Sauce marks are built unturned, so they are left that way.
      quat: turn ? new THREE.Quaternion(...orient(pose.yaw, pose.tilt)) : undefined,
    }
  }

  // Lines drawn over the plate: a dragged piece's catch lines, and the optional always-on rings and axes.
  function drawGuides(group: THREE.Group, lines: Guide[], opacity: number) {
    for (const child of [...group.children]) {
      group.remove(child)
      const l = child as THREE.Line
      l.geometry.dispose()
      ;(l.material as THREE.Material).dispose()
    }
    const material = () =>
      new THREE.LineBasicMaterial({ color: HIGHLIGHT, transparent: true, opacity, depthTest: false })
    const y = 0.135
    for (const g of lines) {
      let line: THREE.Line
      if (g.kind === 'axis') {
        const pts = g.axis === 'x' ? [[g.at, y, -1.08], [g.at, y, 1.08]] : [[-1.08, y, g.at], [1.08, y, g.at]]
        line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p))), material())
      } else {
        const pts: THREE.Vector3[] = []
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * Math.PI * 2
          pts.push(new THREE.Vector3(Math.cos(a) * g.radius, y, Math.sin(a) * g.radius))
        }
        line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material())
      }
      line.renderOrder = 10
      group.add(line)
    }
  }

  // --- Scene, camera and controls: created once and kept across model swaps.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    sceneRef.current = scene

    // The viewer sits inside the page, so it has to change with the page: a
    // black void behind the plate looks like a hole punched in a light theme.
    // Both surfaces are read from the same CSS tokens the rest of the UI uses.
    // The plain floor follows the theme; every other surface keeps its own colour.
    let plainFloor = { color: 0x14110f, envMapIntensity: 0.12 }
    const themed = () => {
      if (transparent) return
      const styles = getComputedStyle(document.documentElement)
      const dark = document.documentElement.dataset.theme !== 'light'
      scene.background = new THREE.Color(styles.getPropertyValue('--sunken').trim() || '#0d0b0a')
      plainFloor = { color: dark ? 0x14110f : 0xe9e3db, envMapIntensity: dark ? 0.12 : 0.35 }
      dressSceneRef.current?.()
    }

    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100)
    camera.position.set(...CAMERA['three-quarter'])
    cameraRef.current = camera

    // preserveDrawingBuffer keeps the last frame readable, which is what makes
    // toDataURL work at all. Costs a little memory; nothing noticeable here.
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: transparent,
    })
    rendererRef.current = renderer
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    // Khronos "Neutral" tone mapping: it rolls off bright whites without shifting hue or draining saturation. The filmic
    // curve used before did the opposite -- it pulled a tomato towards salmon and red wine towards mauve, which is exactly
    // what a picture of food cannot afford. Exposure is set per lighting preset (see scene/look.ts).
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 0.92
    renderer.shadowMap.enabled = true
    // PCFSoftShadowMap was removed in three r18x and silently falls back to this.
    // Softness comes from light.shadow.radius below instead.
    renderer.shadowMap.type = THREE.PCFShadowMap
    host.appendChild(renderer.domElement)

    // An environment map is what makes glaze look like glaze: PBR materials need
    // something to reflect, and three point lights give them nothing.
    const pmrem = new THREE.PMREMGenerator(renderer)
    const studio = studioEnvironment()
    const envRT = pmrem.fromScene(studio, 0.035)
    studio.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      }
    })
    scene.environment = envRT.texture

    const hemi = new THREE.HemisphereLight(0xffffff, 0x2b2622, 0.45)
    scene.add(hemi)
    // Lit the way food is photographed: the key comes from behind and to one
    // side, so shadows fall towards the camera and every piece gets an edge of
    // its own. A key next to the lens -- which is where this one used to be --
    // fills in exactly the shadows that tell you a plate has any height to it.
    const key = new THREE.DirectionalLight(0xfff4e2, 2.3)
    key.position.set(-2.4, 3.3, -0.7)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = 0.5
    key.shadow.camera.far = 14
    key.shadow.camera.left = -2.4
    key.shadow.camera.right = 2.4
    key.shadow.camera.top = 2.4
    key.shadow.camera.bottom = -2.4
    key.shadow.bias = -0.0008
    key.shadow.normalBias = 0.012
    key.shadow.radius = 2.5
    scene.add(key)
    // Fill from the camera's side of the plate, cool and weak: enough to keep
    // the near face of the food readable without flattening the key.
    const fill = new THREE.DirectionalLight(0xdce6ff, 0.3)
    fill.position.set(2.4, 1.1, 2.7)
    scene.add(fill)
    const lights: Lights = { key, fill, hemi }
    lightsRef.current = lights
    applyLighting(lightingRef.current, scene, renderer, lights)

    // The plate needs something to stand on. Large enough that its edge never
    // enters frame, dark enough not to compete with the food.
    // envMapIntensity kept low in the dark theme: the room probe is bright, and
    // at full strength the table lights up pale grey against a near-black
    // interface. themed() re-tunes both this and the colour when the theme flips.
    const tableMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x14110f,
      roughness: 0.95,
      metalness: 0,
      envMapIntensity: 0.12,
    })
    dress(tableMaterial, 'table')
    // No table in transparent mode. A shadow catcher was tried and thrown out:
    // a slate board lying flat throws a slate-sized shadow, which reads as a
    // second board floating beside the first. The page puts a CSS drop-shadow
    // under the whole silhouette instead, which is right for any shape.
    if (!transparent) {
      const table = new THREE.Mesh(new THREE.CircleGeometry(24, 64), tableMaterial)
      table.rotation.x = -Math.PI / 2
      table.position.y = -0.012
      table.receiveShadow = true
      scene.add(table)
    }

    const targets = targetsRef.current
    const guideGroup = new THREE.Group()
    const staticGuides = new THREE.Group()
    scene.add(guideGroup, staticGuides)
    guideGroupRef.current = guideGroup
    staticGuidesRef.current = staticGuides

    themed()
    const themeWatch = new MutationObserver(themed)
    themeWatch.observe(document.documentElement, { attributeFilter: ['data-theme'] })

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 1.2
    controls.maxDistance = 7
    controls.maxPolarAngle = Math.PI * 0.48
    controls.target.set(...TARGET)
    controlsRef.current = controls

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const dragPlane = new THREE.Plane()
    const hit = new THREE.Vector3()
    const grab = new THREE.Vector2()
    // Everything that moves together in one drag: the piece under the pointer, and the rest of the selection if it
    // was part of it. `start` is where each stood when the press began, in scene units.
    type Drag = {
      key: string
      keys: string[]
      nodes: THREE.Object3D[]
      start: Map<string, { x: number; z: number }>
      x: number
      z: number
      lift: number
    }
    let dragging: Drag | null = null
    let pressed: { key: string; additive: boolean } | null = null
    let downAt: { x: number; y: number } | null = null
    let moved = 0

    // A stroke being painted: points on the plate in scene units, shown as a line until it is let go.
    let painting: { pts: Array<[number, number]>; plate: ScenePoses['plate']; shape: ScenePoses['shape'] } | null = null
    const paintLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.95, depthTest: false }),
    )
    paintLine.renderOrder = 12
    paintLine.frustumCulled = false
    paintLine.visible = false
    scene.add(paintLine)
    // Painted on a level just above the plate's face, whatever the vessel's shape.
    const brushPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.07)
    const showPaint = () => {
      if (!painting) return
      paintLine.geometry.setFromPoints(painting.pts.map(([x, z]) => new THREE.Vector3(x, 0.15, z)))
      paintLine.visible = painting.pts.length > 1
    }

    const setPointer = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
    }

    const draggableAt = (): string | null => {
      const model = modelRef.current
      if (!model) return null
      for (const h of raycaster.intersectObjects(model.children, true)) {
        // A piece hidden by solo mode is not there to be grabbed.
        if (!h.object.visible) continue
        for (let o: THREE.Object3D | null = h.object; o && o !== model; o = o.parent) {
          const k = o.userData?.key
          if (typeof k === 'string') return k
        }
      }
      return null
    }

    const release = (commit: boolean) => {
      if (!dragging) return
      const d = dragging
      dragging = null
      draggingRef.current = false
      for (const n of d.nodes) delete n.userData.__held
      controls.enabled = true
      renderer.domElement.style.cursor = ''
      drawGuides(guideGroup, [], 0)
      const info = specsRef.current
      if (commit && info) {
        const R = radiusRef.current
        const delta = { x: d.x - (d.start.get(d.key)?.x ?? d.x), z: d.z - (d.start.get(d.key)?.z ?? d.z) }
        const current = computePoses(info.dish, info.live)
        onMoveRef.current?.(
          d.keys.map((key) => {
            const from = d.start.get(key)
            const spot = key === d.key ? { x: d.x, z: d.z } : from ? place(current, from.x + delta.x, from.z + delta.z) : { x: d.x, z: d.z }
            return { key, x: clampFrame(toFrame(spot.x, R)), y: clampFrame(toFrame(spot.z, R)), lift: key === d.key && d.lift > 0.002 ? d.lift : undefined }
          }),
        )
      } else if (info) {
        applyPoses(info.live, false)
      }
    }

    // Keeps a point on the plate.
    const place = (poses: ReturnType<typeof computePoses>, x: number, z: number) => {
      const [px, pz] = clampToPlate(x, z, poses.plate, poses.shape)
      return { x: px, z: pz }
    }

    const onDown = (e: PointerEvent) => {
      // Any press pauses the turntable, including one that only orbits.
      interactingRef.current = true
      if (!editableRef.current || e.button !== 0) return
      downAt = { x: e.clientX, y: e.clientY }
      moved = 0
      setPointer(e)
      // Paint mode: the drag is a stroke of sauce, not a grab. Alt hands the drag back to the camera.
      if (brushRef.current && !e.altKey) {
        const start = specsRef.current
        if (start && raycaster.ray.intersectPlane(brushPlane, hit)) {
          e.stopPropagation()
          e.preventDefault()
          controls.enabled = false
          const here = computePoses(start.dish, start.live)
          const [px, pz] = clampToPlate(hit.x, hit.z, here.plate, here.shape)
          painting = { pts: [[px, pz]], plate: here.plate, shape: here.shape }
        }
        return
      }
      const key = draggableAt()
      const info = specsRef.current
      if (!key || !info) return
      const nodes = elementsRef.current.get(key) ?? []
      if (!nodes.length) return
      // Run before OrbitControls so grabbing food never spins the camera.
      e.stopPropagation()
      e.preventDefault()
      pressed = { key, additive: e.shiftKey || e.metaKey || e.ctrlKey }
      // A locked piece can be selected but not carried off.
      if (lockedRef.current.has(key)) return
      controls.enabled = false
      const live = computePoses(info.dish, info.live)
      const selection = selectionRef.current
      const keys = (selection.length > 1 && selection.includes(key) ? selection : [key]).filter(
        (k) => elementsRef.current.has(k) && !lockedRef.current.has(k),
      )
      const start = new Map<string, { x: number; z: number }>()
      const all: THREE.Object3D[] = []
      for (const k of keys) {
        const sk = strokeIndex(k)
        const at = k === SAUCE_KEY ? live.sauce : sk !== null ? live.brush.find((b) => b.index === sk) : live.poses.get(k)
        if (at) start.set(k, { x: at.x, z: at.z })
        for (const n of elementsRef.current.get(k) ?? []) {
          n.userData.__held = true
          all.push(n)
        }
      }
      const centre = start.get(key)
      const cx = centre?.x ?? nodes[0].position.x
      const cz = centre?.z ?? nodes[0].position.z
      const cy = live.poses.get(key)?.y ?? nodes[0].position.y
      dragging = { key, keys, nodes: all, start, x: cx, z: cz, lift: 0 }
      draggingRef.current = true
      dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, cy, 0))
      raycaster.ray.intersectPlane(dragPlane, hit)
      grab.set(cx - hit.x, cz - hit.z)
      renderer.domElement.style.cursor = 'grabbing'
    }

    const onMovePointer = (e: PointerEvent) => {
      if (!editableRef.current) return
      if (downAt) moved = Math.max(moved, Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y))
      setPointer(e)

      if (painting) {
        if (raycaster.ray.intersectPlane(brushPlane, hit)) {
          const [px, pz] = clampToPlate(hit.x, hit.z, painting.plate, painting.shape)
          const last = painting.pts[painting.pts.length - 1]
          // A new point only once the brush has really moved, so a slow hand does not pile points up.
          if (Math.hypot(px - last[0], pz - last[1]) > 0.025) {
            painting.pts.push([px, pz])
            showPaint()
          }
        }
        return
      }

      if (!dragging) {
        renderer.domElement.style.cursor = brushRef.current ? 'crosshair' : draggableAt() ? 'grab' : ''
        return
      }
      const info = specsRef.current
      if (!info || !raycaster.ray.intersectPlane(dragPlane, hit)) return
      const R = radiusRef.current
      const current = computePoses(info.dish, info.live)
      // Rim first, then snap: a catch line never pulls a piece off the plate, and a piece at the rim is never
      // pulled in by a line that is not there.
      const [cx, cz] = clampToPlate(hit.x + grab.x, hit.z + grab.y, current.plate, current.shape)
      const others: Array<{ x: number; z: number }> = []
      for (const [k, p] of current.poses) if (!dragging.keys.includes(k)) others.push({ x: p.x, z: p.z })
      const caught = snapPoint(cx, cz, { enabled: snapRef.current && !e.altKey, others })
      const [x, z] = clampToPlate(caught.x, caught.z, current.plate, current.shape)
      dragging.x = x
      dragging.z = z

      // The same spec the drop will write, so what is on screen is exactly what is saved. The rest of a group
      // moves by the same amount as the piece being held.
      const first = dragging.start.get(dragging.key)
      const dx = x - (first?.x ?? x)
      const dz = z - (first?.z ?? z)
      const overrides = { ...info.live.overrides }
      let brush = info.live.brush
      for (const k of dragging.keys) {
        const from = dragging.start.get(k)
        const spot = k === dragging.key || !from ? { x, z } : place(current, from.x + dx, from.z + dz)
        const sk = strokeIndex(k)
        // A painted stroke has no override: it is carried by moving its points. Frame units are scene units times the radius.
        if (sk !== null && from && brush) brush = translateStroke(brush, sk, (spot.x - from.x) * R, (spot.z - from.z) * R)
        else overrides[k] = { x: clampFrame(toFrame(spot.x, R)), y: clampFrame(toFrame(spot.z, R)) }
      }
      const preview: PlatingSpec = { ...info.live, overrides, brush }
      applyPoses(preview, false)

      // Set down on top of something? Rest on its highest point under the piece, instead of sinking into it.
      dragging.lift = 0
      const model = modelRef.current
      const pose = computePoses(info.dish, preview).poses.get(dragging.key)
      if (model && pose && dragging.keys.length === 1 && dragging.key !== SAUCE_KEY && strokeIndex(dragging.key) === null) {
        model.updateMatrixWorld(true)
        const under: THREE.Object3D[] = []
        for (const [k, nodes] of elementsRef.current) if (k !== dragging.key && k !== SAUCE_KEY) under.push(...nodes.filter((n) => n.visible))
        const ray = new THREE.Raycaster(new THREE.Vector3(pose.x, 8, pose.z), new THREE.Vector3(0, -1, 0))
        const top = ray.intersectObjects(under, true)[0]
        if (top) {
          const rests = top.point.y + pose.sy * 0.9
          if (rests > pose.y + 0.002) {
            dragging.lift = Math.min(3, rests - pose.y)
            for (const n of elementsRef.current.get(dragging.key) ?? []) n.position.y = pose.y + dragging.lift
          }
        }
      }
      drawGuides(guideGroup, caught.guides, 0.75)
    }

    const onUp = () => {
      interactingRef.current = false
      if (painting) {
        const done = painting
        painting = null
        paintLine.visible = false
        controls.enabled = true
        const R = radiusRef.current
        // A flick that goes nowhere is not a stroke. Otherwise it is smoothed down to its shape and handed over.
        if (done.pts.length >= 3 && pathLength(done.pts as Pt[]) > 0.15) {
          const kept = simplify(done.pts as Pt[], 0.012).slice(0, MAX_STROKE_POINTS)
          onStrokeRef.current?.(kept.map(([x, z]) => [Math.min(0.94, Math.max(0.06, toFrame(x, R))), Math.min(0.94, Math.max(0.06, toFrame(z, R)))] as [number, number]))
        }
        return
      }
      const wasClick = downAt !== null && moved < 4
      downAt = null
      const press = pressed
      pressed = null
      if (dragging) {
        // A press that never moved is a selection, not a drag.
        if (wasClick) {
          release(false)
          if (press) onSelectRef.current?.(press.key, press.additive)
        } else release(true)
        return
      }
      if (wasClick && press) {
        onSelectRef.current?.(press.key, press.additive)
        return
      }
      // Clicking bare plate or background clears the selection.
      if (wasClick && editableRef.current && !draggableAt()) onSelectRef.current?.(null, false)
    }

    const onKeyCancel = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && dragging) release(false)
    }

    renderer.domElement.addEventListener('pointerdown', onDown, { capture: true })
    window.addEventListener('pointermove', onMovePointer)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKeyCancel)

    // Ambient occlusion: the soft darkening where one thing meets another, which is most of what makes a render
    // read as lit objects rather than coloured shapes. Skipped on a transparent canvas, which it would flatten.
    let composer: EffectComposer | null = null
    let ao: GTAOPass | null = null
    if (!transparent) {
      try {
        const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 })
        composer = new EffectComposer(renderer, target)
        composer.addPass(new RenderPass(scene, camera))
        ao = new GTAOPass(scene, camera, 2, 2)
        ao.blendIntensity = 0.85
        ao.updateGtaoMaterial({ radius: 0.16, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false })
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 })
        composer.addPass(ao)
        composer.addPass(new OutputPass())
      } catch {
        composer = null
        ao = null
      }
    }

    // Depth of field: the far side of the table softly out of focus, the way a lens at a wide stop renders it. Off
    // unless the plating asks for it, because blur is a poor thing to edit through.
    let bokeh: BokehPass | null = null
    if (composer && ao) {
      try {
        bokeh = new BokehPass(scene, camera, { focus: 3.5, aperture: 0.0007, maxblur: 0.014 })
        bokeh.enabled = false
        composer.insertPass(bokeh, 2)
      } catch {
        bokeh = null
      }
    }

    // The set: the table's surface, the things beside the plate, and the focus effect, as the plating's scene style says.
    let propsGroup: THREE.Group | null = null
    let propsKind = 'none'
    dressSceneRef.current = () => {
      const style = settingRef.current
      dressTable(tableMaterial, style?.table ?? 'studio', plainFloor)
      const wanted = transparent ? 'none' : (style?.props ?? 'none')
      // The props stand off the plate's real edge, so a bowl or a board gets room and a plain plate stays as it was.
      const half = Math.round(plateHalfRef.current * 20) / 20
      const stamp = `${wanted}:${half}`
      if (stamp !== propsKind) {
        if (propsGroup) {
          scene.remove(propsGroup)
          disposeProps(propsGroup)
          propsGroup = null
        }
        propsKind = stamp
        if (wanted !== 'none') {
          propsGroup = buildProps(wanted, half)
          scene.add(propsGroup)
        }
      }
      if (bokeh) bokeh.enabled = !!style?.focus
    }
    dressSceneRef.current()

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (!w || !h) return
      renderer.setSize(w, h, false)
      composer?.setPixelRatio(renderer.getPixelRatio())
      composer?.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)

    // Scrolled out of sight is not a reason to keep a WebGL loop and a
    // turntable running: on the landing page the hero leaves the screen after a
    // flick of the wheel, and every frame after that is spent heating a laptop
    // and starving whatever the reader actually scrolled down to look at.
    let onScreen = true
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      last = performance.now()
    })
    visibility.observe(host)

    let frame = 0
    let last = performance.now()
    const spinAxis = new THREE.Vector3(0, 1, 0)
    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (!onScreen) return
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      // Orbit the camera about the plate, but never while a hand is on it.
      if (turntableRef.current && !interactingRef.current) {
        const offset = camera.position.clone().sub(controls.target)
        offset.applyAxisAngle(spinAxis, dt * 0.35)
        camera.position.copy(controls.target).add(offset)
      }
      // Ease pieces to where the spec says they belong.
      if (targetsRef.current.size) {
        const k = 1 - Math.exp(-dt * 16)
        for (const [node, t] of targetsRef.current) {
          node.position.lerp(t.pos, k)
          if (t.scale) node.scale.lerp(t.scale, k)
          if (t.quat) node.quaternion.slerp(t.quat, k)
          const close =
            node.position.distanceToSquared(t.pos) < 1e-8 &&
            (!t.scale || node.scale.distanceToSquared(t.scale) < 1e-8) &&
            (!t.quat || 1 - Math.abs(node.quaternion.dot(t.quat)) < 1e-8)
          if (close) {
            node.position.copy(t.pos)
            if (t.scale) node.scale.copy(t.scale)
            if (t.quat) node.quaternion.copy(t.quat)
            targetsRef.current.delete(node)
          }
        }
      }
      controls.update()
      if (bokeh?.enabled) (bokeh.uniforms as Record<string, { value: number }>).focus.value = camera.position.distanceTo(controls.target)
      if (composer) composer.render(dt)
      else renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      visibility.disconnect()
      themeWatch.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('pointermove', onMovePointer)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKeyCancel)
      controls.dispose()
      ao?.dispose()
      composer?.dispose()
      if (propsGroup) {
        scene.remove(propsGroup)
        disposeProps(propsGroup)
      }
      dressSceneRef.current = null
      envRT.texture.dispose()
      pmrem.dispose()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = m.material
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else if (mat) (mat as THREE.Material).dispose()
      })
      disposePhotos()
      renderer.dispose()
      rendererRef.current = null
      host.removeChild(renderer.domElement)
      sceneRef.current = null
      modelRef.current = null
      elementsRef.current = new Map()
      targets.clear()
      guideGroupRef.current = null
      staticGuidesRef.current = null
    }
    // `transparent` is a renderer construction option: the viewer is built once and not rebuilt if it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Model swap: replaces geometry only, leaving the camera where it was.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || (!gltf && !url)) return

    let cancelled = false
    const loader = new GLTFLoader()

    const swap = (loaded: { scene: THREE.Group }) => {
      if (cancelled) return
      const previous = modelRef.current
      if (previous) {
        scene.remove(previous)
        previous.traverse((o) => {
          const m = o as THREE.Mesh
          if (m.geometry) m.geometry.dispose()
          const mat = m.material
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
          else if (mat) (mat as THREE.Material).dispose()
        })
      }
      targetsRef.current.clear()
      loaded.scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        m.castShadow = true
        m.receiveShadow = true
      })

      // Index the pieces by key: a node that carries a key and has no keyed ancestor is a piece.
      const elements = new Map<string, THREE.Object3D[]>()
      loaded.scene.traverse((o) => {
        const k = o.userData?.key
        if (typeof k !== 'string') return
        for (let p = o.parent; p && p !== loaded.scene; p = p.parent) if (typeof p.userData?.key === 'string') return
        const list = elements.get(k) ?? []
        list.push(o)
        elements.set(k, list)
        o.userData.__home = { pos: o.position.clone() } satisfies Home
      })
      const plateStyle = specsRef.current?.baseline.plate
      for (const [key, nodes] of elements) {
        const pieces = meshesOf(nodes)
        // A drink is a liquid with a glass hung off it. The glass is clear; the liquid is wet, and treated as a sauce is.
        const inGlass = pieces.some((p) => /[ _]glass$/.test(p.name))
        for (const m of pieces) {
          const role = specsRef.current?.dish && key !== SAUCE_KEY ? computeRole(key) : undefined
          const mat = toPhysical(m.material as THREE.Material)
          const isGlass = /[ _]glass$/.test(m.name)
          const name = key === SAUCE_KEY ? specsRef.current?.dish.components.find((c) => c.role === 'sauce')?.name : computeName(key)
          const clear = !isGlass && !inGlass && translucentFood(name)
          if (clear) m.userData.__translucent = true
          if (isGlass) m.castShadow = false
          dress(mat, isGlass ? 'glass' : clear ? 'translucent' : inGlass ? 'sauce' : surfaceFor({ key, role, roughness: mat.roughness }))
          m.material = mat
          m.userData.__base = [mat.color.r, mat.color.g, mat.color.b]
        }
      }
      // The plate is not a piece, but it is made of something too.
      loaded.scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh || m.name !== 'plate') return
        const mat = toPhysical(m.material as THREE.Material)
        dress(mat, surfaceFor({ key: null, roughness: mat.roughness, plate: plateStyle, isPlate: true }), plateStyle)
        m.material = mat
      })
      // How wide the vessel is, so the cutlery and the napkin can stand beside it.
      const plateBox = new THREE.Box3()
      loaded.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.name === 'plate') plateBox.expandByObject(o)
      })
      if (!plateBox.isEmpty()) plateHalfRef.current = Math.max(1, (plateBox.max.x - plateBox.min.x) / 2)
      dressSceneRef.current?.()
      elementsRef.current = elements
      modelRef.current = loaded.scene
      scene.add(loaded.scene)
      paintSelection(selectionRef.current)
      applySolo(soloRef.current)
      applyTextures()
      // The model was built for the baseline; bring it to the spec as it stands now.
      const info = specsRef.current
      if (info) applyPoses(info.live, true)

      // Framed on the whole serving, plate included. Fitting to the food alone
      // was worse than the fixed distance it replaced: it zoomed into a portion
      // of penne until the bowl around it filled the frame. The vessel is part
      // of the picture -- a bowl of pasta is judged partly on how full it looks.
      const box = new THREE.Box3().setFromObject(loaded.scene)
      const camera = cameraRef.current
      if (!box.isEmpty() && camera) {
        const size = box.getSize(new THREE.Vector3())
        // Height counts for more than width: a tall stack seen from a low angle
        // needs the room, and it is what runs out of frame first.
        const span = Math.max(size.x, size.z, size.y * 1.9)
        const fitted = (span * 0.5) / Math.tan((camera.fov * Math.PI) / 360) * 1.16
        focusRef.current = {
          // Lifted towards the middle of the build so a burger is not sitting on
          // the bottom edge of the frame with empty space above it.
          target: [0, Math.min(0.5, TARGET[1] + size.y * 0.22), 0],
          // Bounded hard either side of the authored distance: this is a nudge
          // to fit the dish, not a free camera.
          distance: Math.min(BASE_DISTANCE * 1.08, Math.max(BASE_DISTANCE * 0.82, fitted)),
        }
        if (reframeRef.current) {
          const mode = reframeViewRef.current
          const controls = controlsRef.current
          if (mode === 'flat-top' && controls) {
            // A long lens from far above: the plate's far edge and near edge are the same size, as in a flat lay.
            camera.fov = 5
            camera.far = 200
            camera.updateProjectionMatrix()
            const half = 0.5 / Math.max(0.05, radiusRef.current)
            const distance = half / Math.tan((camera.fov * Math.PI) / 360)
            controls.maxDistance = Math.max(7, distance + 2)
            camera.position.set(0, distance, 0.0001)
            controls.target.set(0, 0, 0)
            controls.update()
          } else {
            if (camera.fov !== 38) {
              camera.fov = 38
              camera.updateProjectionMatrix()
            }
            applyFocus(camera, controls, mode === 'flat-top' ? 'top' : mode)
          }
        }
        else if (!framedRef.current) {
          framedRef.current = true
          applyFocus(camera, controlsRef.current)
        }
      }

      // Announce the model once its photographs are on it and two frames have been drawn from it.
      const jobs = photoJobsRef.current.splice(0)
      const announce = onReadyRef.current
      if (announce) {
        void Promise.allSettled(jobs).then(() =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (!cancelled) announce()
            }),
          ),
        )
      }
    }

    // The hand-built models go in before the plate is shown, so it never appears with the stand-in and then changes.
    const place = (loaded: { scene: THREE.Group }) => void swapAuthored(loaded.scene).then(() => swap(loaded))
    if (gltf) loader.parse(JSON.stringify(gltf), '', place, () => {})
    else if (url) loader.load(url, place, undefined, () => {})

    return () => {
      cancelled = true
    }
    // applyPoses / paintSelection read the latest values from refs, so the model is only rebuilt for a new model.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf, url])

  // --- The spec changed but the model did not: ease the pieces to where it now puts them.
  useEffect(() => {
    if (!specs || draggingRef.current) return
    applyPoses(specs.live, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specs?.live, specs?.dish])

  useEffect(() => {
    paintSelection(selection)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.join('|')])

  useEffect(() => {
    applySolo(solo)
  }, [solo])

  // New photographs arrived, or went away.
  useEffect(() => {
    applyTextures()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textures])

  // The table, the props or the focus effect changed.
  useEffect(() => {
    dressSceneRef.current?.()
  }, [setting?.table, setting?.props, setting?.focus])

  // Cutlery and a napkin need room: pull the camera back when they appear, and in when they go, along the way it looks now.
  const propsOn = !!setting?.props && setting.props !== 'none'
  const propsWereOn = useRef(propsOn)
  useEffect(() => {
    if (propsWereOn.current === propsOn) return
    propsWereOn.current = propsOn
    if (reframeViewRef.current === 'flat-top') return
    applyFocus(cameraRef.current, controlsRef.current)
  }, [propsOn])

  // Re-light the plate when the preset changes.
  useEffect(() => {
    const scene = sceneRef.current
    const renderer = rendererRef.current
    const lights = lightsRef.current
    if (scene && renderer && lights) applyLighting(lighting, scene, renderer, lights)
  }, [lighting])

  // The plate's axes and rings, when asked for.
  useEffect(() => {
    const group = staticGuidesRef.current
    if (!group) return
    drawGuides(
      group,
      guides
        ? [
            { kind: 'axis', axis: 'x', at: 0 },
            { kind: 'axis', axis: 'z', at: 0 },
            { kind: 'ring', radius: 0.33 },
            { kind: 'ring', radius: 0.66 },
          ]
        : [],
      0.3,
    )
  }, [guides])

  useEffect(() => {
    if (!captureCommand) return
    const renderer = rendererRef.current
    if (!renderer) return
    // Read on the next frame, so the buffer holds a completed render.
    const id = requestAnimationFrame(() => {
      onCaptureRef.current?.(renderer.domElement.toDataURL('image/png'))
    })
    return () => cancelAnimationFrame(id)
  }, [captureCommand])

  useEffect(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls || !cameraCommand) return
    if (cameraCommand.pose) {
      camera.position.set(...cameraCommand.pose.position)
      controls.target.set(...cameraCommand.pose.target)
      controls.update()
    } else applyFocus(camera, controls, cameraCommand.view)
  }, [cameraCommand])

  useEffect(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls || !snapshotCommand) return
    onSnapshotRef.current?.({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
    })
  }, [snapshotCommand])

  // Keyboard orbit and zoom for viewers that are for looking (review, card, hero). The editor keeps the arrow
  // keys for nudging the selected component, so it does not take them here.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (editable) return
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target))
    const step = 0.14
    switch (e.key) {
      case 'ArrowLeft':
        spherical.theta -= step
        break
      case 'ArrowRight':
        spherical.theta += step
        break
      case 'ArrowUp':
        spherical.phi = Math.max(0.15, spherical.phi - step)
        break
      case 'ArrowDown':
        spherical.phi = Math.min(Math.PI / 2 - 0.02, spherical.phi + step)
        break
      case '+':
      case '=':
        spherical.radius = Math.max(controls.minDistance || 0.5, spherical.radius * 0.9)
        break
      case '-':
      case '_':
        spherical.radius = Math.min(controls.maxDistance || Infinity, spherical.radius * 1.1)
        break
      default:
        return
    }
    e.preventDefault()
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical))
    controls.update()
  }

  return (
    <div
      ref={hostRef}
      tabIndex={editable ? undefined : 0}
      role="group"
      aria-roledescription="3D viewer"
      aria-label={editable ? 'Interactive 3D plating editor' : 'Interactive 3D model of the plated dish. Use the arrow keys to turn it and plus and minus to zoom.'}
      onKeyDown={onKeyDown}
      className="h-full w-full [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    />
  )
}
