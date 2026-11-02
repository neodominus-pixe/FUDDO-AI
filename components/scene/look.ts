import * as THREE from 'three'

// How the plating is lit and what its surfaces are made of. Kept apart from the viewer so the viewer is about
// behaviour (picking, dragging, posing) and this is about appearance, which is what changes most often.

export type LightingPreset = 'studio' | 'bistro' | 'daylight' | 'moody'

export const LIGHTING_LABELS: Record<LightingPreset, string> = {
  studio: 'Studio',
  bistro: 'Bistro',
  daylight: 'Daylight',
  moody: 'Moody',
}

type Rig = {
  key: { color: number; intensity: number; position: [number, number, number] }
  fill: { color: number; intensity: number }
  hemi: { sky: number; ground: number; intensity: number }
  exposure: number
  /** How much the reflected environment contributes. */
  environment: number
  /** Turns the environment about the plate, so highlights land in a different place. */
  environmentTurn: number
}

// Food is lit from behind and to one side: the key throws shadows towards the camera and gives every piece an
// edge of its own. The presets change the colour and the mood, not that principle.
export const LIGHTING: Record<LightingPreset, Rig> = {
  studio: {
    key: { color: 0xfff4e2, intensity: 2.3, position: [-2.4, 3.3, -0.7] },
    fill: { color: 0xdce6ff, intensity: 0.3 },
    hemi: { sky: 0xffffff, ground: 0x2b2622, intensity: 0.45 },
    exposure: 0.92,
    environment: 0.85,
    environmentTurn: 0,
  },
  bistro: {
    key: { color: 0xffc98a, intensity: 2.5, position: [-2.2, 2.6, -1.4] },
    fill: { color: 0xffd9b0, intensity: 0.18 },
    hemi: { sky: 0xffe2c0, ground: 0x1c1410, intensity: 0.3 },
    exposure: 0.86,
    environment: 0.6,
    environmentTurn: 1.2,
  },
  daylight: {
    key: { color: 0xf4f8ff, intensity: 2.0, position: [-3.2, 4.2, 0.6] },
    fill: { color: 0xe8f0ff, intensity: 0.55 },
    hemi: { sky: 0xeaf2ff, ground: 0x44403a, intensity: 0.7 },
    exposure: 0.98,
    environment: 1.05,
    environmentTurn: 2.6,
  },
  moody: {
    key: { color: 0xffe2bd, intensity: 3.1, position: [-2.0, 2.0, -2.2] },
    fill: { color: 0x9fb4d8, intensity: 0.08 },
    hemi: { sky: 0x8a8f99, ground: 0x0a0807, intensity: 0.12 },
    exposure: 0.8,
    environment: 0.35,
    environmentTurn: 4.0,
  },
}

export type Lights = { key: THREE.DirectionalLight; fill: THREE.DirectionalLight; hemi: THREE.HemisphereLight }

export function applyLighting(preset: LightingPreset, scene: THREE.Scene, renderer: THREE.WebGLRenderer, lights: Lights) {
  const rig = LIGHTING[preset]
  lights.key.color.set(rig.key.color)
  lights.key.intensity = rig.key.intensity
  lights.key.position.set(...rig.key.position)
  lights.fill.color.set(rig.fill.color)
  lights.fill.intensity = rig.fill.intensity
  lights.hemi.color.set(rig.hemi.sky)
  lights.hemi.groundColor.set(rig.hemi.ground)
  lights.hemi.intensity = rig.hemi.intensity
  renderer.toneMappingExposure = rig.exposure
  scene.environmentIntensity = rig.environment
  scene.environmentRotation.set(0, rig.environmentTurn, 0)
}

// --- Surfaces ----------------------------------------------------------------------------------------------

// The food has no texture coordinates, so surface detail is worked out in the shader from where on the object a
// point is. Three octaves of value noise, turned into a bump the same way a bump map would be.
const NOISE = /* glsl */ `
  varying vec3 vObjPos;
  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm3(vec3 p) {
    return vnoise(p) * 0.55 + vnoise(p * 2.07) * 0.3 + vnoise(p * 4.3) * 0.15;
  }
  vec3 perturbNormalAny(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDirection) {
    vec3 vSigmaX = normalize(dFdx(surfPos));
    vec3 vSigmaY = normalize(dFdy(surfPos));
    vec3 R1 = cross(vSigmaY, surfNorm);
    vec3 R2 = cross(surfNorm, vSigmaX);
    float fDet = dot(vSigmaX, R1) * faceDirection;
    vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
    return normalize(abs(fDet) * surfNorm - vGrad);
  }
`

export type SurfaceKind = 'food' | 'leaf' | 'sauce' | 'ceramic' | 'slate' | 'wood' | 'table' | 'glass' | 'translucent'

const BUMP: Record<SurfaceKind, { frequency: number; strength: number } | null> = {
  food: { frequency: 9, strength: 0.35 },
  leaf: { frequency: 14, strength: 0.18 },
  sauce: null,
  glass: null,
  translucent: null,
  ceramic: null,
  slate: { frequency: 18, strength: 0.25 },
  wood: { frequency: 12, strength: 0.25 },
  table: null,
}

// How much of a piece's own photograph becomes relief (pits, fibres, crust), and how much light shows through it from
// behind. Both are about what a thing is: a leaf lets a lot of light through, seared meat a little, a sauce a good deal
// of its own colour, and a plate none.
const RELIEF: Record<SurfaceKind, number> = { food: 1, leaf: 0.8, sauce: 0.25, glass: 0, translucent: 0, ceramic: 0, slate: 0, wood: 0, table: 0 }
const GLOW: Record<SurfaceKind, { amount: number; tint: [number, number, number] } | null> = {
  food: { amount: 0.3, tint: [1.0, 0.66, 0.52] },
  leaf: { amount: 0.55, tint: [0.78, 1.08, 0.42] },
  sauce: { amount: 0.4, tint: [1.0, 0.9, 0.85] },
  glass: null,
  translucent: null,
  ceramic: null,
  slate: null,
  wood: null,
  table: null,
}

// What the glaze of each lathed plate is like. Real china is not one flat white: iron specks show through the glaze, it
// pools a little warmer where it runs thick at the rim, it is mottled where it was fired unevenly, and a fine line is
// often drawn round the rim. Plates without an entry (slate, board, the square plate) are left as they are.
type Glaze = {
  /** How dark the specks are, 0 for none. */
  speck: number
  /** The fraction of the surface's cells left without a speck: nearer 1 is sparser. */
  sparse: number
  /** Where a fine line is drawn, as a fraction of the plate's radius, and its colour (linear). */
  line: { at: number; tint: [number, number, number] } | null
  /** How much the glaze pools, warmer and a touch darker, at the very edge. */
  pool: number
  /** How much the glaze is mottled, in broad soft patches. */
  mottle: number
}
const GLAZE: Record<string, Glaze> = {
  'round-white': { speck: 0.5, sparse: 0.972, line: { at: 0.84, tint: [0.34, 0.4, 0.5] }, pool: 0.5, mottle: 0.03 },
  'coupe-grey': { speck: 0.95, sparse: 0.945, line: null, pool: 0.3, mottle: 0.1 },
  'shallow-bowl': { speck: 0.45, sparse: 0.972, line: { at: 0.9, tint: [0.3, 0.36, 0.46] }, pool: 0.5, mottle: 0.035 },
  'deep-bowl': { speck: 0.42, sparse: 0.975, line: { at: 0.93, tint: [0.3, 0.36, 0.46] }, pool: 0.55, mottle: 0.035 },
}

// A photo wrapped onto a shape without texture coordinates: seen from above it is laid over the top like a
// stencil, and round the sides a strip of the same photo is wrapped, so the cut face has a believable grain too.
export type Photo = {
  map: THREE.Texture
  min: THREE.Vector3
  max: THREE.Vector3
  /** The colour the material had when the model was built; the photo is tinted by how far it has moved since. */
  base: THREE.Vector3
  /** Pieces that sit over another (a seared crust) are a little darker than the photo of the thing itself. */
  tone: number
}

function installShader(material: THREE.MeshPhysicalMaterial, kind: SurfaceKind, plate?: string) {
  const bump = BUMP[kind]
  const glaze = kind === 'ceramic' && plate ? GLAZE[plate] : undefined
  const relief = RELIEF[kind]
  const glow = GLOW[kind]
  const f = (n: number) => n.toFixed(3)
  material.onBeforeCompile = (shader) => {
    const photo = material.userData.photo as Photo | undefined
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvObjNormal = normal;')
    let fragment = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vObjNormal;
      float gLum = 0.5;
      float gDetail = 0.0;
      ${photo ? 'uniform sampler2D uPhoto; uniform vec3 uBBMin; uniform vec3 uBBMax; uniform vec3 uBase; uniform float uTone;' : ''}
      ${NOISE}`,
    )
    if (photo) {
      shader.uniforms.uPhoto = { value: photo.map }
      shader.uniforms.uBBMin = { value: photo.min }
      shader.uniforms.uBBMax = { value: photo.max }
      shader.uniforms.uBase = { value: photo.base }
      shader.uniforms.uTone = { value: photo.tone }
      fragment = fragment.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 on = normalize(vObjNormal);
          vec2 span = max(uBBMax.xz - uBBMin.xz, vec2(1e-3));
          vec3 top = texture2D(uPhoto, (vObjPos.xz - uBBMin.xz) / span).rgb;
          float ang = atan(vObjPos.z, vObjPos.x) * 0.15915494 + 0.5;
          float hy = clamp((vObjPos.y - uBBMin.y) / max(uBBMax.y - uBBMin.y, 1e-3), 0.0, 1.0);
          vec3 side = texture2D(uPhoto, vec2(ang, 0.1 + hy * 0.3)).rgb * 0.82;
          vec3 photo = mix(side, top, smoothstep(0.2, 0.7, on.y));
          {
            vec2 uvTop = (vObjPos.xz - uBBMin.xz) / span;
            vec2 uvSide = vec2(ang, 0.1 + hy * 0.3);
            vec3 w = vec3(0.299, 0.587, 0.114);
            float lumTop = dot(texture2D(uPhoto, uvTop).rgb, w);
            float lumSide = dot(texture2D(uPhoto, uvSide).rgb, w);
            float softTop = dot(texture2D(uPhoto, uvTop, 4.0).rgb, w);
            float softSide = dot(texture2D(uPhoto, uvSide, 4.0).rgb, w);
            float t = smoothstep(0.2, 0.7, on.y);
            gLum = mix(lumSide, lumTop, t);
            // The side is a thin strip of the photo stretched round the piece: its detail would become terraces.
            gDetail = mix((lumSide - softSide) * 0.25, lumTop - softTop, t);
          }
          vec3 tint = diffuse / max(uBase, vec3(1e-3));
          #ifdef USE_COLOR
            vec3 shading = mix(vec3(1.0), vColor.rgb, 0.55);
          #else
            vec3 shading = vec3(1.0);
          #endif
          diffuseColor.rgb = photo * tint * shading * uTone;
        }`,
      )
    }
    if (glaze) {
      const line = glaze.line
      fragment = fragment.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float rr = length(vObjPos.xz);
          // Broad, soft unevenness from the firing.
          float m = fbm3(vObjPos * 2.6 + 3.1);
          diffuseColor.rgb *= 1.0 + (m - 0.5) * ${f(glaze.mottle * 2.0)};
          // Iron specks: one possible speck per cell, most cells having none, each a small soft-edged dot.
          vec3 sp = vObjPos * 78.0;
          float roll = hash31(floor(sp));
          float inside = 1.0 - smoothstep(0.1, 0.34, length(fract(sp) - 0.5));
          float speck = step(${f(glaze.sparse)}, roll) * inside * (0.55 + 0.45 * hash31(floor(sp) + 7.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.032, 0.024), clamp(speck * ${f(glaze.speck)}, 0.0, 1.0));
          // Glaze runs thick at the edge: a little warmer and darker there.
          float edge = smoothstep(0.955, 1.0, rr);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.97, 0.94, 0.88), edge * ${f(glaze.pool)});
          ${line ? `float ring = 1.0 - smoothstep(0.003, 0.0085, abs(rr - ${f(line.at)}));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${line.tint.map(f).join(', ')}), ring * 0.55);` : ''}
        }`,
      )
    }
    if (glaze?.line) {
      // The line is a fine groove too, so it catches the light as well as the eye.
      fragment = fragment.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float rr = length(vObjPos.xz);
          float h = (1.0 - smoothstep(0.002, 0.007, abs(rr - ${f(glaze.line.at)}))) * 0.6;
          vec2 dH = clamp(vec2(dFdx(h), dFdy(h)), -0.25, 0.25);
          normal = perturbNormalAny(-vViewPosition, normal, dH, faceDirection);
        }`,
      )
    }
    if (photo && relief > 0) {
      fragment = fragment.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (0.5 - gLum) * ${f(0.35 * relief)}, 0.08, 1.0);`,
      )
    }
    if (bump || (photo && relief > 0)) {
      fragment = fragment.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float h = ${bump ? `fbm3(vObjPos * ${bump.frequency.toFixed(1)}) * ${f(bump.strength)}` : '0.0'};
          ${photo && relief > 0 ? `h += clamp(gDetail, -0.1, 0.1) * ${f(2.6 * relief)};` : ''}
          // The seam where a wrapped photo meets itself must not become a ridge.
          vec2 dH = clamp(vec2(dFdx(h), dFdy(h)), -0.2, 0.2);
          normal = perturbNormalAny(-vViewPosition, normal, dH, faceDirection);
        }`,
      )
    }
    if (glow) {
      fragment = fragment.replace(
        '#include <opaque_fragment>',
        `#if NUM_DIR_LIGHTS > 0
        {
          // Light that goes in and comes out the far side: strongest when the light is behind the piece and the eye in
          // front, and it comes out richer than the surface colour, as it does in a leaf, a fillet or a sauce.
          vec3 Ld = normalize(directionalLights[0].direction);
          vec3 Nv = normalize(normal);
          vec3 Vv = normalize(vViewPosition);
          float back = pow(clamp(dot(Vv, -normalize(Ld + Nv * 0.35)), 0.0, 1.0), 3.0);
          float ndl = dot(Nv, Ld);
          float wrap = max(0.0, (ndl + 0.45) / 1.45) - max(0.0, ndl);
          vec3 through = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(0.65)) * vec3(${glow.tint.map(f).join(', ')});
          outgoingLight += through * directionalLights[0].color * (back * 1.1 + wrap * 0.7) * ${f(glow.amount)};
        }
        #endif
        #include <opaque_fragment>`,
      )
    }
    shader.fragmentShader = fragment
  }
  // A material with a photo is a different program from one without, and the cache has to be told so.
  material.customProgramCacheKey = () => `micro-${kind}-${plate ?? ''}-${material.userData.photo ? 'photo' : 'plain'}`
}

const photoCache = new Map<string, Promise<THREE.Texture>>()
const loader = new THREE.TextureLoader()
loader.setCrossOrigin('anonymous')

/** Loads a texture once however many pieces want it. */
export function loadPhoto(url: string): Promise<THREE.Texture> {
  let hit = photoCache.get(url)
  if (!hit) {
    hit = loader.loadAsync(url).then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.ClampToEdgeWrapping
      texture.anisotropy = 4
      return texture
    })
    // A failed load must not be remembered, or the texture could never be retried.
    hit.catch(() => photoCache.delete(url))
    photoCache.set(url, hit)
  }
  return hit
}

/** Lets go of every cached texture. */
export function disposePhotos() {
  for (const p of photoCache.values()) void p.then((t) => t.dispose()).catch(() => undefined)
  photoCache.clear()
}

export function setPhoto(mesh: THREE.Mesh, map: THREE.Texture, base: [number, number, number], tone = 1) {
  const material = mesh.material as THREE.MeshPhysicalMaterial
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
  const box = mesh.geometry.boundingBox!
  material.userData.photo = {
    map,
    min: box.min.clone(),
    max: box.max.clone(),
    base: new THREE.Vector3(...base),
    tone,
  } satisfies Photo
  material.needsUpdate = true
}

export function clearPhoto(mesh: THREE.Mesh) {
  const material = mesh.material as THREE.MeshPhysicalMaterial
  if (!material.userData.photo) return
  delete material.userData.photo
  material.needsUpdate = true
}

/** Foods that light passes through: the yolk of an egg, honey, syrups. */
export const translucentFood = (name?: string) => !!name && /\b(egg yolks?|yolks?|honey|maple syrup|golden syrup|agave|molasses|treacle)\b/i.test(name)

/** A standard material as a physical one, so it can carry a clear coat or a sheen. */
export function toPhysical(source: THREE.Material): THREE.MeshPhysicalMaterial {
  const physical = new THREE.MeshPhysicalMaterial()
  THREE.MeshStandardMaterial.prototype.copy.call(physical, source as THREE.MeshStandardMaterial)
  return physical
}

/** What a piece is made of, from how the model builder described it. */
export function surfaceFor(opts: { key: string | null; role?: string; roughness: number; plate?: string; isPlate?: boolean }): SurfaceKind {
  if (opts.isPlate) {
    if (opts.plate === 'black-slate') return 'slate'
    if (opts.plate === 'wooden-board') return 'wood'
    return 'ceramic'
  }
  if (opts.key === 'sauce') return 'sauce'
  if (opts.role === 'garnish') return 'leaf'
  return 'food'
}

export function dress(material: THREE.MeshPhysicalMaterial, kind: SurfaceKind, plate?: string) {
  switch (kind) {
    case 'sauce':
      // Wet, but not lacquered: a tight, faint coat over a soft body. A sauce the builder made rough has been cooked
      // down (on a pizza, in the oven) and keeps only a trace of it.
      material.clearcoat = material.roughness > 0.4 ? 0.1 : 0.55
      material.clearcoatRoughness = material.roughness > 0.4 ? 0.4 : 0.18
      break
    case 'ceramic':
      material.clearcoat = 0.6
      material.clearcoatRoughness = 0.1
      break
    case 'translucent':
      // Light that scatters inside a yolk or a spoon of honey shows as a warm glow from within, under a hard wet shine.
      // (Real transmission was tried first, and in this scene's render pipeline a transmissive piece is not drawn at all.)
      material.emissive = material.color.clone()
      material.emissiveIntensity = 0.16
      material.roughness = Math.min(material.roughness, 0.14)
      material.clearcoat = 1
      material.clearcoatRoughness = 0.04
      material.sheen = 0.25
      material.sheenColor = material.color.clone()
      break
    case 'glass':
      // Clear and hard: it catches the light on its edges and reflects the room, and lets the rest through.
      material.clearcoat = 1
      material.clearcoatRoughness = 0.03
      material.ior = 1.5
      material.specularIntensity = 1
      material.envMapIntensity = 1.6
      material.depthWrite = false
      break
    case 'food':
      // The soft bloom at the edge of food that is lit from behind.
      material.sheen = 0.12
      material.sheenRoughness = 0.7
      material.sheenColor = new THREE.Color(0xffe3c4)
      break
    case 'leaf':
      material.sheen = 0.2
      material.sheenRoughness = 0.5
      material.sheenColor = new THREE.Color(0xd8ffc0)
      break
    default:
      break
  }
  if (kind !== 'glass') installShader(material, kind === 'translucent' ? 'sauce' : kind, plate)
  material.needsUpdate = true
}
