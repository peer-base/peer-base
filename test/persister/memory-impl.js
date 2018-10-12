'use strict'

const multihashing = require('multihashing')
const CID = require('cids')

function simulateDelay (obj, fn, delay) {
  return function (...args) {
    return new Promise((resolve, reject) => {
      try {
        const res = fn.apply(obj, args)
        const invocationDelay = Math.random() * delay
        setTimeout(() => resolve(res), invocationDelay)
      } catch (e) {
        reject(e)
      }
    })
  }
}

class MemoryNaming {
  constructor (delay = 0) {
    this.fetch = simulateDelay(this, this.fetch, delay)
    this.update = simulateDelay(this, this.update, delay)
    this.objects = {}
  }
  start () {}
  stop () {}
  fetch () { return this.value }
  update (value) {
    this.value = value
  }
}

class MemoryPersistence {
  constructor (delay = 0) {
    this.fetch = simulateDelay(this, this.fetch, delay)
    this.save = simulateDelay(this, this.save, delay)
    this.objects = {}
  }
  start () {}
  stop () {}
  fetch (cid) {
    return this.objects[cid.toBaseEncodedString()]
  }
  async save (parentCid, clock, record) {
    const obj = { parent: parentCid, clock, record }
    const json = JSON.stringify({ parentCid, clock })
    const cid = new CID(multihashing(Buffer.from(json), 'sha1'))
    this.objects[cid.toBaseEncodedString()] = obj
    return cid
  }
}

module.exports = {
  MemoryPersistence,
  MemoryNaming
}
