const Trig = {
  angle(from, to) {
    const dx = to.pos[0] - from.pos[0]
    const dy = to.pos[1] - from.pos[1]
    const signx = dx < 0 ? -1 : 1
    const signy = dy < 0 ? -1 : 1
    let angle = Math.atan(Math.abs(dy / dx))
    if (dx < 0) {
      if (dy < 0) {
        angle = Math.PI + angle
      } else {
        angle = Math.PI - angle
      }
    } else if (dy < 0) {
      angle = 2 * Math.PI - angle
    }
    return angle
  },

  onLine(from, to, howFarPx, fromStart = true) {
    const a = Trig.angle(from, to)
    const dx = to.pos[0] - from.pos[0]
    const dy = to.pos[1] - from.pos[1]
    const distance = fromStart ? howFarPx : Math.sqrt(dx * dx + dy * dy) - howFarPx
    const relx = Math.cos(a) * distance
    const rely = Math.sin(a) * distance
    return [from.pos[0] + relx, from.pos[1] + rely]
  },

  onLineProportional(from, to, proportion, fromStart = true) {
    const a = Trig.angle(from, to)
    const dx = to.pos[0] - from.pos[0]
    const dy = to.pos[1] - from.pos[1]
    const total = Math.sqrt(dx * dx + dy * dy)
    const howFarPx = total * proportion
    const distance = fromStart ? howFarPx : total - howFarPx
    const relx = Math.cos(a) * distance
    const rely = Math.sin(a) * distance
    return [from.pos[0] + relx, from.pos[1] + rely]
  }
}
module.exports = Trig
