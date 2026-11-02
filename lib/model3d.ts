import {
  BASE_PROFILE,
  CAP_PROFILE,
  CUT_PROFILE,
  DISC_PROFILE,
  DOME_PROFILE,
  PILLOW_PROFILE,
  PIZZA_PROFILE,
  POOL_PROFILE,
  SEED_PROFILE,
  ball,
  baton,
  blobSphere,
  buildGltf,
  dust,
  lathe,
  leaf,
  quenelle,
  ring,
  roast,
  bird,
  prawn,
  lobster,
  crab,
  wholeFish,
  glass,
  liquidIn,
  vesselFor,
  type GlassKind,
  rubble,
  ruffle,
  nest,
  pile,
  pod,
  folded,
  saucePool,
  pizzaSauce,
  melt,
  grainHeap,
  shade,
  shard,
  shell,
  skewer,
  sprig,
  shapedSolid,
  cutSolid,
  stack,
  stripe,
  STACK_BANDS,
  sweep,
  unitBox,
  unitCylinder,
  wedge,
  type GltfNode,
  type MaterialDef,
  type Prim,
} from './gltf'
import { CRUST, familyFor, type ShapeFamily } from './shapes'
import { PLATE_PROFILE, PLATE_THICKNESS, elevations, ladled, layout, orient, plateSurfaceY } from './layout'
import { SAUCE_HSL, hexToLinear, hslToLinear, resolveHex, shadeHex } from './palette'
import { MAX_STROKES, brushTaper } from './engine/layout/brush'
import { SAUCE_KEY } from './types'
import type { Dish, PlatingSpec } from './types'

// Slots in the shape library, numbered by declaration order rather than by hand
// so that inserting a shape cannot quietly collide with another one.
let slots = 0
const slot = (n = 1) => {
  const first = slots
  slots += n
  return first
}

const CYLINDER = slot()
const BOX = slot()
const PLATE_ROUND = slot()
const PLATE_COUPE = slot()
const PLATE_BOWL = slot()
const LEAF = slot()
const SPRIG_VARIANTS = 3
const FIRST_SPRIG = slot(SPRIG_VARIANTS)
const DOME = slot()
const BUN_BASE = slot()
const PATTY = slot()
const SLICE = slot()
const CUT = slot()
const RUFFLE = slot()
const SEED = slot()
const PILLOW = slot()
const DISC = slot()
const SHELL = slot()
const FOLDED = slot()
// Built per model rather than from the library: a drizzle follows the curve this
// particular plating drew, so there is nothing to cache.
// One slot per run of sauce: the drizzle and up to MAX_STROKES painted strokes.
const FIRST_STROKE = slot(MAX_STROKES + 1)
// The browned upper shell of a shape, laid over the shape itself. Built from the
// same seed and profile as the body it covers, so its wobble lines up exactly.
const CRUST_CUT = slot()
const CRUST_PATTY = slot()
// Pools of variants, so that three quenelles of the same puree, or a scatter of
// nuts, are not the same mesh repeated. One shape per element would be tidier
// but this keeps a plate to a few thousand vertices.
const SAUCE_VARIANTS = 3
const FIRST_SAUCE = slot(SAUCE_VARIANTS)
const BLOB_VARIANTS = 8
const FIRST_BLOB = slot(BLOB_VARIANTS)
const QUENELLE_VARIANTS = 3
const FIRST_QUENELLE = slot(QUENELLE_VARIANTS)
const BATON_VARIANTS = 3
const FIRST_BATON = slot(BATON_VARIANTS)
const NEST_VARIANTS = 2
const FIRST_NEST = slot(NEST_VARIANTS)
const TUBES_VARIANTS = 2
const FIRST_TUBES = slot(TUBES_VARIANTS)
const PILE_VARIANTS = 2
const FIRST_PILE = slot(PILE_VARIANTS)
const HEAP_VARIANTS = 2
const FIRST_HEAP = slot(HEAP_VARIANTS)
const GRAINS_VARIANTS = 2
const FIRST_GRAINS = slot(GRAINS_VARIANTS)
const FRIES_VARIANTS = 2
const FIRST_FRIES = slot(FRIES_VARIANTS)
const POD_VARIANTS = 2
const FIRST_POD = slot(POD_VARIANTS)
const WEDGE = slot()
// A sandwich, which is the one form on any everyday menu that is built in
// layers. Everything else in the library is one mass.
const STACK = slot()
// Rings and skewers arrive several to a plate, so they get a pool rather than
// one shape repeated: three identical onion rings read as a printed pattern.
const RING_VARIANTS = 2
const FIRST_RING = slot(RING_VARIANTS)
const SKEWER_VARIANTS = 2
const FIRST_SKEWER = slot(SKEWER_VARIANTS)
// A liquid, which is the one form here with no shape of its own: the vessel
// gives it its outline, so unlike every other pool on the plate it is a true
// circle and needs no variants.
const POOL = slot()
// Forms that used to borrow someone else's mesh, or share the lumpy sphere that
// means "not recognised". A mushroom is the only thing on a plate with an
// undercut; a ball is the only thing that is actually round; a crisp is the only
// thing thin enough to see through; a dusting has no form at all; and a whole
// bird is not a portion of anything.
const CAP_VARIANTS = 2
const FIRST_CAP = slot(CAP_VARIANTS)
const BALL_VARIANTS = 3
const FIRST_BALL = slot(BALL_VARIANTS)
const SHARD_VARIANTS = 3
const FIRST_SHARD = slot(SHARD_VARIANTS)
const RUBBLE_VARIANTS = 2
const FIRST_RUBBLE = slot(RUBBLE_VARIANTS)
const DUST = slot()
const ROAST = slot()
// Added after everything above, so the numbering of the shapes that were already here is untouched.
const COIN_VARIANTS = 3
const FIRST_COIN = slot(COIN_VARIANTS)
const PIZZA = slot()
const STEAK = slot()
const BREAST = slot()
const FILLET = slot()
const CRUST_STEAK = slot()
const CRUST_BREAST = slot()
const CRUST_FILLET = slot()
const BIRD = slot()
const CHUNK = slot()
const PRAWN = slot()
const LOBSTER = slot()
const LOBSTER_TAIL = slot()
const CRAB = slot()
const WHOLEFISH = slot()
const FAT_STEAK = slot()
const CRUST_CHUNK = slot()
// A drink: the glass, and what is in it, in each of the four vessels (see engine/gltf/glassware.ts).
const GLASS_KINDS: GlassKind[] = ['tumbler', 'tall', 'stemmed', 'mug']
const FIRST_GLASS = slot(GLASS_KINDS.length)
const FIRST_DRINK = slot(GLASS_KINDS.length)
// Added last so the numbering of everything before it is untouched.
const PLATE_SHALLOW = slot()
const ROUND_GRAINS = slot()
const BEANS = slot()
// What goes on a pizza, as it comes out of the oven: the sauce one film to the crust, the cheese melted into pools.
const PIZZA_SAUCE = slot()
const MELT_VARIANTS = 4
const FIRST_MELT = slot(MELT_VARIANTS)
// What a heap of grains is made of, from its name.
const ROUND_GRAIN_NAME = /\b(couscous|quinoa|millet|bulgur|barley|polenta|grits|semolina|freekeh|farro|amaranth|cornmeal|lentils?)\b/i
const BEAN_NAME = /\b(beans?|chickpeas?|peas|sweetcorn|corn|edamame)\b/i

// How far a crust shell stands off the body it covers: far enough never to
// z-fight it, little enough to read as skin rather than as a lid.
const SKIN = { grow: 1.02, lift: 0.05 }
const crustFrom = (family: ShapeFamily) => ({ ...SKIN, fromY: CRUST[family]?.fromY ?? 0.5 })

// Seeds are fixed per shape so a body and its crust wobble identically, and so
// the same dish builds byte-for-byte the same model every time.
const LIBRARY: Array<() => Prim> = []
LIBRARY[CYLINDER] = () => unitCylinder()
LIBRARY[BOX] = () => unitBox()
LIBRARY[PLATE_ROUND] = () => lathe(PLATE_PROFILE['round-white'])
LIBRARY[PLATE_COUPE] = () => lathe(PLATE_PROFILE['coupe-grey'])
LIBRARY[PLATE_BOWL] = () => lathe(PLATE_PROFILE['deep-bowl'])
LIBRARY[PLATE_SHALLOW] = () => lathe(PLATE_PROFILE['shallow-bowl'])
// A leaf is thin and lit from both sides, so it takes almost no contact shade.
LIBRARY[LEAF] = () => shade(leaf(), { contact: 0.14, mottle: 0.09, seed: 5 })
// Three sprigs, because a plate finished with eight identical ones is worse
// than a plate finished with none.
for (let i = 0; i < SPRIG_VARIANTS; i++)
  LIBRARY[FIRST_SPRIG + i] = () => shade(sprig(127 + i * 13), { contact: 0.18, mottle: 0.12, seed: 127 + i * 13 })
// A baked crown: browned where the oven reached it, pale underneath.
LIBRARY[DOME] = () => shade(shapedSolid(11, DOME_PROFILE, { noise: 0.045, squareness: 0 }), { brown: 0.8, contact: 0.34, seed: 11 })
LIBRARY[BUN_BASE] = () => shade(shapedSolid(17, BASE_PROFILE, { noise: 0.04, squareness: 0 }), // The cut face of a bun base is pale bread; only its sides saw the oven.
  { brown: 0.22, contact: 0.36, seed: 17 })
LIBRARY[PATTY] = () => shade(cutSolid(23, 'patty'), { brown: 0.4, contact: 0.38, mottle: 0.07, char: 0.22, charBars: 2.6, seed: 23 })
// Squared off, but not by much, and the corners hang: a slice of cheese laid on
// a hot patty drapes over it rather than sitting there like a roof tile.
LIBRARY[SLICE] = () => shade(shapedSolid(37, DISC_PROFILE, { noise: 0.035, squareness: 0.62, droop: 0.5 }), { contact: 0.22, mottle: 0.04, seed: 37 })
LIBRARY[CUT] = () => shade(shapedSolid(41, CUT_PROFILE, { noise: 0.05, squareness: 0.34 }), { contact: 0.4, mottle: 0.07, seed: 41 })
LIBRARY[RUFFLE] = () => shade(ruffle(67), { contact: 0.26, mottle: 0.1, seed: 67 })
LIBRARY[SEED] = () => shade(shapedSolid(71, SEED_PROFILE, { noise: 0.012, squareness: 0, seg: 24 }), { contact: 0.2, mottle: 0.03, seed: 71 })
// Filled pasta: squared off, puffed over the filling, fluted where it was sealed.
LIBRARY[PILLOW] = () => shade(shapedSolid(73, PILLOW_PROFILE, { noise: 0.03, squareness: 0.66, crimp: 0.055 }), { contact: 0.3, mottle: 0.045, seed: 73 })
// Round rather than squared off, and lumpier than a patty: a pancake spreads
// where it was poured and a pizza is stretched by hand.
// Shell is barely browned and strongly mottled: it is mineral, not cooked.
LIBRARY[SHELL] = () => shade(shell(103), { contact: 0.3, mottle: 0.1, seed: 103 })
LIBRARY[FOLDED] = () => shade(folded(107), { contact: 0.34, brown: 0.45, mottle: 0.08, seed: 107 })
LIBRARY[DISC] = () => shade(shapedSolid(97, DISC_PROFILE, { noise: 0.055, squareness: 0 }), { brown: 0.5, contact: 0.3, mottle: 0.07, seed: 97 })
LIBRARY[CRUST_CUT] = () => shapedSolid(41, CUT_PROFILE, { noise: 0.05, squareness: 0.34, ...crustFrom('cut') })
LIBRARY[CRUST_PATTY] = () => cutSolid(23, 'patty', crustFrom('patty'))
// Sauce is the one even surface on the plate: barely mottled, and dark only
// where it thins out at the edge.
for (let i = 0; i < SAUCE_VARIANTS; i++) LIBRARY[FIRST_SAUCE + i] = () => shade(saucePool(i + 1), { contact: 0.12, mottle: 0.02, seed: i + 1 })
for (let i = 0; i < BLOB_VARIANTS; i++) LIBRARY[FIRST_BLOB + i] = () => shade(blobSphere(i + 1), { contact: 0.32, mottle: 0.07, seed: i + 1 })
for (let i = 0; i < QUENELLE_VARIANTS; i++) LIBRARY[FIRST_QUENELLE + i] = () => shade(quenelle(53 + i * 7), { contact: 0.28, mottle: 0.035, seed: 53 + i * 7 })
// Batons are what get grilled -- asparagus, leeks, spring onions -- so they are
// the one form that carries bar marks.
for (let i = 0; i < BATON_VARIANTS; i++)
  LIBRARY[FIRST_BATON + i] = () => shade(baton(59 + i * 7), { contact: 0.3, mottle: 0.08, char: 0.3, seed: 59 + i * 7 })
// The deepest contact shade in the library: a nest is mostly crevice, and the
// shadow between its coils is what makes it read as strands.
for (let i = 0; i < NEST_VARIANTS; i++) LIBRARY[FIRST_NEST + i] = () => shade(nest(79 + i * 11), { contact: 0.46, mottle: 0.05, seed: 79 + i * 11 })
// A heap darkens towards the plate, so the pieces underneath sit back.
// Twenty tubes, not five drainpipes: a portion is what has to read, and the
// size of one piece against the whole heap is what says which pasta it is.
for (let i = 0; i < TUBES_VARIANTS; i++)
  LIBRARY[FIRST_TUBES + i] = () =>
    shade(pile(83 + i * 11, { hollow: true, count: 38, radius: 0.1, length: 0.38, core: 0.66 }), { contact: 0.42, mottle: 0.05, seed: 83 + i * 11 })
for (let i = 0; i < PILE_VARIANTS; i++)
  LIBRARY[FIRST_PILE + i] = () =>
    shade(pile(89 + i * 11, { count: 24, radius: 0.14, length: 0.34, ridged: true, core: 0.64 }), { contact: 0.42, mottle: 0.05, seed: 89 + i * 11 })
// Small round things heaped: peas, blueberries, olives. Rounder and smaller than a piece of pasta, and with the glossy
// skin of something that has not been cooked hard.
for (let i = 0; i < HEAP_VARIANTS; i++)
  LIBRARY[FIRST_HEAP + i] = () =>
    shade(pile(151 + i * 11, { count: 34, radius: 0.13, length: 0.17, seg: 12, rows: 9, core: 0.62 }), { contact: 0.4, mottle: 0.08, seed: 151 + i * 11 })
// A heap of real grains over a darker core, so the gaps between them show shadow and not the plate. Rice is long and
// slender; couscous and quinoa are small and round; beans and corn are fewer, fatter and curved.
for (let i = 0; i < GRAINS_VARIANTS; i++)
  LIBRARY[FIRST_GRAINS + i] = () =>
    shade(grainHeap(101 + i * 11), { contact: 0.5, mottle: 0.05, seed: 101 + i * 11 })
LIBRARY[ROUND_GRAINS] = () => shade(grainHeap(131, { count: 1300, length: 0.075, width: 0.068, rings: 4, seg: 5 }), { contact: 0.5, mottle: 0.06, seed: 131 })
LIBRARY[BEANS] = () => shade(grainHeap(137, { count: 420, length: 0.115, width: 0.082, rings: 5, seg: 6, bend: 0.28 }), { contact: 0.5, mottle: 0.06, seed: 137 })

// Long pieces heaped loosely, which is what a portion of chips looks like from
// any angle that is not straight down.
for (let i = 0; i < FRIES_VARIANTS; i++)
  LIBRARY[FIRST_FRIES + i] = () =>
    shade(pile(113 + i * 11, { count: 30, radius: 0.062, length: 0.68, seg: 12, rows: 11, blunt: true, core: 0.52, square: true, lengthJitter: 0.5 }), {
      contact: 0.32,
      brown: 0.1,
      mottle: 0.05,
      seed: 113 + i * 11,
    })

// Pods are picked, not cooked hard: barely browned, and mottled the way a green
// vegetable is.
for (let i = 0; i < POD_VARIANTS; i++)
  LIBRARY[FIRST_POD + i] = () => shade(pod(269 + i * 11), { contact: 0.3, mottle: 0.11, seed: 269 + i * 11 })
// A wedge is cut, so most of what you see is the inside: browned lightly, since
// the cut faces of a slice of cake never saw the oven at all.
LIBRARY[WEDGE] = () => shade(wedge(131), { brown: 0.28, contact: 0.32, mottle: 0.06, seed: 131 })
// A sandwich: toasted on the outside, and its fillings darkened afterwards so
// the layers read. The stripe has to come last -- shade() writes the whole
// colour array, so anything done before it is overwritten.
LIBRARY[STACK] = () => stripe(shade(stack(263), { brown: 0.42, contact: 0.36, mottle: 0.06, seed: 263 }), STACK_BANDS, 0.72)
// Battered and fried: browned all over rather than on top, and never even.
for (let i = 0; i < RING_VARIANTS; i++)
  LIBRARY[FIRST_RING + i] = () => shade(ring(137 + i * 11), { brown: 0.5, contact: 0.3, mottle: 0.11, seed: 137 + i * 11 })
// Off a grill, which is the only way anything ends up on a stick.
for (let i = 0; i < SKEWER_VARIANTS; i++)
  LIBRARY[FIRST_SKEWER + i] = () =>
    shade(skewer(149 + i * 11), { brown: 0.42, contact: 0.36, mottle: 0.08, char: 0.26, charBars: 4.2, seed: 149 + i * 11 })

// A liquid is the one even surface on the plate and the one thing here that is
// never browned: no contact shade, because its underside is inside the vessel
// and nobody sees it, and almost no mottle, because a soup that is blotchy is a
// soup that has split.
LIBRARY[POOL] = () => shade(lathe(POOL_PROFILE), { contact: 0.06, mottle: 0.015, seed: 3 })
// A mushroom. Browned on the cap where it met the pan, pale down the stalk --
// which the browning already knows, because it only reaches what faces up.
// The crimp flutes the widest part of the outline, which on this profile is the
// rim of the cap: gills, for nothing.
for (let i = 0; i < CAP_VARIANTS; i++)
  LIBRARY[FIRST_CAP + i] = () =>
    shade(shapedSolid(163 + i * 11, CAP_PROFILE, { noise: 0.04, squareness: 0, crimp: 0.03, seg: 40 }), {
      brown: 0.5,
      contact: 0.36,
      mottle: 0.09,
      seed: 163 + i * 11,
    })
for (let i = 0; i < BALL_VARIANTS; i++)
  LIBRARY[FIRST_BALL + i] = () => shade(ball(181 + i * 11), { contact: 0.34, mottle: 0.05, seed: 181 + i * 11 })
// Fried, baked or set hard, and browned all over rather than on top: a crisp is
// thin enough that both its faces cooked at once.
for (let i = 0; i < SHARD_VARIANTS; i++)
  LIBRARY[FIRST_SHARD + i] = () =>
    shade(shard(199 + i * 11), { brown: 0.34, contact: 0.1, mottle: 0.12, warm: [0.96, 0.74, 0.5], seed: 199 + i * 11 })
// Broken pieces, which are lit on every facet at a different angle -- so they
// take the least contact shade in the library and the most mottle, and the
// shadow between them does the rest.
for (let i = 0; i < RUBBLE_VARIANTS; i++)
  LIBRARY[FIRST_RUBBLE + i] = () =>
    shade(rubble(233 + i * 11), { contact: 0.24, brown: 0.2, mottle: 0.14, seed: 233 + i * 11 })
// A dusting takes no shading at all. It is a film a fraction of a millimetre
// thick; anything that darkens its underside darkens the whole of it.
LIBRARY[DUST] = () => shade(dust(251), { contact: 0.06, mottle: 0.06, seed: 251 })
// A whole roast is the one thing on the plate that browned on every surface it
// has, because every surface of it faced an oven.
LIBRARY[ROAST] = () => shade(roast(257), { brown: 0.66, contact: 0.42, mottle: 0.1, seed: 257 })

// A round slice: tomato, cucumber, pepperoni. Round, a touch domed, and no two the same.
for (let i = 0; i < COIN_VARIANTS; i++)
  LIBRARY[FIRST_COIN + i] = () =>
    shade(shapedSolid(301 + i * 13, DISC_PROFILE, { noise: 0.028, squareness: 0, seg: 40 }), { contact: 0.22, mottle: 0.06, seed: 301 + i * 13 })
// A pizza: the crust browns where the oven reached it, and the deck under the toppings stays paler.
LIBRARY[PIZZA] = () => shade(shapedSolid(331, PIZZA_PROFILE, { noise: 0.035, squareness: 0, seg: 56 }), { brown: 0.62, contact: 0.3, mottle: 0.1, seed: 331 })
// Both carry their own colouring (a cooked-down edge on the sauce, browned bubbles on the cheese), so neither is shaded.
LIBRARY[PIZZA_SAUCE] = () => pizzaSauce(337)
for (let i = 0; i < MELT_VARIANTS; i++) LIBRARY[FIRST_MELT + i] = () => melt(347 + i * 13)

// Cooked flesh, each built for what it is (see engine/gltf/cuts.ts). A crust is the upper shell of the same piece.
LIBRARY[STEAK] = () => shade(cutSolid(41, 'steak'), { contact: 0.4, mottle: 0.07, brown: 0.3, char: 0.18, charBars: 2.6, seed: 41 })
LIBRARY[BREAST] = () => shade(cutSolid(47, 'breast'), { contact: 0.4, mottle: 0.07, brown: 0.35, seed: 47 })
LIBRARY[FILLET] = () => shade(cutSolid(53, 'fillet'), { contact: 0.38, mottle: 0.06, brown: 0.12, seed: 53 })
// A whole roast bird: browned on every surface that faced the oven.
LIBRARY[BIRD] = () => shade(bird(263), { brown: 0.62, contact: 0.4, mottle: 0.09, seed: 263 })
// From the sea: cooked pink, and shaded the way a shell is, which is lighter on the back than a roast.
LIBRARY[PRAWN] = () => shade(prawn(71), { contact: 0.3, mottle: 0.07, brown: 0.12, seed: 71 })
LIBRARY[LOBSTER] = () => shade(lobster(73, true), { contact: 0.32, mottle: 0.08, brown: 0.1, seed: 73 })
LIBRARY[LOBSTER_TAIL] = () => shade(lobster(79, false), { contact: 0.32, mottle: 0.08, brown: 0.1, seed: 79 })
LIBRARY[CRAB] = () => shade(crab(83), { contact: 0.3, mottle: 0.09, brown: 0.1, seed: 83 })
LIBRARY[WHOLEFISH] = () => shade(wholeFish(89), { contact: 0.3, mottle: 0.07, brown: 0.2, seed: 89 })
// Drinks. A liquid is never browned or mottled, and the glass is clear: neither takes any shading.
GLASS_KINDS.forEach((kind, i) => {
  LIBRARY[FIRST_GLASS + i] = () => glass(kind)
  LIBRARY[FIRST_DRINK + i] = () => liquidIn(kind)
})
// A roast chunk, browned all round and unevenly.
LIBRARY[CHUNK] = () => shade(cutSolid(59, 'chunk'), { contact: 0.38, mottle: 0.1, brown: 0.45, seed: 59 })
LIBRARY[CRUST_CHUNK] = () => cutSolid(59, 'chunk', crustFrom('chunk'))
LIBRARY[CRUST_STEAK] = () => cutSolid(41, 'steak', crustFrom('steak'))
// The band of fat down one side of a steak, a piece of its own so that it can be a different colour.
LIBRARY[FAT_STEAK] = () => cutSolid(41, 'steak', { grow: 1.035, lift: 0.04, strip: { from: 0.45, to: Math.PI - 0.45, rMin: 0.9, yMin: -0.55, yMax: 0.45 } })
LIBRARY[CRUST_BREAST] = () => cutSolid(47, 'breast', crustFrom('breast'))
LIBRARY[CRUST_FILLET] = () => cutSolid(53, 'fillet', crustFrom('fillet'))

const CRUST_PRIM: Partial<Record<ShapeFamily, number>> = {
  cut: CRUST_CUT,
  patty: CRUST_PATTY,
  steak: CRUST_STEAK,
  breast: CRUST_BREAST,
  fillet: CRUST_FILLET,
  chunk: CRUST_CHUNK,
}

// Stable per-element choice within a pool of variants: the same element always
// gets the same shape, and two elements rarely get the same one.
function variantFor(first: number, count: number, key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return first + (h % count)
}

const FAMILY_PRIM = {
  dome: DOME,
  bunBase: BUN_BASE,
  patty: PATTY,
  slice: SLICE,
  leaf: LEAF,
  cut: CUT,
  ruffle: RUFFLE,
  seed: SEED,
  pillow: PILLOW,
  disc: DISC,
  shell: SHELL,
  folded: FOLDED,
  liquid: POOL,
  wedge: WEDGE,
  stack: STACK,
  dust: DUST,
  whole: ROAST,
  pizza: PIZZA,
  steak: STEAK,
  breast: BREAST,
  fillet: FILLET,
  bird: BIRD,
  chunk: CHUNK,
  prawn: PRAWN,
  lobster: LOBSTER,
  crab: CRAB,
  wholefish: WHOLEFISH,
  // The liquid; the glass around it is hung off it in buildPlatingModel, and which vessel it is depends on the name.
  glass: FIRST_DRINK,
} satisfies Partial<Record<ShapeFamily, number>>

const FAMILY_POOL = {
  // The lumpy sphere means "the table did not recognise this name", and nothing
  // else. Every form that HAS been recognised now has geometry of its own --
  // borrowing this one was how a meatball came out a rock and a spoonful of
  // breadcrumbs came out a boulder.
  blob: [FIRST_BLOB, BLOB_VARIANTS],
  ball: [FIRST_BALL, BALL_VARIANTS],
  crumb: [FIRST_RUBBLE, RUBBLE_VARIANTS],
  cap: [FIRST_CAP, CAP_VARIANTS],
  shard: [FIRST_SHARD, SHARD_VARIANTS],
  ring: [FIRST_RING, RING_VARIANTS],
  skewer: [FIRST_SKEWER, SKEWER_VARIANTS],
  quenelle: [FIRST_QUENELLE, QUENELLE_VARIANTS],
  baton: [FIRST_BATON, BATON_VARIANTS],
  nest: [FIRST_NEST, NEST_VARIANTS],
  tubes: [FIRST_TUBES, TUBES_VARIANTS],
  pile: [FIRST_PILE, PILE_VARIANTS],
  heap: [FIRST_HEAP, HEAP_VARIANTS],
  grains: [FIRST_GRAINS, GRAINS_VARIANTS],
  sprig: [FIRST_SPRIG, SPRIG_VARIANTS],
  fries: [FIRST_FRIES, FRIES_VARIANTS],
  coin: [FIRST_COIN, COIN_VARIANTS],
  pod: [FIRST_POD, POD_VARIANTS],
} satisfies Partial<Record<ShapeFamily, [number, number]>>

// Every form the shape table can produce has to have geometry of its own, and a
// form that does not falls back to the lumpy sphere silently -- which is exactly
// the failure this library exists to stop, and is invisible in a render because
// a lumpy sphere is a perfectly plausible thing for food to be. So it is caught
// here instead: adding a form to `ShapeFamily` without building it stops the
// build, because this type is then no longer an empty record.
const EVERY_FORM_IS_BUILT: Record<
  Exclude<ShapeFamily, keyof typeof FAMILY_PRIM | keyof typeof FAMILY_POOL>,
  never
> = {}
void EVERY_FORM_IS_BUILT

function primFor(family: ShapeFamily, key: string): number {
  const pool = (FAMILY_POOL as Partial<Record<ShapeFamily, [number, number]>>)[family]
  if (pool) return variantFor(pool[0], pool[1], key)
  return (FAMILY_PRIM as Partial<Record<ShapeFamily, number>>)[family] ?? variantFor(FIRST_BLOB, BLOB_VARIANTS, key)
}

const PLATE_PRIM: Record<string, number> = {
  'round-white': PLATE_ROUND,
  'coupe-grey': PLATE_COUPE,
  'deep-bowl': PLATE_BOWL,
  'shallow-bowl': PLATE_SHALLOW,
}

export function buildPlatingModel(dish: Dish, spec: PlatingSpec) {
  const l = layout(dish, spec)
  const R = l.plate.radius

  // Frame coordinates run 0..1 across the picture. Scene coordinates put the
  // plate rim at +/-1 on X and Z, with Y up from the table.
  const toScene = (v: number) => (v - 0.5) / R
  const size = (v: number) => v / R
  const elev = elevations(l, spec)

  const materials: MaterialDef[] = []
  const matKey = new Map<string, number>()
  const material = (color: [number, number, number, number], roughness = 0.62, metallic = 0.0) => {
    const key = `${color.map((c) => c.toFixed(4)).join(',')}|${roughness}|${metallic}`
    const hit = matKey.get(key)
    if (hit !== undefined) return hit
    const idx = materials.push({ color, roughness, metallic }) - 1
    matKey.set(key, idx)
    return idx
  }

  // Glazed ceramic is smooth, timber is not, food is matte and sauce is wet.
  const PLATE_ROUGHNESS: Record<string, number> = {
    'round-white': 0.16, 'coupe-grey': 0.22, 'deep-bowl': 0.16, 'shallow-bowl': 0.16,
    'black-slate': 0.55, 'square-white': 0.18, 'wooden-board': 0.72,
  }

  const nodes: GltfNode[] = []

  const plateMat = material(hexToLinear(l.plate.face), PLATE_ROUGHNESS[spec.plate] ?? 0.3, 0.02)
  const profilePrim = PLATE_PRIM[spec.plate]
  if (profilePrim !== undefined) {
    // Lathed profiles are already in scene units, so they need no vertical scale.
    nodes.push({ prim: profilePrim, material: plateMat, translation: [0, 0, 0], scale: [1, 1, 1], name: 'plate' })
  } else if (l.plate.shape === 'circle') {
    nodes.push({ prim: CYLINDER, material: plateMat, translation: [0, 0, 0], scale: [1, PLATE_THICKNESS, 1], name: 'plate' })
  } else {
    // Slate is a thin hard slab; a board is thick timber.
    const thickness = l.plate.shape === 'board' ? PLATE_THICKNESS * 2.2 : PLATE_THICKNESS * 0.8
    nodes.push({ prim: BOX, material: plateMat, translation: [0, 0, 0], scale: [1.78, thickness, 1.78], name: 'plate' })
  }

  // Sauce lies on the plate surface. Discrete marks and sampled drizzle both
  // become thin discs so both renderers describe the same sauce.
  const sauceName = dish.components.find((c) => c.role === 'sauce')?.name ?? ''
  // Sauce is wet, but not lacquered: at a true gloss the highlight blows out and
  // a ladle of ragu reads as a plastic moulding.
  const sauceTweak = spec.tweaks?.[SAUCE_KEY] ?? {}
  const sauceMat = material(
    sauceName ? hexToLinear(resolveHex(sauceName, 'sauce', sauceTweak.c)) : hslToLinear(SAUCE_HSL),
    0.26,
    0.0,
  )
  l.sauce.marks.forEach((m, i) => {
    const x = toScene(m.x)
    const z = toScene(m.y)
    // The layout already decided whether this spoonful went over something or
    // onto the plate. A mark that was ladled on top keeps some depth: spread
    // thin it reads as a painted disc rather than as a spoonful of sauce.
    const seat = m.over ? elev.get(m.over) : undefined
    const on = m.over ? ladled(l, spec, elev, m.over) : undefined
    const y = seat && on
      ? on.y
      : plateSurfaceY(spec.plate, Math.min(1, Math.hypot(x, z))) + 0.006
    const under = m.over ? l.elements.find((e) => e.key === m.over) : undefined
    const onPizza = !!seat && !!under && familyFor(under.name, under.role, spec.tweaks?.[under.key]?.v) === 'pizza'
    nodes.push({
      prim: onPizza ? PIZZA_SAUCE : FIRST_SAUCE + (i % SAUCE_VARIANTS),
      // Sauce that has been through the oven has cooked down and lost its shine.
      material: onPizza ? material(materials[sauceMat].color, 0.55, 0.0) : sauceMat,
      translation: [x, y, z],
      scale: [size(m.rx), seat ? (on?.thickness ?? 0.06) : 0.02, size(m.ry)],
      name: `sauce-${spec.sauce}`,
      extras: { key: SAUCE_KEY, role: 'sauce' },
    })
  })

  // A drizzle is one continuous run of sauce. The layout hands it over as points
  // sampled along the same curve the 2D stroke is drawn from, so that the two
  // renderers cannot disagree about where the sauce went -- but rendering those
  // points as separate blobs turned a drizzle into a string of beads.
  // A painted stroke is the same thing with a width of its own, and it tapers at both ends like a brush lifted off.
  const strokeRadius = 0.035
  const strokeShapes: Array<{ path: Array<[number, number, number]>; radius: number; free: boolean }> = []
  l.sauce.strokes.slice(0, MAX_STROKES + 1).forEach((run) => {
    if (run.samples.length < 2) return
    const radius = strokeRadius * run.width
    const world: Array<[number, number, number]> = run.samples.map((m) => {
      const x = toScene(m.x)
      const z = toScene(m.y)
      return [x, plateSurfaceY(spec.plate, Math.min(1, Math.hypot(x, z))) + radius * 0.22, z]
    })
    // Built about its own middle and carried there by the node, rather than built
    // in place with the node at the origin. A node whose position is a real point
    // is one the viewer can pick up and move with the rest of the sauce.
    const mid: [number, number, number] = [
      world.reduce((a, p) => a + p[0], 0) / world.length,
      world.reduce((a, p) => a + p[1], 0) / world.length,
      world.reduce((a, p) => a + p[2], 0) / world.length,
    ]
    const slotIndex = FIRST_STROKE + strokeShapes.length
    strokeShapes.push({
      path: world.map(([x, y, z]) => [x - mid[0], y - mid[1], z - mid[2]] as [number, number, number]),
      radius,
      free: run.free,
    })
    nodes.push({
      prim: slotIndex,
      material: sauceMat,
      translation: mid,
      scale: [1, 1, 1],
      name: `sauce-${spec.sauce}`,
      // A painted stroke is picked up on its own, so it has its own key; a drizzle belongs to the sauce.
      extras: { key: run.free ? `stroke:${run.index}` : SAUCE_KEY, role: 'sauce' },
    })
  })


  for (const el of l.elements) {
    const e = elev.get(el.key)
    if (!e) continue
    const tw = spec.tweaks?.[el.key]
    const family = familyFor(el.name, el.role, tw?.v)
    const hex = resolveHex(el.name, el.role, tw?.c)
    const rotation = orient(el.rotation + (tw?.r ?? 0), e.tilt)
    const translation: [number, number, number] = [toScene(el.x), e.y, toScene(el.y)]
    const scale: [number, number, number] = [e.rx, e.ry, e.rz]
    // A drink is the liquid in its glass, and which glass it is comes from what the drink is called.
    const vessel = family === 'glass' ? GLASS_KINDS.indexOf(vesselFor(el.name)) : -1
    nodes.push({
      rotation,
      // A lobster tail is the tail alone; the whole animal has its claws.
      prim:
        e.melted
          ? variantFor(FIRST_MELT, MELT_VARIANTS, el.key)
          : vessel >= 0
          ? FIRST_DRINK + vessel
          : family === 'lobster' && /tail/i.test(el.name)
            ? LOBSTER_TAIL
            : family === 'grains' && BEAN_NAME.test(el.name)
              ? BEANS
              : family === 'grains' && ROUND_GRAIN_NAME.test(el.name)
                ? ROUND_GRAINS
                : primFor(family, el.key),
      // Food is matte. Cooked surfaces and herbs catch a little more light than
      // a cut face does, but nothing on a plate is as smooth as the plate --
      // except a bowl of soup, which is a liquid and has to read as one.
      // Melted cheese has a sheen on it that the cold slice did not.
      material: material(hexToLinear(hex), family === 'liquid' ? 0.24 : family === 'glass' ? 0.16 : e.melted ? 0.42 : el.role === 'garnish' ? 0.62 : 0.78),
      translation,
      scale,
      name: el.name,
      // The form rides along so the viewer can put a hand-built model in its place (components/scene/authored.ts).
      extras: { key: el.key, role: el.role, form: family },
    })
    if (vessel >= 0) {
      // Clear glass: barely there, and glossy, so that what it catches is the light on its edge.
      nodes.push({
        parent: nodes.length - 1,
        prim: FIRST_GLASS + vessel,
        material: material([0.82, 0.9, 0.95, 0.2], 0.04, 0),
        translation: [0, 0, 0],
        scale: [1, 1, 1],
        name: `${el.name} glass`,
      })
    }

    // Anything that met a pan or an oven gets its browned face laid over the top
    // of the same form. It is the difference between a seared duck breast and a
    // beige lozenge, and it costs one extra node.
    const crust = CRUST[family]
    const crustPrim = CRUST_PRIM[family]
    if (crust && crustPrim !== undefined) {
      nodes.push({
        parent: nodes.length - 1,
        prim: crustPrim,
        // Seared surfaces are darker and a little glossier than the cut face.
        material: material(hexToLinear(shadeHex(hex, crust.shade)), 0.58),
        // Hung off the piece itself, so the offset that keeps it clear of the
        // surface is the only thing in its own transform.
        translation: [0, 0, 0],
        scale: [1, 1, 1],
        name: `${el.name} crust`,
      })
      // A steak also carries its fat: pale, down the long side, over the sear.
      if (family === 'steak') {
        nodes.push({
          parent: nodes.length - 2,
          prim: FAT_STEAK,
          material: material(hexToLinear('#eadbb8'), 0.5),
          translation: [0, 0, 0],
          scale: [1, 1, 1],
          name: `${el.name} fat`,
        })
      }
    }
  }

  // Only the shapes this plate actually stands on are tessellated. The library
  // knows a couple of dozen forms; a plate uses a handful, and building the rest
  // cost every request the work and the bytes for geometry nothing references.
  const used = new Set(nodes.map((n) => n.prim))
  const prims: Array<Prim | undefined> = new Array(slots)
  for (let i = 0; i < slots; i++) if (used.has(i)) prims[i] = LIBRARY[i]?.()
  strokeShapes.forEach((s, i) => {
    if (used.has(FIRST_STROKE + i)) prims[FIRST_STROKE + i] = sweep(s.path, s.free ? (t: number) => s.radius * brushTaper(t) : s.radius, { seg: 10, flatten: 0.42 })
  })

  const gltf = buildGltf(prims, materials, nodes)
  // The viewer needs the plate radius to turn a dragged scene position back into
  // the frame coordinates the spec stores.
  return { gltf, parts: nodes.length, materials: materials.length, plateRadius: R }
}
