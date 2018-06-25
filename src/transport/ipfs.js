'use strict'

const IPFS = require('ipfs')
const WebSocketStar = require('libp2p-websocket-star')
const AppTransport = require('./app-transport')

module.exports = (app, options) => {
  const ipfs = new IPFS({
    repo: options && options.ipfs && options.ipfs.repo,
    EXPERIMENTAL: {
      pubsub: true
    },
    config: {
      Addresses: {
        Swarm: (options && options.ipfs && options.ipfs.swarm) || [
          '/dns4/ws-star1.par.dwebops.pub/tcp/443/wss/p2p-websocket-star'
        ]
      }
    },
    libp2p: { modules }
  })

  return ipfs

  function modules (peerInfo) {
    const appTransport = AppTransport(app, ipfs, new WebSocketStar({ id: peerInfo.id }), options && options.transport)
    appTransport.on('error', (err) => app.emit('error', err))
    appTransport.on('peer connected', (peerInfo) => app.emit('peer connected', peerInfo))
    appTransport.on('outbound peer connected', (peerInfo) => app.emit('outbound peer connected', peerInfo))
    appTransport.on('inbound peer connected', (peerInfo) => app.emit('inbound peer connected', peerInfo))
    appTransport.on('peer disconnected', (peerInfo) => app.emit('peer disconnected', peerInfo))
    appTransport.on('outbound peer disconnected', (peerInfo) => app.emit('outbound peer disconnected', peerInfo))
    appTransport.on('inbound peer disconnected', (peerInfo) => app.emit('inbound peer disconnected', peerInfo))

    return {
      transport: [ appTransport ],
      discovery: [ appTransport.discovery ]
    }
  }
}
