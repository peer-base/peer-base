'use strict'

const PeerStar = require('../../')
const Repo = require('./repo')

const APP_NAME = 'peer star test app'
const SWARM = [ '/ip4/127.0.0.1/tcp/9090/ws/p2p-websocket-star' ]

module.exports = (transportOptions, ipfsOptions) => {
  const repo = Repo()

  ipfsOptions = Object.assign({
    repo,
    swarm: SWARM
  }, ipfsOptions)

  const app = PeerStar(APP_NAME, {
    ipfs: ipfsOptions,
    transport: transportOptions
  })

  const start = () => app.start()

  const stop = () => {
    return app.stop()
      .then(() => repo.teardown())
      .catch(() => repo.teardown())
  }

  return { app, start, stop }
}

module.exports.appName = APP_NAME
module.exports.swarm = SWARM
