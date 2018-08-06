'use strict'

const IPFS = require('ipfs')
const WebSocketStar = require('libp2p-websocket-star')
const WebSockets = require('libp2p-websockets')
const Bootstrap = require('libp2p-bootstrap')
const AppTransport = require('./app-transport')
const Relay = require('./ipfs-relay')

module.exports = (app, options) => {
  const ipfsOptions = {
    repo: options && options.repo,
    EXPERIMENTAL: {
      pubsub: true
    },
    config: {
      Addresses: {
        Swarm: (options && options.swarm) || ['/dns4/ws-star1.par.dwebops.pub/tcp/443/wss/p2p-websocket-star']
      },
      Bootstrap: options.bootstrap
    },
    libp2p: {
      modules,
      config: {
        peerDiscovery: {
          bootstrap: {
            enabled: true
          },
          websocketStar: {
            enabled: true
          }
        }
      }
    }
  }

  if (options.bootstrap) {
    ipfsOptions.config.Bootstrap = options.bootstrap
  }

  if (options.relay) {
    ipfsOptions.relay = {
      enabled: true, // enable relay dialer/listener (STOP)
      hop: {
        enabled: true // make this node a relay (HOP)
      }
    }
  }

  const ipfs = new IPFS(ipfsOptions)

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

    if (options && options.relay) {
      Relay(ipfs, appTransport, options.relay)
    }

    return {
      transport: [ appTransport, WebSockets ],
      peerDiscovery: [ appTransport.discovery, Bootstrap ]
    }
  }
}
