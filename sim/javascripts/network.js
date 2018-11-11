const hat = require('hat')
const PeerId = require('peer-id')
const EventEmitter = require('events')
const DiasSet = require('../../src/common/dias-peer-set')
const Membership = require('../../src/collaboration/membership')
const { decode } = require('delta-crdts-msgpack-codec')
const Color = require('./color')

class Network extends EventEmitter {
  constructor(options) {
    super()
    this.peers = []
    // Includes peers that were deleted
    this.allPeers = []
    this.messages = new Map()
    this.options = options
  }

  gossip(from, message) {
    this.peers.filter(p => p !== from).forEach(to => {
      const duration = (0.75 + Math.random() / 2) * this.options.avgNetworkDelay
      const id = hat()
      this.messages.set(id, { id, message, from, to, duration, start: Date.now() })
      this.emit('gossip send', id, message, from, to, duration)
      setTimeout(() => {
        to.membership.deliverGossipMessage(message)
        this.messages.delete(id)
        this.emit('gossip arrive', id, message, from, to, duration)
      }, duration)
    })
  }

  async generatePeer() {
    const peer = await this.generateNewPeer()
    peer.membership.on('changed', () => this.emit('membership changed', peer))
    this.peers.push(peer)
    this.allPeers.push(peer)
    this.emit('peer added', peer)
  }

  async generateNewPeer() {
    const network = this
    const peerId = await new Promise((resolve, reject) => {
      PeerId.create({ bits: 1024 }, (err, data) => err ? reject(err) : resolve(data))
    })
    const peerInfo = {
      id: peerId,
      multiaddrs: {
        toArray() {
          return ['/ip4/127.0.0.1/tcp/4001']
        }
      }
    }
    const ipfsMock = {
      _peerInfo: peerInfo,
      id: async () => ({
        id: peerInfo.id.toB58String()
      })
    }
    const appMock = {
      gossip(message) {
        peer.log('message', decode(message))
        network.gossip(peer, decode(message))
      },
      peerCountGuess() {
        return network.peers.length
      }
    }
    const collaborationMock = {
      name: 'my collab',
      typeName: 'rga'
    }
    const connectionManagerMock = Object.assign(new EventEmitter(), {
      start() {},
      stop() {}
    })
    const peer = {
      running: false,
      peerInfo,
      b58: peerInfo.id.toB58String(),
      diasSet: DiasSet(this.options.peerIdByteCount, peerInfo, this.options.preambleByteCount),
      membership: new Membership(ipfsMock, null, appMock, collaborationMock, null, null, Object.assign({}, this.options, {
        connectionManager: connectionManagerMock
      })),
      getMemberPeers() {
        const mKeys = [...(this.membership._members.keys())]
        const mPeers = mKeys.map(k => network.allPeers.find(p => p.b58 === k)).filter(Boolean)
        return mPeers.map(p =>({
          b58: p.b58,
          color: p.color,
          leader: p.b58 === this.getLeader()
        }))
      },
      getLeader() {
        // return this.membership._leadership._leader
        return (this.membership._leadership || {})._leader
      },
      shutdown() {
        this.membership.stop()
        this.running = false

        // Simulate the peers with connections to this peer discovering that
        // the connection has broken
        const inbound = network.peers.filter(pi => pi !== this && pi.outbound.has(this.peerInfo))
        for (const inboundPeer of inbound) {
          let delay = network.options.resetConnectionIntervalMS * network.options.maxUnreachableBeforeEviction
          delay = (0.5 + Math.random()) * delay
          setTimeout(() => {
            if (inboundPeer && inboundPeer.running) {
              inboundPeer.membership.connectionManager.emit('should evict', this.peerInfo)
            }
          }, delay)
        }
      },
      log(...args) {
        console.log("%c %s", 'color:'+Color.getColor(this.b58), this.b58.substring(2, 8), ...args)
      }
    }

    setTimeout(async () => {
      await peer.membership.start()
      // peer.membership._leadership.on('leader', () => {
      //   this.emit('peer chose leader', peer)
      //   this.checkLeaderElected()
      // })
      peer.membership.on('changed', () => this.checkMembershipConverged())
      peer.running = true
      peer.log('started')
      this.emit('peer started', peer)
    }, (1 + Math.random() * 0.5) * this.options.avgPeerStartTime)
    return peer
  }

  removePeer(p) {
    p.shutdown()
    this.peers = this.peers.filter(i => i !== p)
    this.emit('peer removed', p)
    // this.checkLeaderRemoved(p)
  }

  checkMembershipConverged() {
    for (const p of this.peers) {
      const memberPeers = p.membership.peers()
      if (memberPeers.size !== this.peers.length) {
        return false
      }
      for (const i of this.peers) {
        if (!memberPeers.has(i.b58)) {
          return false
        }
      }
    }
    this.emit('membership converged')
  }

  checkLeaderRemoved(removedPeer) {
    if (removedPeer === this.leader) {
      this.leader = null
      this.emit('leader removed', removedPeer)
    }
  }

  checkLeaderElected() {
    if (!this.peers.length) return

    const leader = this.peers[0].getLeader()
    for (const p of this.peers) {
      if (p.getLeader() !== leader) return
    }
    this.leader = this.peers.find(p => p.b58 === leader)
    this.emit('leader elected', this.leader)
  }
}

module.exports = Network
