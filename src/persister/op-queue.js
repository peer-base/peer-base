'use strict'

// Maintains a queue of DELTA and SNAPSHOT operations
class OpQueue {
  constructor () {
    this.counter = 0
    this.queue = []
  }

  length () {
    return this.queue.length
  }

  // Printable array of "id: type"
  ops () {
    return this.queue.map(i => i.id + ': ' + i.type)
  }

  pushTailDelta (clock, delta) {
    this.queue.push({
      type: 'DELTA',
      id: this.counter++,
      data: { clock, delta }
    })
  }

  pushHeadSnapshot () {
    this.queue.unshift({
      type: 'SNAPSHOT',
      id: this.counter++
    })
  }

  peekHead () {
    return this.queue[0]
  }

  dupHead () {
    const head = this.peekHead()
    if (head) {
      const dup = {
        type: head.type,
        id: this.counter++, // Note: don't dup ID
        data: head.data
      }
      this.queue.unshift(dup)
    }
  }

  remove (id) {
    const index = this.queue.findIndex(i => i.id === id)
    if (index >= 0) {
      this.queue.splice(index, 1)
    }
  }
}

module.exports = OpQueue
