const DefaultOptions = {
  paddingY: 20,
  nodeRadius: 10
}

class Layout {
  constructor(canvas, options) {
    this.canvas = canvas
    this.options = options
    for (name in DefaultOptions) {
      if (!this.options[name]) {
        this.options[name] = DefaultOptions[name]
      }
    }
  }

  getCenter() {
    return [this.getWidth() / 2, this.options.paddingY + this.getHeight() / 2]
  }

  getHeight() {
    return this.canvas.node().getBoundingClientRect().height - (this.options.paddingY * 2)
  }

  getWidth() {
    return this.canvas.node().getBoundingClientRect().width
  }

  getRadius() {
    return Math.min(this.getHeight(), this.getWidth()) / 2
  }
}

class EvenlyLayout extends Layout {
  constructor(canvas, peers, options) {
    super(canvas, options)
    this.peers = peers
  }

  getPos(peer) {
    const i = this.peers.findIndex(p => p.b58 === peer.b58)
    const center = this.getCenter()
    const radius = this.getRadius() - this.options.nodeRadius
    const x = center[0] + radius * Math.cos(i * 2 * Math.PI / this.peers.length - Math.PI / 2)
    const y = center[1] + radius * Math.sin(i * 2 * Math.PI / this.peers.length - Math.PI / 2)
    return [x, y]
  }
}

class OrganicLayout extends Layout {
  constructor(canvas, peers, options) {
    super(canvas, options)
    this.peers = peers
  }

  getPos(peer) {
    const bytes = peer.peerInfo.id.toBytes().slice(this.options.preambleByteCount)
    const proportion = bytes.readUInt32BE() / Math.pow(2, this.options.peerIdByteCount)
    const angle = 2 * Math.PI * proportion - Math.PI / 2
    const center = this.getCenter()
    const radius = this.getRadius() - this.options.nodeRadius
    const x = center[0] + radius * Math.cos(angle)
    const y = center[1] + radius * Math.sin(angle)
    return [x, y]
  }
}

const LayoutType = {
  Evenly: EvenlyLayout,
  Organic: OrganicLayout
}

module.exports = {
  LayoutType,
  Layout,
  EvenlyLayout,
  OrganicLayout
}
