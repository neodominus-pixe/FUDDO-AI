// Renders the landing page's hero art through the product's own 3D pipeline.
//
// The hero used to be a piece of stock 3D clip art of a burger, which promised
// something the studio does not make. These are the real thing: the same
// buildPlatingModel() geometry, the same lights and tone mapping as the viewer
// in the studio, captured on a transparent background so the page can light it
// however the theme wants.
//
//   node scripts/hero-shot.mjs                 re-render every concept below
//   node scripts/hero-shot.mjs "Tall stack"    just one, by name
//   node scripts/hero-shot.mjs --size 1600     bigger output (default 1200)
//
// Writes two files per concept into public/hero/:
//
//   <slug>.gltf   the model the landing page loads into the live viewer
//   <slug>.png    the still shown until that model arrives, and the permanent
//                 fallback where WebGL is unavailable
//
// Re-run it after changing lib/model3d.ts, lib/layout.ts or lib/shapes.ts, or
// the hero will quietly disagree with what the studio now produces.
import { register } from 'node:module'
register('./ts-ext.mjs', import.meta.url)
import { existsSync } from 'node:fs'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'

const { buildPlatingModel } = await import('../lib/model3d.ts')

const args = process.argv.slice(2)
const sizeArg = args.indexOf('--size')
const SIZE = sizeArg === -1 ? 1200 : Number(args[sizeArg + 1])
// Everything that is not a flag or a flag's value is a concept name.
const wanted = args.filter((a, i) => !a.startsWith('--') && !(sizeArg !== -1 && i === sizeArg + 1))

// One dish, three directions -- the same claim the hero copy makes. The dish
// matches the studio's starter and the demo further down the landing page, so
// the whole page is talking about one plate.
const DISH = {
  id: 'hero',
  name: 'Duck breast, celeriac, red wine',
  createdAt: '',
  components: [
    { id: 'c1', name: 'Seared duck breast', role: 'hero', imagePath: null },
    { id: 'c2', name: 'Celeriac puree', role: 'support', imagePath: null },
    { id: 'c3', name: 'Charred baby leek', role: 'support', imagePath: null },
    { id: 'c4', name: 'Confit carrot', role: 'support', imagePath: null },
    { id: 'c5', name: 'Blackberry', role: 'garnish', imagePath: null },
    { id: 'c6', name: 'Red wine jus', role: 'sauce', imagePath: null },
    { id: 'c7', name: 'Micro chervil', role: 'garnish', imagePath: null },
  ],
}

const CONCEPTS = [
  {
    name: 'Classic centred',
    note: 'Round white · sauce pooled · medium build',
    slug: 'classic-centred',
    spec: { composition: 'centered', plate: 'round-white', sauce: 'pooled', height: 'medium', garnish: 'moderate', seed: 41 },
  },
  {
    name: 'Garden scatter',
    note: 'Round white · sauce dotted · low build',
    slug: 'garden-scatter',
    spec: { composition: 'scattered', plate: 'round-white', sauce: 'dotted', height: 'low', garnish: 'generous', seed: 5 },
  },
  {
    name: 'Slate linear',
    note: 'Black slate · sauce dotted · low build',
    slug: 'slate-linear',
    spec: { composition: 'linear', plate: 'black-slate', sauce: 'dotted', height: 'low', garnish: 'moderate', seed: 33 },
  },
]

const picked = wanted.length ? CONCEPTS.filter((c) => wanted.includes(c.name) || wanted.includes(c.slug)) : CONCEPTS
if (!picked.length) throw new Error(`No concept matched ${wanted.join(', ')}`)

const models = picked.map((c) => ({
  slug: c.slug,
  name: c.name,
  gltf: buildPlatingModel(DISH, { id: c.slug, notes: '', overrides: {}, ...c.spec }).gltf,
}))

const out = 'data/hero-shot'
await mkdir(out, { recursive: true })
await mkdir('public/hero', { recursive: true })
await writeFile(`${out}/models.json`, JSON.stringify(models))
for (const { slug, gltf } of models) {
  await writeFile(`public/hero/${slug}.gltf`, JSON.stringify(gltf))
  console.log(`public/hero/${slug}.gltf`)
}

// The page needs an origin to load three from node_modules, so it is served
// rather than opened from disk. alpha: true plus toDataURL gives a transparent
// PNG straight out of the renderer -- no page compositing, no matte to trim.
await writeFile(
  `${out}/hero.html`,
  `<!doctype html><meta charset=utf8><title>rendering</title><body style="margin:0;background:transparent">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/examples/jsm/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

const SIZE = ${SIZE}
const models = await (await fetch('models.json')).json()
const loader = new GLTFLoader()
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.setSize(SIZE, SIZE)
renderer.setClearColor(0x000000, 0)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.08
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap

const pmrem = new THREE.PMREMGenerator(renderer)
const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

// Camera, lights and exposure copied from components/ModelViewer.tsx, pulled in
// slightly (0.93) so the plate fills the frame the way hero art has to.
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100)
const HOME = new THREE.Vector3(1.9, 1.5, 2.3)
const BASE_DISTANCE = HOME.length()

// Lifted verbatim from components/ModelViewer.tsx: the still has to be framed
// the way the live viewer frames the same model, or swapping one for the other
// jumps.
function frame(model) {
  const box = new THREE.Box3().setFromObject(model)
  if (box.isEmpty()) return { target: new THREE.Vector3(0, 0.16, 0), distance: BASE_DISTANCE }
  const size = box.getSize(new THREE.Vector3())
  const span = Math.max(size.x, size.z, size.y * 1.9)
  const fitted = ((span * 0.5) / Math.tan((camera.fov * Math.PI) / 360)) * 1.16
  return {
    target: new THREE.Vector3(0, Math.min(0.5, 0.16 + size.y * 0.22), 0),
    distance: Math.min(BASE_DISTANCE * 1.08, Math.max(BASE_DISTANCE * 0.82, fitted)),
  }
}

const shots = {}
for (const { slug, gltf } of models) {
  const scene = new THREE.Scene()
  scene.environment = env
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2b2622, 0.45))
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
  const fill = new THREE.DirectionalLight(0xdce6ff, 0.3)
  fill.position.set(2.4, 1.1, 2.7)
  scene.add(fill)

  const model = (await loader.parseAsync(JSON.stringify(gltf), '')).scene
  model.traverse((o) => {
    if (!o.isMesh) return
    o.castShadow = true
    o.receiveShadow = true
  })
  scene.add(model)

  const { target, distance } = frame(model)
  camera.position.copy(target).add(HOME.clone().normalize().multiplyScalar(distance))
  camera.lookAt(target)
  renderer.render(scene, camera)
  shots[slug] = renderer.domElement.toDataURL('image/png')
}
window.__shots = shots
document.title = 'ready'
</script>`,
)

let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  console.log('This needs puppeteer-core installed.')
  process.exit(1)
}
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => existsSync(p))
if (!CHROME) throw new Error('No Chrome or Edge found to render with.')

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '')
    const body = await readFile(join(process.cwd(), path))
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(4174)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  // Software WebGL: there is no GPU behind a headless shell on most machines.
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
await page.goto(`http://localhost:4174/${out}/hero.html`)
await page.waitForFunction('document.title === "ready"', { timeout: 120000 })
const shots = await page.evaluate(() => window.__shots)
for (const [slug, dataUrl] of Object.entries(shots)) {
  const file = `public/hero/${slug}.png`
  await writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log(file)
}
await browser.close()
server.close()
