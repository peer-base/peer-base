'use strict'

const IPFS = require('ipfs')
const WebSocketStar = require('libp2p-websocket-star')
const AppTransport = require('./app-transport')

module.exports = (appName, options) => {
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
    const appTransport = AppTransport(appName, new WebSocketStar({ id: peerInfo.id }))

    return {
      transport: [ appTransport ],
      discovery: [ appTransport.discovery ]
    }
  }
}
