'use strict'

const debug = require('debug')('peer-star:collaboration:membership')
const EventEmitter = require('events')
const multihashing = require('multihashing')
const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const bs58 = require('bs58')
const ORMap = require('delta-crdts')('ormap')
const Ring = require('../common/ring')
const DiasSet = require('../common/dias-peer-set')
const ConnectionManager = require('./connection-manager')
const MembershipGossipFrequencyHeuristic = require('./membership-gossip-frequency-henristic')
const { encode } = require('delta-crdts-msgpack-codec')

module.exports = class Membership extends EventEmitter {
  constructor (ipfs, globalConnectionManager, app, collaboration, store, clocks, replication, options) {
    super()

    this._ipfs = ipfs
    this._app = app
    this._collaboration = collaboration
    this._options = options

    this._members = new Map()
    const gfh = this._options.gossipFrequencyHeuristic || new MembershipGossipFrequencyHeuristic(app, this, options)
    this._membershipGossipFrequencyHeuristic = gfh
    this._someoneHasMembershipWrong = false

    this._ring = Ring(this._options.preambleByteCount)
    this.connectionManager = this._options.connectionManager || new ConnectionManager(
      ipfs,
      globalConnectionManager,
      this._ring,
      this._collaboration,
      store,
      clocks,
      replication,
      this._options)

    this._gossipNow = this._gossipNow.bind(this)

    this.connectionManager.on('should evict', (peerInfo) => {
      const peerId = peerInfo.id.toB58String()
      console.log('%s: evicting %s', this._peerId, peerId)
      this._memberCRDT.remove(peerId)
      this._members.delete(peerId)
      this.emit('peer left', peerId)
      this.emit('changed')
    })

    this.running = false
  }

  waitForStart () {
    return new Promise(resolve => {
      if (this.running) return resolve()

      this.once('started', resolve)
    })
  }

  async start () {
    this._membershipGossipFrequencyHeuristic.on('gossip now', this._gossipNow)
    this._membershipGossipFrequencyHeuristic.start()
    await this._startPeerInfo()
    this.running = true
    this.emit('started')
  }

  async _startPeerInfo () {
    const pInfo = this._ipfs._peerInfo
    if (pInfo) {
      this._peerId = pInfo.id.toB58String()
      this._memberCRDT = ORMap(this._peerId)
      this._ensureSelfIsInMembershipCRDT()
      this._diasSet = DiasSet(
        this._options.peerIdByteCount, this._ipfs._peerInfo, this._options.preambleByteCount)
      await this.connectionManager.start(this._diasSet)
    } else {
      return new Promise((resolve, reject) => {
        this._ipfs.once('ready', () => {
          this._startPeerInfo().then(resolve).catch(reject)
        })
      })
    }
  }

  stop () {
    this._membershipGossipFrequencyHeuristic.stop()
    this._membershipGossipFrequencyHeuristic.removeListener('gossip now', this._gossipNow)
    this.connectionManager.stop()
    this.running = false
  }

  peerCount () {
    return this._members.size
  }

  peers () {
    return new Set(this._members.keys())
  }

  peerAddresses (peerId) {
    const pInfo = this._members.get(peerId)
    return (pInfo && peerInfoAddresses(pInfo)) || []
  }

  outboundConnectionCount () {
    return this.connectionManager.outboundConnectionCount()
  }

  outboundConnectedPeers () {
    return this.connectionManager.outboundConnectedPeers()
  }

  inboundConnectionCount () {
    return this.connectionManager.inboundConnectionCount()
  }

  inboundConnectedPeers () {
    return this.connectionManager.inboundConnectedPeers()
  }

  vectorClock (peerId) {
    return this.connectionManager.vectorClock(peerId)
  }

  needsUrgentBroadcast () {
    return this._someoneHasMembershipWrong
  }

  // The parameter is either the remote membership state or a hash of the
  // remote membership state
  async deliverRemoteMembership (membership) {
    await this.waitForStart()

    let remoteHash = membership
    if (typeof membership !== 'string') {
      // If the parameter is the remote membership state, join to the local state
      this._joinMembership(membership)

      // Figure out the hash of the remote membership state
      remoteHash = this._createSummaryHashFromCrdtState(membership)
    }
    // Compare the local hash to the remote hash. If they're different, someone
    // has membership wrong
    const localMembershipHash = this._createMembershipSummaryHash()
    const hashMismatch = remoteHash !== localMembershipHash
    this._someoneHasMembershipWrong = this._someoneHasMembershipWrong || hashMismatch
  }

  _ensureSelfIsInMembershipCRDT () {
    const pInfo = this._ipfs._peerInfo
    let addresses = peerInfoAddresses(pInfo)
    const crdtAddresses = joinAddresses(this._memberCRDT.value()[this._peerId])
    if (!addressesEqual(addresses, crdtAddresses)) {
      this._members.set(this._peerId, pInfo)
      this._memberCRDT.applySub(this._peerId, 'mvreg', 'write', addresses)
    }
  }

  async _gossipNow () {
    // Ensure that we only process one gossip now message even if several
    // are sent while waiting for startup
    if (this._gossipNowWaiting) {
      return
    }
    this._gossipNowWaiting = this.waitForStart()
    await this._gossipNowWaiting
    this._gossipNowWaiting = undefined

    if (this.needsUrgentBroadcast()) {
      // The addresses this peer advertises may have changed since the last
      // gossip, so ensure the CRDT is up to date
      // TODO: Can we listen for address changes and set someonHasMembershipWrong?
      this._ensureSelfIsInMembershipCRDT()
      this._app.gossip(this._createMembershipMessage())
    } else {
      this._app.gossip(this._createMembershipSummaryMessage())
    }
    this._someoneHasMembershipWrong = false
  }

  _createSummaryHashFromCrdtState (state) {
    const crdt = ORMap('tmp')
    crdt.apply(state)
    const entries = Object.entries(crdt.value())
    const sorted = entries.map(([id, addrs]) => {
      return [id, joinAddresses(addrs).sort()]
    }).sort(sortMembers)
    return this._createSummaryHash(sorted)
  }

  _createMembershipSummaryMessage () {
    const message = [
      this._membershipTopic(),
      this._createMembershipSummaryHash(),
      this._collaboration.typeName]
    return encode(message)
  }

  _createMembershipSummaryHash () {
    const membership = Array.from(this._members).map(
      ([peerId, pInfo]) => [peerId, peerInfoAddresses(pInfo)]).sort(sortMembers)
    debug('%s: membership:', this._peerId, membership)
    return this._createSummaryHash(membership)
  }

  _createSummaryHash (membership) {
    const json = Buffer.from(JSON.stringify(membership))
    return multihashing.digest(json, 'sha1').toString('base64')
  }

  _createMembershipMessage () {
    debug('sending membership', this._memberCRDT.value())
    const message = [this._membershipTopic(), this._memberCRDT.state(), this._collaboration.typeName]
    // TODO: sign and encrypt membership message
    return encode(message)
  }

  _joinMembership (remoteMembership) {
    let changed = false
    debug('remote membership:', remoteMembership)
    const oldMembers = new Set(this._members.keys())
    debug('local members:', oldMembers)

    this._memberCRDT.apply(remoteMembership)
    this._ensureSelfIsInMembershipCRDT()
    const members = new Map(Object.entries(this._memberCRDT.value()))

    for (let [peerId, addresses] of members) {
      if (peerId === this._peerId) { continue }
      addresses = joinAddresses(addresses)
      debug('remote addresses for %s:', peerId, addresses)

      const oldPeerInfo = this._members.has(peerId) && this._members.get(peerId)
      if (!oldPeerInfo) {
        const peerInfo = new PeerInfo(new PeerId(bs58.decode(peerId)))
        for (let address of addresses) {
          peerInfo.multiaddrs.add(address)
        }
        this._members.set(peerId, peerInfo)
        this._ring.add(peerInfo)
        changed = true
        this.emit('peer joined', peerId)
      } else {
        const oldAddresses = peerInfoAddresses(oldPeerInfo)
        debug('local addresses for %s:', peerId, oldAddresses)
        for (let address of addresses) {
          if (!oldPeerInfo.multiaddrs.has(address)) {
            changed = true
            oldPeerInfo.multiaddrs.add(address)
          }
        }

        for (let address of oldAddresses) {
          if (addresses.indexOf(address) < 0) {
            changed = true
            oldPeerInfo.multiaddrs.delete(address)
          }
        }
        this.emit('peer addresses changed', peerId, addresses)
      }
    }

    for (let oldMember of oldMembers) {
      if (oldMember === this._peerId) { continue }
      if (!members.has(oldMember)) {
        this._members.delete(oldMember)
        const peerInfo = new PeerInfo(new PeerId(bs58.decode(oldMember)))
        this._ring.remove(peerInfo)
        changed = true
        this.emit('peer left', oldMember)
      }
    }

    if (changed) {
      debug('MEMBERSHIP CHANGED!')
      this.emit('changed')
    }
  }

  _membershipTopic () {
    return this._collaboration.name
  }
}

function peerInfoAddresses (peerInfo) {
  return peerInfo.multiaddrs.toArray().map((ma) => ma.toString()).sort()
}

function sortMembers (member1, member2) {
  const [id1] = member1
  const [id2] = member2
  if (id1 < id2) {
    return -1
  } else if (id1 > id2) {
    return 1
  }
  return 0
}

function joinAddresses (addresses = []) {
  debug('joinAddresses:', addresses)
  const result = [...addresses].reduce((acc, moreAddresses) => {
    for (let address of moreAddresses) {
      acc.add(address)
    }
    return acc
  }, new Set())
  return [...result]
}

function addressesEqual (addresses1, addresses2) {
  if (addresses1.length !== addresses2.length) {
    return false
  }
  for (let address of addresses1) {
    if (addresses2.indexOf(address) < 0) {
      return false
    }
  }
  for (let address of addresses2) {
    if (addresses1.indexOf(address) < 0) {
      return false
    }
  }

  return true
}
