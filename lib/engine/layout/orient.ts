// How a piece is turned: about the vertical axis by its own yaw, then leaned from upright by a tilt, so a leaf lies at an
// angle on a dome and a steak rests against the puree beside it. `tilt` is [about X, about Z] in degrees, in the plate's
// own frame (not the piece's), so a lean towards a neighbour means the same thing whichever way the piece itself points.
// One function, used by the model builder and by the live scene, so the two cannot disagree.
export type Tilt = readonly [number, number]

type Quat = [number, number, number, number]

const mul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]

const about = (axis: 0 | 1 | 2, deg: number): Quat => {
  const h = (deg * Math.PI) / 360
  const q: Quat = [0, 0, 0, Math.cos(h)]
  q[axis] = Math.sin(h)
  return q
}

/** The rotation as a quaternion [x, y, z, w]: yaw first, then the lean about X, then about Z. */
export function orient(yawDeg: number, tilt?: Tilt): Quat {
  const yaw = about(1, yawDeg)
  if (!tilt || (tilt[0] === 0 && tilt[1] === 0)) return yaw
  return mul(about(2, tilt[1]), mul(about(0, tilt[0]), yaw))
}
