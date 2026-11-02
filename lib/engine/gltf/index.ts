// Minimal glTF 2.0 writer. Enough to emit a real, loadable model from primitive
// shapes -- the mock 3D provider uses it so the viewer exercises the same
// GLTFLoader path a paid image-to-3D service will return a file for.
//
// Layout of this folder (each file only imports from the ones above it):
//   types       Prim, GltfNode, MaterialDef
//   helpers     grid, seeding and normal-smoothing building blocks
//   shading     baked contact shadow, browning and mottle
//   profiles    lathe outlines for the rounded forms
//   primitives  sphere, cylinder, box, lathe, sweep and the generic solids
//   foliage     leaf, sprig, ruffle
//   forms       quenelle, baton, pod, roast
//   sheets      shell, folded, wedge, shard
//   built       ring, stack, skewer, sauce pool
//   piles       nest, pile, scoop, rubble, dust
//   writer      the binary glTF 2.0 assembler
export type { Prim, GltfNode, MaterialDef } from './types'
export { shade } from './shading'
export { DOME_PROFILE, BASE_PROFILE, DISC_PROFILE, PIZZA_PROFILE, CUT_PROFILE, SEED_PROFILE, PILLOW_PROFILE, CAP_PROFILE, POOL_PROFILE, STACK_BANDS } from './profiles'
export { prawn, lobster, crab, wholeFish } from './shellfish'
export { glass, liquidIn, vesselFor, type GlassKind } from './glassware'
export { cutSolid, type CutKind } from './cuts'
export { unitSphere, unitCylinder, unitBox, lathe, sweep, blobSphere, ball, shapedSolid } from './primitives'
export { leaf, sprig, ruffle } from './foliage'
export { quenelle, baton, pod, roast, bird } from './forms'
export { shell, folded, wedge, shard } from './sheets'
export { ring, stripe, stack, skewer, saucePool, pizzaSauce, melt } from './built'
export { nest, pile, scoop, grainHeap, rubble, dust } from './piles'
export { buildGltf } from './writer'
