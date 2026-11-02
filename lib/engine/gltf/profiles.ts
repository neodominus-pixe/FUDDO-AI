// A bun: crown on top, widest low down, flat on the base where it is cut.
export const DOME_PROFILE: Array<[number, number]> = [
  [0, 1.0], [0.32, 0.95], [0.56, 0.84], [0.76, 0.62], [0.9, 0.3],
  [0.98, -0.1], [1.0, -0.5], [0.98, -0.8], [0.93, -0.97], [0.5, -1.0], [0, -1.0],
]

// A bun base: cut side up, so flat on top, rounded below, and shallower than a
// crown. Using the crown profile for both halves made a burger look like two
// domes with filling trapped between them.
export const BASE_PROFILE: Array<[number, number]> = [
  [0, 1.0], [0.55, 0.99], [0.82, 0.95], [0.95, 0.82], [1.0, 0.55],
  [1.0, 0.0], [0.96, -0.45], [0.85, -0.78], [0.6, -0.95], [0.25, -1.0], [0, -1.0],
]

// A disc with softly rounded edges: patties, slices, anything cut flat.
export const DISC_PROFILE: Array<[number, number]> = [
  [0, 1.0], [0.48, 0.97], [0.76, 0.88], [0.93, 0.66], [1.0, 0.32],
  [1.0, -0.32], [0.93, -0.66], [0.76, -0.88], [0.48, -0.97], [0, -1.0],
]

// A pizza: a lower deck inside a raised, rounded crust, then the wall of the crust and the underside. The deck is
// where the sauce and toppings sit, so it is the same level the layout seats them at (DECK_LEVEL.pizza). It follows
// the hand-built model the viewer swaps in (public/models/pizza.glb), so the two agree where the toppings go.
export const PIZZA_PROFILE: Array<[number, number]> = [
  [0, -0.6], [0.55, -0.6], [0.76, -0.57], [0.82, -0.3], [0.86, 0.3], [0.91, 0.82], [0.96, 1.0], [1.0, 0.82],
  [1.0, 0.1], [1.0, -0.55], [0.95, -0.9], [0.6, -1.0], [0, -1.0],
]

// A slab of cooked protein: domed on top from the heat, nearly straight down the
// sides where it was cut, flat underneath where it sat in the pan. Scaled long
// and narrow it is a duck breast or a fillet; a blob is neither.
export const CUT_PROFILE: Array<[number, number]> = [
  [0, 1.0], [0.40, 0.95], [0.68, 0.85], [0.88, 0.64], [0.98, 0.30],
  [1.0, -0.20], [0.97, -0.62], [0.88, -0.88], [0.62, -0.99], [0.3, -1.0], [0, -1.0],
]

// A seed: a smooth flattened teardrop. Every other small shape in the library
// is deliberately lumpy, which at the size of a sesame seed reads as popcorn.
export const SEED_PROFILE: Array<[number, number]> = [
  [0, 1.0], [0.46, 0.9], [0.76, 0.66], [0.94, 0.3],
  [1.0, -0.12], [0.92, -0.56], [0.72, -0.85], [0.4, -0.99], [0, -1.0],
]

// Filled pasta: puffed where the filling sits, pressed thin at the edge where
// it was sealed. Ravioli, tortellini, agnolotti, and any dumpling.
export const PILLOW_PROFILE: Array<[number, number]> = [
  [0, 1.0], [0.46, 0.96], [0.72, 0.86], [0.88, 0.66], [0.97, 0.38], [1.0, 0.16],
  [1.0, -0.16], [0.97, -0.38], [0.88, -0.66], [0.72, -0.86], [0.46, -0.96], [0, -1.0],
]

// A mushroom: a domed cap that turns under at the rim, and a stalk beneath it.
// Nothing else on a plate has an undercut -- every other form in the library
// gets wider on the way down -- and that overhang, with the shadow it throws on
// its own stalk, is the entire read. A mushroom plated as a dome is a bread
// roll, which is what every roast girolle and grilled portobello here has been.
//
// One outline does all of it, because the profile is free to come back in: out
// across the crown, down past the rim, under it, and away down the stalk.
export const CAP_PROFILE: Array<[number, number]> = [
  [0, 1.0], [0.34, 0.97], [0.62, 0.90], [0.84, 0.76], [0.96, 0.56], [1.0, 0.38],
  // Under the rim. The radius falls away faster than the height does, which is
  // what makes it an overhang rather than a slope.
  [0.95, 0.26], [0.76, 0.20], [0.55, 0.17],
  // The stalk: narrow, a little waisted, flaring where it meets the plate.
  [0.34, 0.12], [0.27, -0.16], [0.25, -0.52], [0.28, -0.84], [0.33, -0.98], [0, -1.0],
]

// The surface of a liquid filled to the walls of what it was ladled into: a
// soup, a broth, a bowl of dal, a plate of curry.
//
// This used to borrow the pancake's disc, which cost it both of the things that
// make a liquid look like one. A disc is domed and rounded off at the rim, so a
// bowl of soup came out as a puck with a lid on it; and the disc is browned on
// its upper face, because a pancake is, so every pea and every vichyssoise
// arrived toasted on top.
//
// A liquid is level, it is bounded by the vessel and not by itself -- so the
// outline is a true circle, unlike every free-standing pool of sauce -- and it
// climbs the wall it is touching. That climb is the only shape it has.
export const POOL_PROFILE: Array<[number, number]> = [
  // Level across the middle, lifting in the last fifth where it meets the wall.
  // Deep-looking numbers for a shallow thing: the node scales this by a depth
  // far smaller than its radius, so a meniscus worth a couple of millimetres on
  // the plate has to be a fifth of the height of the mesh.
  [0, 0.78], [0.44, 0.79], [0.68, 0.82], [0.84, 0.88], [0.94, 0.95], [1.0, 1.0],
  [1.0, -1.0], [0.5, -1.0], [0, -1.0],
]

// A sandwich: slabs of bread with filling between them, cut corner to corner and
// stood on the cut so the strata face the room. Counting the layers is the whole
// read -- it is the only thing that tells a club sandwich from a slice of cake,
// which is exactly what one was coming out as.
//
// Bread, filling, bread, filling, bread, as thicknesses. The fillings are thin,
// and they are the ones that sit proud: what says "sandwich" at a glance is the
// lettuce and the ham hanging a little way out past the crust.
export const STACK_THICK = [1, 0.4, 0.78, 0.4, 1]

export const STACK_FILLING = [false, true, false, true, false]

// Where those fillings end up once the shape has been fitted into its unit box,
// so they can be darkened after shading: every element on a plate is one colour,
// so geometry alone will not carry a layer.
export const STACK_BANDS: Array<[number, number]> = (() => {
  const total = STACK_THICK.reduce((a, b) => a + b, 0)
  const out: Array<[number, number]> = []
  let y = 0
  for (let i = 0; i < STACK_THICK.length; i++) {
    if (STACK_FILLING[i]) out.push([(y / total) * 2 - 1, ((y + STACK_THICK[i]) / total) * 2 - 1])
    y += STACK_THICK[i]
  }
  return out
})()
