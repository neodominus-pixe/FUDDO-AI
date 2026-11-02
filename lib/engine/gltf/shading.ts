import { phases } from './helpers'
import type { Prim } from './types'

// Shading baked into the geometry, from the geometry.
//
// Every component used to be one flat PBR colour, which is what made a plate
// read as coloured plasticine: real food is darker where it meets what it is
// sitting on, browner where the heat reached it, and never perfectly even.
//
// `contact` darkens the underside, `brown` warms and darkens whatever faces up,
// `mottle` breaks up the rest. Applied to the shape rather than to the element,
// so it costs nothing per plate and is cached with the rest of the library.
export function shade(
  prim: Prim,
  {
    contact = 0.3,
    brown = 0,
    mottle = 0.05,
    char = 0,
    charBars = 3.4,
    seed = 1,
    warm = [0.98, 0.7, 0.44] as [number, number, number],
  } = {},
): Prim {
  const { positions: pos, normals: nrm } = prim
  const out = new Uint8Array((pos.length / 3) * 4)
  const enc = (v: number) => Math.round(Math.pow(Math.min(1, Math.max(0, v)), 2.2) * 255)
  const ph = phases(seed, 2654435761, 6)
  for (let i = 0, v = 0; i < pos.length; i += 3, v += 4) {
    const [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]]
    // Underside first: 0 at the base of the shape, 1 by a fifth of the way up.
    const lift = Math.min(1, Math.max(0, (y + 1) / 0.8))
    let f = 1 - contact * (1 - lift * lift)
    // Then the mottle, which has to be smooth in space or it reads as noise
    // rather than as a surface.
    f *=
      1 +
      mottle *
        (Math.sin(3.1 * x + ph[0]) * Math.sin(2.7 * y + ph[1]) +
          0.6 * Math.sin(5.3 * z + ph[2]) * Math.sin(4.1 * x + ph[3]))
    // Bars off a grill: dark where the bar touched, and only on the side that
    // faced it. The cheapest possible cue that something was cooked over fire.
    if (char) {
      const bar = Math.pow(Math.max(0, Math.cos(charBars * Math.PI * x + ph[4])), 6)
      f *= 1 - char * bar * Math.max(0, nrm[i + 1])
    }
    let [r, g, b] = [f, f, f]
    if (brown) {
      // Only what the pan or the oven could actually reach: high on the shape,
      // and facing up. The sides still take some of it -- a crust does not stop
      // dead at the equator of a bun -- so the up term never falls to zero.
      const up = 0.4 + 0.6 * Math.max(0, nrm[i + 1])
      const k = brown * up * Math.min(1, Math.max(0, (y + 0.3) / 1.3))
      r *= 1 - k * (1 - warm[0])
      g *= 1 - k * (1 - warm[1])
      b *= 1 - k * (1 - warm[2])
    }
    // Written out in linear space, which is not the space any of the numbers
    // above were chosen in. A linear multiplier of 0.7 is only a 15% drop on
    // screen -- the first pass at this was mathematically correct and completely
    // invisible. Everything above reads as it will look; the conversion happens
    // here, once.
    out[v] = enc(r)
    out[v + 1] = enc(g)
    out[v + 2] = enc(b)
    out[v + 3] = 255
  }
  return { ...prim, colors: out }
}
