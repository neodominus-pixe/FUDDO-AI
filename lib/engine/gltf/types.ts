// `colors` is an optional per-vertex tint, multiplied against the material's own
// colour by the renderer. Never brighter than white: it is there to darken --
// into contact shadows, into browning, into the mottling that stops a surface
// reading as moulded plastic -- so one shape can serve a potato and a tomato.
export type Prim = {
  positions: Float32Array
  normals: Float32Array
  indices: Uint16Array
  colors?: Uint8Array
}

export type GltfNode = {
  prim: number
  material: number
  translation: [number, number, number]
  scale: [number, number, number]
  // Quaternion. Leaves all pointing the same way is an instant giveaway, and
  // turning the lumpy blobs stops repeated shape variants reading as clones.
  rotation?: [number, number, number, number]
  // Index of the node this one hangs off, if any. A crust is a child of the
  // piece it covers so that it inherits its transform: dragging the food has to
  // take its own browned surface with it, and clicking the top of a duck breast
  // has to select the duck breast.
  parent?: number
  name?: string
  // glTF `extras` survives into three.js as Object3D.userData. Element identity
  // rides along here so the viewer can tell which blob was grabbed, while `name`
  // stays human-readable for anyone opening the download in Blender.
  extras?: Record<string, unknown>
}

// Geometry is uploaded once per primitive and reused by every node that needs
// it, so a plate of twenty elements is still only three sets of vertices.
// Glazed ceramic, seared meat and a pool of sauce reflect light very
// differently; one shared roughness makes everything look like the same plastic.
export type MaterialDef = {
  color: [number, number, number, number]
  roughness: number
  metallic: number
}
