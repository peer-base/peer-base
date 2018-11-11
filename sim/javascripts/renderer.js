const Ring = require('../../src/common/ring')
const Color = require('./color')
const Trig = require('./trig')
const { LayoutType } = require('./layout')

class Renderer {
  constructor(network, showDiasConnections, options) {
    this.network = network
    this.layoutMode = LayoutType.Evenly
    this.showDiasConnections = showDiasConnections
    this.options = options
  }

  peerChanged() {
    const unorderedPeers = this.network.peers
    const ring = Ring(this.options.preambleByteCount)
    for (const p of unorderedPeers) {
      ring.add(p.peerInfo)
    }

    let peers = []
    const first = unorderedPeers[0]
    if (first) {
      peers = [first]
      let current = ring.successorOf(first.peerInfo)
      while (current !== first.peerInfo) {
        peers.push(unorderedPeers.find(i => i.peerInfo === current))
        current = ring.successorOf(current)
      }
    }
    peers.forEach((p, i) => {
      p.outbound = p.diasSet(ring)
      p.color = Color.getColor(p.b58)
    })
    peers.forEach(po => {
      po.inboundCount = peers.filter(pi => pi !== po && pi.outbound.has(po.peerInfo)).length
    })

    const connectionsUnflat = peers.map(p => {
      return [...p.outbound].map(toPeerKey => {
        const to = peers.find(i => i.peerInfo.id.toBytes().toString('hex') === toPeerKey)
        return { from: p, to }
      })
      .filter(i => i.from !== i.to)
    })

    this.diasSetConnections = [].concat(...connectionsUnflat)
    this.peers = peers

    this.setLayoutMode(this.layoutMode)
  }

  messageGenerated() {
    this.messages = [...this.network.messages.values()]
    this.renderMessages()
  }

  setLayoutMode(layoutMode) {
    this.highlightedPeer = null
    const canvas = d3.select('#canvas')
    this.layout = new layoutMode(canvas, this.peers, this.options)
    this.peers.forEach(p => {
      p.pos = this.layout.getPos(p)
    })

    this.renderNodes()
    this.renderDiasSetConnections()
  }

  setShowDiasConnections(show) {
    this.showDiasConnections = show
    this.renderDiasSetConnections()
  }

  renderNodes() {
    const canvas = d3.select('#canvas-nodes')
    const node = canvas.selectAll('.node').data(this.peers, p => p.b58)

    // node enter
    const nodeEnter = node.enter().append('g')
      .classed('node', true)
      .attr('id', p => 'node-' + p.b58)
      .attr("transform", p => `translate(${p.pos})`)
      .on('mouseenter', p => {
        this.highlightedPeer = p
        this.renderDiasSetConnections()
        this.showCloseButton(p)
      })
      .on('mouseleave', p => {
        this.highlightedPeer = null
        this.renderDiasSetConnections()
        this.hideCloseButton(p)
      })
    nodeEnter.append("circle").classed('main-circle', true)
      .attr("r", this.options.nodeRadius)
      .style("fill", d => d.running ? d.color: '#999')
    nodeEnter.append('text')
      .text(d => d.inboundCount)
      .style('stroke', 'white')
      .style('fill', 'white')
      .style('font-size', '0.8em')
      .style('font-weight', 200)
      .attr('dx', -5)
      .attr('dy', 5)


    // member
    const member = node.selectAll('.member').data(d => d.getMemberPeers(), m => m.b58)

    // member enter
    const nodeRadius = this.options.nodeRadius
    const memberEnter = member.enter().append('g').classed('member', true)
      .attr('transform', (m, i) => `translate(${ (i + 1) * nodeRadius}, ${nodeRadius})`)
    memberEnter.append('circle')
      .attr("r", nodeRadius / 3)
      .style("fill", m => m.color)
    memberEnter.append('line')
      .style('stroke', m => m.leader ? m.color : 'transparent')
      .attr('x1', m => -nodeRadius / 2 + 2)
      .attr('y1', m => nodeRadius / 3 + 3)
      .attr('x2', m => nodeRadius / 2 - 2)
      .attr('y2', m => nodeRadius / 3 + 3)

    // member update
    member
      .attr('transform', (m, i) => `translate(${ (i + 1) * nodeRadius}, ${nodeRadius})`)
    member.select('line')
      .style('stroke', m => m.leader ? m.color : 'transparent')

    // member exit
    member.exit().remove()


    // node update
    node.attr("transform", d => `translate(${d.pos})`)
    node.selectAll('.main-circle').style("fill", d => d.running ? d.color: '#999')
    node.selectAll('text').text(d => d.inboundCount)

    // node exit
    node.exit().remove()
  }

  showCloseButton(p) {
    const cross = d3.symbol()
      .type(d3.symbolCross)
      .size(60)
    const closeContainer = d3.select('#node-' + p.b58).append('g').classed('close-container', true)
    // We need to draw a rectangle behind the node so that when the mouse is
    // moved over to the close icon it doesn't leave the mouseover area
    const nodeRadius = this.options.nodeRadius
    closeContainer.append('rect')
      .attr('width', nodeRadius * 3)
      .attr('height', nodeRadius * 3)
      .attr('x', -nodeRadius)
      .attr('y', -nodeRadius * 2)
      .style('fill', 'transparent')
    closeContainer.append('path').attr('d', cross)
      .attr('transform', `translate(${nodeRadius + 2}, -${nodeRadius + 2}) rotate(45)`)
      .on('click', () => {
        this.network.removePeer(p)
      })
  }

  hideCloseButton(p) {
    d3.select('#node-' + p.b58).selectAll('.close-container').remove()
  }

  renderMessages() {
    const nodeRadius = this.options.nodeRadius
    const canvas = d3.select('#canvas-messages')
    const message = canvas.selectAll('.message').data(this.messages, m => m.id)
    const messageEnter = message.enter().append('g').classed('message', true)
    messageEnter
      .attr('transform', m => `translate(${m.from.pos})`)
      .transition()
      .ease(d3.easeLinear)
      .duration(m => m.duration)
      .attrTween('transform', m => {
        return t => {
          // If the from or to node has been deleted, move message off the screen
          if (!m.from || !m.to) {
            return `translate(-1000, -1000)`
          }
          const pos = Trig.onLineProportional(m.from, m.to, t)
          return `translate(${pos})`
        }
      })
      .remove()
    messageEnter
      .append("circle")
      .attr("r", nodeRadius / 3)
      .attr('fill', 'transparent')
      .style('stroke', m => typeof m.message[1] === 'string' ? '#999' : 'transparent')
    messageEnter.selectAll('.members').data(d => {
      if (typeof d.message[1] === 'string') return []

      // TODO: get known peers from message itself?
      return [...(d.from.membership._members.keys())].map(k => ({ color: Color.getColor(k) }))
    }).enter()
      .append('circle')
      .classed('members', true)
      .attr('transform', function(p, i) { return `translate(${ (i + 1) * nodeRadius}, ${nodeRadius})` })
      .attr("r", nodeRadius / 3)
      .style("fill", p => p.color)
  }

  renderDiasSetConnections() {
    const nodeRadius = this.options.nodeRadius
    const lineColor = this.showDiasConnections ? '#ccc' : 'transparent'
    const highlightColor = (e) => !this.highlightedPeer || e.from === this.highlightedPeer ? lineColor : 'transparent'
    const arrowHeadSymbol = d3.symbol()
      .type(d3.symbolTriangle)
      .size(30)

    const canvas = d3.select('#canvas-edges')
    const arrow = canvas.selectAll(".arrow").data(this.diasSetConnections, e => e.from.b58 + e.to.b58 + highlightColor)
    applyLineUpdates(arrow.selectAll('line'))
    applyHeadUpdates(arrow.selectAll('path'))

    const arrowEnter = arrow.enter().append('g').classed('arrow', true)
    applyLineUpdates(arrowEnter.append('line'))
    applyHeadUpdates(arrowEnter.append('path').attr('d', arrowHeadSymbol))

    arrow.exit().remove()

    function applyLineUpdates(line) {
      line.style('stroke', highlightColor)
      .attr('x1', d => Trig.onLine(d.from, d.to, nodeRadius)[0])
      .attr('y1', d => Trig.onLine(d.from, d.to, nodeRadius)[1])
      .attr('x2', d => Trig.onLine(d.from, d.to, nodeRadius, false)[0])
      .attr('y2', d => Trig.onLine(d.from, d.to, nodeRadius, false)[1])
    }
    function applyHeadUpdates(head) {
      head.attr('fill', highlightColor)
      .attr('transform', d => {
        const pos = Trig.onLine(d.from, d.to, nodeRadius + 5, false)
        const a = (Trig.angle(d.from, d.to) - Math.PI / 6) * 180 / Math.PI
        return `translate(${pos}) rotate(${a})`
      })
    }
  }
}

module.exports = Renderer
