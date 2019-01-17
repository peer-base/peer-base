'use strict'

const PeerBase = require('../../')
const Repo = require('./repo')
const delay = require('delay')
const PeerIds = require('./peer-ids')

const SWARM = [ '/ip4/127.0.0.1/tcp/9090/ws/p2p-websocket-star' ]

module.exports = (appName) => {
  const peerIds = PeerIds()
  return Object.assign((transportOptions = {}, ipfsOptions = {}) => {
    if (!appName) {
      throw new Error('need app name')
    }

    let repo = ipfsOptions.repo

    if (!repo) {
      repo = Repo()
    }

    ipfsOptions = Object.assign({
      repo,
      swarm: SWARM,
      init: peerIds()
    }, ipfsOptions)

    const app = PeerBase(appName, {
      ipfs: ipfsOptions,
      transport: transportOptions
    })

    /*
    app.on('error', (err) => {
      console.warn(err)
    })
    */

    const start = () => app.start()

    const stop = () => {
      return delay(2000) // to avoid race conditions with pending operations
        .then(() => app.stop())
        .then(() => repo.teardown())
        .catch(() => repo.teardown())
    }

    return { app, start, stop }
  }, {
    init: () => peerIds()
  })
}

module.exports.swarm = SWARM

module.exports.createName = () => {
  return PeerBase.generateRandomName()
}

/*
process.on('uncaughtException', (err) => {
  console.error('uncaught error:', err)
})
*/
