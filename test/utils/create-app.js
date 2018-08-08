'use strict'

const PeerStar = require('../../')
const Repo = require('./repo')

module.exports = (transportOptions, ipfsOptions) => {
  const repo = Repo()

  ipfsOptions = Object.assign({
      repo,
      swarm: [ '/ip4/127.0.0.1/tcp/9090/ws/p2p-websocket-star' ],
      bootstrap: require('./bootstrap-nodes')
    }, ipfsOptions)

  const app = PeerStar('peer star test app', {
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
