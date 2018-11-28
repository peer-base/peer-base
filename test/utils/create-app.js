'use strict'

const PeerStar = require('../../')
const Repo = require('./repo')
const delay = require('delay')

const SWARM = [ '/ip4/127.0.0.1/tcp/9090/ws/p2p-websocket-star' ]

module.exports = (appName, transportOptions = {}, ipfsOptions = {}) => {
  if (!appName) {
    throw new Error('need app name')
  }

  let repo = ipfsOptions.repo

  if (!repo) {
    repo = Repo()
  } else {
    // console.log('using given repo')
  }

  ipfsOptions = Object.assign({
    repo,
    swarm: SWARM
  }, ipfsOptions)

  const app = PeerStar(appName, {
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
}

module.exports.swarm = SWARM

module.exports.createName = () => {
  return PeerStar.generateRandomName()
}

/*
process.on('uncaughtException', (err) => {
  console.error('uncaught error:', err)
})
*/
