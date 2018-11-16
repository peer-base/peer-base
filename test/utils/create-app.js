'use strict'

const PeerStar = require('../../')
const Repo = require('./repo')

const SWARM = [ '/ip4/127.0.0.1/tcp/9090/ws/p2p-websocket-star' ]

module.exports = (appName, transportOptions, ipfsOptions) => {
  const repo = Repo()

  ipfsOptions = Object.assign({
    repo,
    swarm: SWARM
  }, ipfsOptions)

  const app = PeerStar(appName, {
    ipfs: ipfsOptions,
    transport: transportOptions
  })

  app.on('error', (err) => {
    console.warn(err)
  })

  const start = () => app.start()

  const stop = () => {
    return app.stop()
      .then(() => repo.teardown())
      .catch(() => repo.teardown())
  }

  return { app, start, stop }
}

module.exports.swarm = SWARM

process.on('uncaughtException', (err) => {
  console.error('uncaught error:', err)
})
