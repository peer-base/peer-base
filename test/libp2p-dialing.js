/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const Repo = require('./utils/repo')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const IPFS = require('ipfs')
const Libp2p = require('libp2p')
const WebSocketStar = require('libp2p-websocket-star')
const Multiplex = require('libp2p-mplex')
// const SECIO = require('libp2p-secio')
const EventEmitter = require('events')
const debug = require('debug')('dialing')

function createIpfs(options) {
  const ipfsOptions = {
    repo: Repo(),
    EXPERIMENTAL: {
      pubsub: false
    },
    config: {
      Addresses: {
        Swarm: ['/ip4/127.0.0.1/tcp/9090/ws/p2p-websocket-star']
      },
    },
    libp2p: createLibp2p
  }

  const ipfs = new IPFS(ipfsOptions)

  const peerId = () => ipfs._peerInfo.id.toB58String()
  let dbg

  const protocol = 'test-protocol'
  const peer = {
    ipfs,
    pushEnded: false,
    pullEnded: false,

    async stop () {
      dbg('stopping')
      await ipfs.stop()
      dbg('stopped')
    },

    handle (handler) {
      ipfs._libp2pNode.handle(protocol, handler)
    },
    
    dialProtocol(peerInfo) {
      const remotePeerId = peerInfo.id.toB58String()
      dbg('dialing %s', remotePeerId)
      return new Promise((resolve, reject) => {
        ipfs._libp2pNode.dialProtocol(peerInfo, protocol, (err, conn) => {
          if (err) {
            return reject(err)
          }

          if (!conn) {
            return reject(new Error('could not connect'))
          }

          const remotePeerId = peerInfo.id.toB58String()
          dbg('successfully dialed %s', remotePeerId)
          resolve(conn)
        })
      })
    },

    setupProtocolPusher(conn) {
      pull(
        conn,
        (() => {
          const input = pull.drain((...args) => {
            dbg('pusher received data %s', encoded.toString())
            return true
          }, err => {
            dbg('push protocol ended: %s', err)
            peer.pushEnded = true
          })
          const output = pushable()

          const ping = 'pusher ping from ' + peerId()
          dbg('sending %s', ping)
          output.push(Buffer.from(ping))

          return { sink: input, source: output }
        })(),
        conn
      )
    },

    handler(protocol, conn) {
      dbg('received incoming connection')

      conn.getPeerInfo((err, peerInfo) => {
        if (err) {
          console.error('%s: error getting peer info:', peerId(), err.message)
          return
        }

        const remotePeerId = peerInfo.id.toB58String()
        dbg('incoming conn is from %s', remotePeerId)
        pull(
          conn,
          (() => {
            const input = pull.drain((encoded) => {
              const data = encoded.toString()
              dbg('%s sent us %s', remotePeerId, data)
              return true
            }, err => {
              dbg('pull protocol to %s ended: %s', remotePeerId, err)
              peer.pullEnded = true
            })
            const output = pushable()

            // const ping = 'puller ping from ' + peerId()
            // dbg('sending %s', ping)
            // output.push(Buffer.from(ping))

            return { sink: input, source: output }
          })(),
          conn
        )
      })
    }
  }

  ipfs.on('start', () => {
    peer.dbg = dbg = require('debug')('dialing:peer:' + peerId())
    peer.handle(peer.handler.bind(peer))
  })

  return new Promise(resolve => ipfs.on('ready', () => resolve(peer)))

  function createLibp2p ({
    config,
    options: ipfsOptions,
    peerInfo,
    peerBook
  }) {
    const ws = new WebSocketStar({ id: peerInfo.id })

    return new Libp2p({
      peerInfo,
      peerBook,
      modules: {
        transport: [ ws ],
        streamMuxer: [ Multiplex ],
        connEncryption: [],
        peerDiscovery: []
      },
      config: {
        relay: {
          enabled: false,
          hop: {
            enabled: false
          }
        },
        EXPERIMENTAL: {
          dht: false,
          pubsub: false
        }
      }
    })
  }
}

describe('libp2p stop test', function () {
  this.timeout(10000)

  let appName
  let swarm = []

  for (let i = 0; i < 2; i++) {
    before(async () => {
      const peer = await createIpfs()
      swarm.push(peer)
    })
  }

  it('let things startup', () => {
    return new Promise(resolve => setTimeout(resolve, 2000))
  })

  it('connect each peer to the other', async () => {
    const c1 = swarm[0]
    const c2 = swarm[1]
    await Promise.all([
      connect(c1, c2),
      connect(c2, c1)
    ])
    await new Promise(resolve => setTimeout(resolve, 5000))

    async function connect (self, other) {
      const connection = await self.dialProtocol(other.ipfs._peerInfo)
      self.setupProtocolPusher(connection)
    }
  })

  it('stop one of the peers', async () => {
    await swarm[0].stop()
    await new Promise(resolve => setTimeout(resolve, 5000))
    console.log('\n')
    for (const p of swarm) {
      p.dbg('pushEnded?', p.pushEnded)
      p.dbg('pullEnded?', p.pullEnded)
    }
    for (const p of swarm) {
      expect(p.pushEnded).to.equal(true)
      expect(p.pullEnded).to.equal(true)
    }
  })
})
