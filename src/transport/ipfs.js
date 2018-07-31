'use strict'

const IPFS = require('ipfs')
const WebSocketStar = require('libp2p-websocket-star')
const WebSockets = require('libp2p-websockets')
const AppTransport = require('./app-transport')
const Relay = require('./ipfs-relay')

module.exports = (app, options) => {
  const ipfs = new IPFS({
    repo: options && options.repo,
    EXPERIMENTAL: {
      pubsub: true
    },
    relay: {
      enabled: true, // enable relay dialer/listener (STOP)
      hop: {
        enabled: true // make this node a relay (HOP)
      }
    },
    config: {
      Addresses: {
        Swarm: (options && options.swarm) || ['/dns4/ws-star1.par.dwebops.pub/tcp/443/wss/p2p-websocket-star']
      },
      Bootrtrap: []
      // Bootstrap: [
      //   '/dns4/ams-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLer265NRgSp2LA3dPaeykiS1J6DifTC88f5uVQKNAd',
      //   '/dns4/lon-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLMeWqB7YGVLJN3pNLQpmmEk35v6wYtsMGLzSr5QBU3',
      //   '/dns4/sfo-3.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLPppuBtQSGwKDZT2M73ULpjvfd3aZ6ha4oFGL1KrGM',
      //   '/dns4/sgp-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLSafTMBsPKadTEgaXctDQVcqN88CNLHXMkTNwMKPnu',
      //   '/dns4/nyc-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLueR4xBeUbY9WZ9xGUUxunbKWcrNFTDAadQJmocnWm',
      //   '/dns4/nyc-2.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLV4Bbm51jM9C4gDYZQ9Cy3U6aXMJDAbzgu2fzaDs64',
      //   '/dns4/node0.preload.ipfs.io/tcp/443/wss/ipfs/QmZMxNdpMkewiVZLMRxaNxUeZpDUb34pWjZ1kZvsd16Zic',
      //   '/dns4/node1.preload.ipfs.io/tcp/443/wss/ipfs/Qmbut9Ywz9YEDrz8ySBSgWyJk41Uvm2QJPhwDJzJyGFsD6'
      // ]
    },
    libp2p: { modules }
  })

  ipfs.once('ready', () => {
    ipfs.config.get().then((config) => {
      console.log('IPFS config:', config)
    })
    // options.ipfs.swarm.forEach((addr) => {
    //   console.log('connecting to', addr)
    //   ipfs.swarm.connect(addr, (err) => {
    //     if (err) {
    //       ipfs.emit('error', err)
    //     }
    //   })
    // })
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

    if (options && options.relay) {
      console.log('starting relay client with options:', options.relay)
      Relay(ipfs, appTransport, options.relay)
    }

    return {
      transport: [ appTransport, WebSockets ],
      peerDiscovery: [ appTransport.discovery ]
    }
  }
}
