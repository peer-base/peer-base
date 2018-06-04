'use strict'

const IPFS = require('ipfs')
const WebSocketStar = require('libp2p-websocket-star')
const AppTransport = require('./app-transport')

module.exports = (app, options) => {
  const ipfs = new IPFS({
    repo: options && options.repo,
    EXPERIMENTAL: {
      pubsub: true
    },
    config: {
      Addresses: {
        Swarm: (options && options.swarm) || [
          '/dns4/ws-star1.par.dwebops.pub/tcp/443/wss/p2p-websocket-star'
        ]
      }
    },
    libp2p: { modules }
  })

  return ipfs

  function modules (peerInfo) {
    const appTransport = AppTransport(app.name, ipfs, new WebSocketStar({ id: peerInfo.id }))
    appTransport.on('error', (err) => app.emit('error', err))

    return {
      transport: [ appTransport ],
      discovery: [ appTransport.discovery ]
    }
  }
}
