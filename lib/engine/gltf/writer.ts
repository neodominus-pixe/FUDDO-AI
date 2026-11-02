import type { GltfNode, MaterialDef, Prim } from './types'

export type View = { buffer: 0; byteOffset: number; byteLength: number; target: number }

export function pad4(n: number) {
  return (4 - (n % 4)) % 4
}

export function buildGltf(prims: Array<Prim | undefined>, materials: MaterialDef[], nodes: GltfNode[]) {
  const chunks: Uint8Array[] = []
  const views: View[] = []
  const accessors: Record<string, unknown>[] = []
  let offset = 0

  const push = (bytes: Uint8Array, target: number) => {
    chunks.push(bytes)
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target })
    offset += bytes.byteLength
    const p = pad4(offset)
    if (p) {
      chunks.push(new Uint8Array(p))
      offset += p
    }
    return views.length - 1
  }

  // Only geometry something actually stands on gets written. The library holds
  // every shape the pipeline knows how to make; a given plate uses a handful, and
  // uploading the rest put a few hundred KB of unreachable vertices into the
  // response for every single model.
  const used = new Set(nodes.map((n) => n.prim))
  const primAccessors = prims.map((prim, i) => {
    if (!prim || !used.has(i)) return null
    const posView = push(new Uint8Array(prim.positions.buffer.slice(0)), 34962)
    const nrmView = push(new Uint8Array(prim.normals.buffer.slice(0)), 34962)
    const idxView = push(new Uint8Array(prim.indices.buffer.slice(0)), 34963)
    // Four normalised bytes rather than three floats: a quarter of the size, and
    // 256 steps is more than a tint needs.
    const colView = prim.colors ? push(new Uint8Array(prim.colors.buffer.slice(0)), 34962) : -1

    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (let i = 0; i < prim.positions.length; i += 3) {
      minX = Math.min(minX, prim.positions[i]); maxX = Math.max(maxX, prim.positions[i])
      minY = Math.min(minY, prim.positions[i + 1]); maxY = Math.max(maxY, prim.positions[i + 1])
      minZ = Math.min(minZ, prim.positions[i + 2]); maxZ = Math.max(maxZ, prim.positions[i + 2])
    }

    const pos = accessors.push({
      bufferView: posView, componentType: 5126, count: prim.positions.length / 3, type: 'VEC3',
      min: [minX, minY, minZ], max: [maxX, maxY, maxZ],
    }) - 1
    const nrm = accessors.push({
      bufferView: nrmView, componentType: 5126, count: prim.normals.length / 3, type: 'VEC3',
    }) - 1
    const ind = accessors.push({
      bufferView: idxView, componentType: 5123, count: prim.indices.length, type: 'SCALAR',
    }) - 1
    const col =
      colView < 0
        ? undefined
        : accessors.push({
            bufferView: colView, componentType: 5121, normalized: true,
            count: prim.colors!.length / 4, type: 'VEC4',
          }) - 1
    return { pos, nrm, ind, col }
  })

  // One mesh per (geometry, material) pair actually used.
  const meshKey = new Map<string, number>()
  const meshes: Record<string, unknown>[] = []
  const gltfNodes = nodes.map((n) => {
    const key = `${n.prim}/${n.material}`
    let mesh = meshKey.get(key)
    if (mesh === undefined) {
      const a = primAccessors[n.prim]
      if (!a) throw new Error(`Node "${n.name ?? '?'}" asks for primitive ${n.prim}, which the shape library does not have.`)
      mesh = meshes.push({
        primitives: [
          {
            attributes: a.col === undefined
              ? { POSITION: a.pos, NORMAL: a.nrm }
              : { POSITION: a.pos, NORMAL: a.nrm, COLOR_0: a.col },
            indices: a.ind,
            material: n.material,
          },
        ],
      }) - 1
      meshKey.set(key, mesh)
    }
    return {
      mesh,
      translation: n.translation,
      scale: n.scale,
      ...(n.rotation ? { rotation: n.rotation } : {}),
      ...(n.name ? { name: n.name } : {}),
      ...(n.extras ? { extras: n.extras } : {}),
    } as Record<string, unknown>
  })

  // Attached nodes are listed by their parent and not by the scene, or they get
  // added twice and the transform is applied to them twice with it.
  nodes.forEach((n, i) => {
    if (n.parent === undefined) return
    const p = gltfNodes[n.parent]
    const kids = (p.children as number[] | undefined) ?? []
    kids.push(i)
    p.children = kids
  })
  const roots = gltfNodes.map((_, i) => i).filter((i) => nodes[i].parent === undefined)

  const total = new Uint8Array(offset)
  let at = 0
  for (const c of chunks) {
    total.set(c, at)
    at += c.byteLength
  }

  return {
    asset: { version: '2.0', generator: 'plating-studio mock 3d provider' },
    scene: 0,
    scenes: [{ nodes: roots }],
    nodes: gltfNodes,
    meshes,
    materials: materials.map((m) => ({
      pbrMetallicRoughness: {
        baseColorFactor: m.color,
        metallicFactor: m.metallic,
        roughnessFactor: m.roughness,
      },
      // Glass: seen through, and from both sides, since the far wall of a glass is as much of it as the near one.
      ...(m.color[3] < 1 ? { alphaMode: 'BLEND', doubleSided: true } : {}),
    })),
    accessors,
    bufferViews: views,
    buffers: [
      {
        byteLength: offset,
        uri: `data:application/octet-stream;base64,${Buffer.from(total).toString('base64')}`,
      },
    ],
  }
}
