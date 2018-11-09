const Color = require('./color')

class InfoBox {
  constructor(options) {
    this.options = options
  }

  addMessage(leader, msg, filled = true) {
    const now = Date.now()
    const elapsed = this.lastMessageAt && now - this.lastMessageAt
    this.lastMessageAt = now

    const infoBox = d3.select('.info')
    const item = infoBox.insert('div', ':first-child').attr('class', 'item')
    const message = item.append('span').attr('class', 'message')
    if (leader) {
      const circle = message.append('svg').append('circle')
        .attr('r', this.options.nodeRadius / 2)
        .attr('transform', `translate(${this.options.nodeRadius * 0.7}, ${this.options.nodeRadius * 0.7})`)
        .style('fill', filled ? Color.getColor(leader.b58) : 'transparent')
      if (!filled) {
        circle.style('stroke', Color.getColor(leader.b58))
        circle.style('stroke-width', 2)
      }
    }
    message.append('span').attr('class', 'text').text(msg)

    if (elapsed) {
      const timeMsg = elapsed > 1000 ? (elapsed / 1000) + 's' : elapsed + 'ms'
      item.append('span').attr('class', 'time').text(`+${timeMsg}`)
    }
  }
}

module.exports = InfoBox
