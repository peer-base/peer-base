'use strict'

const CID = require('cids')

const debug = require('debug')('peer-star:persister:naming')

const defaultOptions = {}

module.exports = class Naming {
  constructor (collabName, ipfs, options) {
    this.collabName = collabName
    this._ipfs = ipfs
    this._options = Object.assign({}, defaultOptions, options)
    if (!this._options.ipfs.pass) throw new Error('A key passphrase must be supplied for IPNS')
    if (!this._options.ipns) throw new Error('An IPNS config must be supplied')
    if (!this._options.ipns.key) throw new Error('A key must be supplied for IPNS')
    // Note: ECDSA keys don't seem to have an export function
    if (!this._options.ipns.key.export) throw new Error('A key that has an export() function must be supplied for IPNS')
  }

  async start () {
    await new Promise(resolve => {
      this._ipfs.isOnline() ? resolve() : this._ipfs.once('ready', resolve)
    })

    // Check if the key has been imported
    const keys = await this._ipfs.key.list()
    const keyName = this._getKeyName()
    this._key = keys.find(k => k.name === keyName)
    if (this._key) {
      debug('Key has been imported already:', this._key)
      return
    }

    // No key found, we need to export out key to pem and then import it into
    // ipfs
    debug('Key %s not found, generating pem for import', keyName)
    const pem = await new Promise((resolve, reject) => {
      this._options.ipns.key.export(this._options.ipfs.pass, (err, pem) => {
        if (err) {
          return reject(err)
        }
        resolve(pem)
      })
    })
    debug('Importing pem for key %s', keyName)
    this._key = await this._ipfs.key.import(keyName, pem, this._options.ipfs.pass)
    debug('Import complete:', this._key)
  }

  stop () {
    // Note: IPFS should be stopped by the process that passed it to this class
  }

  _getKeyName () {
    return 'peer-star-app.naming.' + this.collabName
  }

  async fetch () {
    try {
      const res = await this._ipfs.name.resolve(this._key.id)
      if ((res || {}).path) {
        debug('Fetched HEAD: %s', res.path)
        return new CID(res.path.replace('/ipfs/', ''))
      }
      return undefined
    } catch (e) {
      if (e.code === 'ERR_NO_LOCAL_RECORD_FOUND') {
        return undefined
      }
      throw e
    }
  }

  async update (cid) {
    debug('Updating HEAD to %s', cid.toBaseEncodedString())
    await this._ipfs.name.publish(cid, {
      resolve: false,
      key: this._getKeyName()
    })
    debug('Done - Updated HEAD to %s', cid.toBaseEncodedString())
  }
}
