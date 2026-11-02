// A contact sheet of what a list of foods actually plates as, in both renderers.
//
// The shape table decides what a component is; this is how you find out whether
// it decided well, without clicking through the studio for each one. Writes
// data/shape-sheet/sheet.html -- open it and the 3D models render in the page
// alongside the 2D pictures of the same dishes.
//
//   node scripts/shape-sheet.mjs                          a default spread of forms
//   node scripts/shape-sheet.mjs "pad thai" "lamb kebab"  whatever you are checking
//   node scripts/shape-sheet.mjs --shot ...               also screenshot it, if a
//                                                        browser is available
//   node scripts/shape-sheet.mjs --close ...              frame the food, not the plate
//   node scripts/shape-sheet.mjs "steak+chips+peas"       a whole plate in one tile
import { register } from 'node:module'
register('./ts-ext.mjs', import.meta.url)
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
const { renderSvg } = await import('../lib/providers/mock.ts')
const { buildPlatingModel } = await import('../lib/model3d.ts')
const { familyFor } = await import('../lib/shapes.ts')

const args = process.argv.slice(2)
const shot = args.includes('--shot')
// The food is a quarter of the plate, so at plate framing a grain of rice is
// two pixels. --close pushes the camera in to look at the food itself.
const close = args.includes('--close')
const names = args.filter((a) => !a.startsWith('--'))
const DISHES = names.length
  ? names
  : ['pizza slice', 'onion rings', 'lamb skewers', 'meatballs', 'watermelon', 'bagel',
     'pad thai', 'tacos', 'chips', 'basmati rice', 'asparagus', 'chervil']

const spec = {
  id: 's', composition: 'centered', plate: 'round-white', sauce: 'none', height: 'medium',
  garnish: 'minimal', notes: '', overrides: {}, seed: 3,
}
const plates = DISHES.map((name) => {
  // "steak+chips+peas" is one plate of three components; a plain name is one
  // component on its own, which is how a single form gets looked at.
  const parts = name.split('+').map((s) => s.trim())
  const dish = {
    id: name,
    name,
    createdAt: '',
    components: parts.map((p, i) => ({ id: `c${i}`, name: p, role: i === 0 ? 'hero' : 'support', imagePath: null })),
  }
  return {
    name,
    family: parts.map((p, i) => familyFor(p, i === 0 ? 'hero' : 'support')).join(' + '),
    svg: renderSvg({ dish, spec, angle: 'three-quarter' }).replace('width="1000" height="1000"', 'width="300" height="300"'),
    gltf: buildPlatingModel(dish, spec).gltf,
  }
})

const out = 'data/shape-sheet'
await mkdir(out, { recursive: true })
await writeFile(`${out}/models.json`, JSON.stringify(plates.map(({ name, gltf }) => ({ name, gltf }))))
await writeFile(
  `${out}/sheet.html`,
  `<!doctype html><meta charset=utf8><title>shape sheet</title>
<body style="margin:0;background:#141414;color:#ddd;font:15px system-ui;display:grid;grid-template-columns:repeat(4,1fr)">
${plates.map((p) => `<figure style="margin:0;text-align:center"><div>${p.svg}</div><div class=model data-name="${p.name}"></div><figcaption>${p.name} &middot; <b>${p.family}</b></figcaption></figure>`).join('\n')}
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/examples/jsm/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
const models = await (await fetch('models.json')).json()
const loader = new GLTFLoader()
for (const host of document.querySelectorAll('.model')) {
  const { gltf } = models.find((m) => m.name === host.dataset.name)
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(300, 300)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#0d0b0a')
  // The same light the studio's viewer uses, so a shape that reads here reads there.
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2b2622, 0.45))
  const key = new THREE.DirectionalLight(0xfff4e2, 2.3)
  key.position.set(-2.4, 3.3, -0.7)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xdce6ff, 0.3)
  fill.position.set(2.4, 1.1, 2.7)
  scene.add(fill)
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100)
  camera.position.set(0, ${close ? '0.62, 0.95' : '1.5, 2.6'})
  camera.lookAt(0, ${close ? '0.1' : '0.12'}, 0)
  scene.add((await loader.parseAsync(JSON.stringify(gltf), '')).scene)
  renderer.render(scene, camera)
  host.appendChild(renderer.domElement)
}
document.title = 'ready'
</script>`,
)
for (const p of plates) console.log(`${p.name.padEnd(24)} ${p.family}`)
console.log(`\n${out}/sheet.html`)

// The page loads three from node_modules, so it needs an origin rather than a
// file path. Served only while the screenshot is taken.
if (!shot) process.exit(0)
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  console.log('--shot needs puppeteer-core installed; open the page yourself instead.')
  process.exit(0)
}
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => existsSync(p))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || `${out}/sheet.html`
    const body = await readFile(join(process.cwd(), path))
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(4173)
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  // Software WebGL: there is no GPU behind a headless shell on most machines.
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1260, height: 900 })
await page.goto(`http://localhost:4173/${out}/sheet.html`)
await page.waitForFunction('document.title === "ready"', { timeout: 60000 })
await page.screenshot({ path: `${out}/sheet.png`, fullPage: true })
await browser.close()
server.close()
console.log(`${out}/sheet.png`)
