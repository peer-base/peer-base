'use strict'

const PeerStar = require('../../')
const Repo = require('./repo')

module.exports = () => {
  const repo = Repo()

  const app = PeerStar('peer star test app', {
    ipfs: {
      repo,
      swarm: [ '/ip4/127.0.0.1/tcp/9090/ws/p2p-websocket-star' ]
    }
  })

  const start = () => app.start()

  const stop = () => {
    return app.stop().then(() => repo.teardown())
  }

  return { app, start, stop }
}
