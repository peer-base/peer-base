'use strict'

const bs58 = require('bs58')

module.exports = class FakePeerInfo {
  constructor (id) {
    if (!Buffer.isBuffer(id)) {
      id = Buffer.from(id)
    }
    this.id = {
      toBytes () {
        return id
      },
      toB58String () {
        return bs58.encode(id)
      }
    }

    const addresses = []

    this.multiaddrs = {
      add (ma) {
        addresses.push(ma)
      },
      toArray () {
        return addresses
      },
      has (ma) {
        return addresses.indexOf(ma) >= 0
      },
      delete (ma) {
        const index = addresses.indexOf(ma)
        if (index >= 0) {
          addresses.splice(index, 1)
        }
      }
    }
  }
}
