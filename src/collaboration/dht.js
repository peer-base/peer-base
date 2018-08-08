'use strict'

const encode = require('../common/encode')
const signAndEncrypt = require('../common/sign-and-encrypt')

class DHT {
  constructor (ipfs, collaboration, keys) {
    this._ipfs = ipfs
    this._collaboration = collaboration
    this._keys = keys
  }

  async save () {
    const peerId = (await this._ipfs.id()).id
    const name = [
      encodeURIComponent(this._collaboration.app.name),
      encodeURIComponent(this._collaboration.name),
      peerId
    ].join('-')
    console.log('key:', name)
    const key = Buffer.from(name)
    const doc = {
      state: this._collaboration.shared.state(),
      peers: this._collaboration.peers()
    }
    const encodedDoc = encode(doc)
    const signedAndEncryptedDoc = await signAndEncrypt(this._keys, encodedDoc)
    await this._ipfs.dht.put(key, signedAndEncryptedDoc)
    const got = await this._ipfs.dht.get(key)
    console.log('GOT:', got)
    return key
  }

  async restore (name) {
    const rec = await this._ipfs.dht.get(name)
    console.log('rec:', rec)
  }
}

module.exports = DHT
