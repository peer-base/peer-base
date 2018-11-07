/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const FakePeerInfo = require('./utils/fake-peer-info')
const randomPeerId = require('./utils/random-peer-id').buffer
const Membership = require('../src/collaboration/membership')
const { decode } = require('delta-crdts-msgpack-codec')
const Multiaddr = require('multiaddr')
const EventEmitter = require('events')
const ORMap = require('delta-crdts')('ormap')

const options = {
  peerIdByteCount: 32,
  preambleByteCount: 2,
  keys: {}
}

function randomB58String () {
  return new FakePeerInfo(randomPeerId()).id.toB58String()
}

const mock = {
  ipfs () {
    return {
      _peerInfo: new FakePeerInfo(randomPeerId()),
      id () {
        return Promise.resolve({ id: this._peerInfo.id.toB58String() })
      }
    }
  },
  connectionManager () {
    return {
      handle (protocolName, handler) {},
      unhandle (protocolName) {}
    }
  },
  gossipFrequencyHeuristic () {
    const gfh = new EventEmitter()
    gfh.start = () => {}
    gfh.stop = () => {}
    return gfh
  }
}

class EventLogger {
  constructor (membership, events) {
    this.logs = {}
    for (const e of events) {
      this.logs[e] = []
      membership.on(e, (...args) => {
        this.logs[e].push([...args])
      })
    }
  }
  clear () {
    for (const e in this.logs) {
      this.logs[e] = []
    }
  }
}

describe('membership', function () {
  describe('unit', function () {
    const memberships = []
    function createMembership (opts) {
      const memberIndex = memberships.length
      const ipfs = mock.ipfs()
      ipfs._peerInfo.multiaddrs.add(Multiaddr(`/ip4/127.0.0.1/tcp/${memberIndex}`))
      const globalConnectionManager = mock.connectionManager()

      const app = {
        peerCountGuess () {
          return 1
        },
        gossip (message) {
          message = decode(message)
          this._gossipMessages = this._gossipMessages || []
          this._gossipMessages.push(message)
        },
        gossipMessages () {
          return this._gossipMessages || []
        }
      }
      const collaboration = {
        name: 'collab name',
        typeName: 'gset'
      }
      const mergedOpts = Object.assign({
        gossipFrequencyHeuristic: mock.gossipFrequencyHeuristic()
      }, options, opts)
      const m = new Membership(ipfs, globalConnectionManager, app, collaboration, {}, {}, mergedOpts)
      memberships.push(m)
      return m
    }

    after(() => memberships.forEach(m => m.stop()))

    it('sends single gossip message on start even if multiple gossip now events are fired during start', async () => {
      const gfh = mock.gossipFrequencyHeuristic()
      const membership = createMembership({
        gossipFrequencyHeuristic: gfh
      })
      const starting = membership.start()
      gfh.emit('gossip now')
      gfh.emit('gossip now')
      gfh.emit('gossip now')
      await starting
      expect(membership._app.gossipMessages().length).to.equal(1)
      gfh.emit('gossip now')
      setTimeout(() => {
        expect(membership._app.gossipMessages().length).to.equal(2)
      })
    })

    it('needs urgent broadcast on delivery of gossip summary message that doesnt match local hash', async () => {
      const membership = createMembership()
      await membership.start()
      await membership.deliverRemoteMembership('remote hash')
      expect(membership.needsUrgentBroadcast()).to.equal(true)
    })

    it('does not need urgent broadcast on delivery of gossip summary message that matches local hash', async () => {
      const membership = createMembership()
      await membership.start()
      const matchingHash = membership._createMembershipSummaryHash()
      await membership.deliverRemoteMembership(matchingHash)
      expect(membership.needsUrgentBroadcast()).to.equal(false)
    })

    it('still needs urgent broadcast on delivery of hash mismatch followed by hash match', async () => {
      const membership = createMembership()
      await membership.start()
      const matchingHash = membership._createMembershipSummaryHash()
      await membership.deliverRemoteMembership('remote hash')
      expect(membership.needsUrgentBroadcast()).to.equal(true)
      await membership.deliverRemoteMembership(matchingHash)
      expect(membership.needsUrgentBroadcast()).to.equal(true)
    })

    it('needs urgent broadcast on delivery of gossip message that doesnt contain this peer', async () => {
      const membership = createMembership()
      await membership.start()
      const tmpId = randomB58String()
      const remoteCrdt = ORMap(tmpId)
      remoteCrdt.applySub(tmpId, 'mvreg', 'write', [`/ip4/127.0.0.1/tcp/5001`])
      await membership.deliverRemoteMembership(remoteCrdt.state())
      expect(membership.needsUrgentBroadcast()).to.equal(true)
    })

    it('needs urgent broadcast on delivery of gossip message that contains this peer but has the wrong addresses', async () => {
      const membership = createMembership()
      await membership.start()
      const remoteCrdt = ORMap(randomB58String())
      remoteCrdt.applySub(membership._peerId, 'mvreg', 'write', [`/ip4/127.0.0.1/tcp/5001`])
      await membership.deliverRemoteMembership(remoteCrdt.state())
      expect(membership.needsUrgentBroadcast()).to.equal(true)
    })

    it('does not need urgent broadcast on delivery of gossip message that does contain this peer and addresses', async () => {
      const membership = createMembership()
      await membership.start()
      const remoteCrdt = ORMap(randomB58String())
      const addresses = membership._ipfs._peerInfo.multiaddrs.toArray().map((ma) => ma.toString())
      remoteCrdt.applySub(membership._peerId, 'mvreg', 'write', addresses)
      await membership.deliverRemoteMembership(remoteCrdt.state())
      expect(membership.needsUrgentBroadcast()).to.equal(false)
    })

    it('calculates matching hashes regardless of order of peers and addresses', async () => {
      function getRemoteState (peerAddresses) {
        const remoteCrdt = ORMap(randomB58String())
        for (const peerAddr of peerAddresses) {
          remoteCrdt.applySub(peerAddr[0], 'mvreg', 'write', peerAddr[1])
        }
        return remoteCrdt.state()
      }

      const membership = createMembership()
      await membership.start()

      const addresses = membership._ipfs._peerInfo.multiaddrs.toArray().map((ma) => ma.toString())
      const state1 = getRemoteState([
        [membership._peerId, addresses],
        ['peer1', [
          `/ip4/127.0.0.1/tcp/2222`,
          `/ip4/127.0.0.1/tcp/3333`,
          `/ip4/127.0.0.1/tcp/4444`
        ]],
        ['peer2', [
          `/ip4/127.0.0.1/tcp/5555`,
          `/ip4/127.0.0.1/tcp/6666`,
          `/ip4/127.0.0.1/tcp/7777`
        ]]
      ])
      const state2 = getRemoteState([
        ['peer2', [
          `/ip4/127.0.0.1/tcp/5555`,
          `/ip4/127.0.0.1/tcp/7777`,
          `/ip4/127.0.0.1/tcp/6666`
        ]],
        ['peer1', [
          `/ip4/127.0.0.1/tcp/4444`,
          `/ip4/127.0.0.1/tcp/3333`,
          `/ip4/127.0.0.1/tcp/2222`
        ]],
        [membership._peerId, addresses]
      ])

      // Remote membership contains existing peer id and addresses so there is
      // no need to broadcast
      await membership.deliverRemoteMembership(state1)
      expect(membership.needsUrgentBroadcast()).to.equal(false)

      // Second state is the same as the first, just with peers and addresses
      // in a different order, should produce the identical hash
      await membership.deliverRemoteMembership(state2)
      expect(membership.needsUrgentBroadcast()).to.equal(false)
    })

    it('has correct peer count and events when delivering remote membership', async () => {
      const gfh = mock.gossipFrequencyHeuristic()
      const membership = createMembership({
        gossipFrequencyHeuristic: gfh
      })
      await membership.start()

      const events = ['peer joined', 'peer left', 'peer addresses changed', 'changed']
      const eventLogger = new EventLogger(membership, events)

      // To start with we only know about ourself
      expect(membership.peerCount()).to.equal(1)

      // Deliver remote membership with the remote peer as the only member
      const remotePeerInfo = new FakePeerInfo(randomPeerId())
      const remotePeerId = remotePeerInfo.id.toB58String()
      const remoteCrdt = ORMap(remotePeerId)
      let remoteAddresses = [`/ip4/127.0.0.1/tcp/5000`]
      remoteCrdt.applySub(remotePeerId, 'mvreg', 'write', remoteAddresses)

      await membership.deliverRemoteMembership(remoteCrdt.state())
      expect(membership.peerCount()).to.equal(2)
      expect(eventLogger.logs['peer joined']).to.deep.equal([[remotePeerId]])
      expect(eventLogger.logs['peer left'].length).to.equal(0)
      expect(eventLogger.logs['peer addresses changed'].length).to.equal(0)
      expect(eventLogger.logs.changed.length).to.equal(1)

      eventLogger.clear()

      // Remove old address and add new address to remote
      remoteAddresses = [`/ip4/127.0.0.1/tcp/5001`]
      remoteCrdt.applySub(remotePeerId, 'mvreg', 'write', remoteAddresses)

      // Deliver remote CRDT with same peer but different addresses
      await membership.deliverRemoteMembership(remoteCrdt.state())
      expect(membership.peerCount()).to.equal(2)
      expect(eventLogger.logs['peer joined'].length).to.equal(0)
      expect(eventLogger.logs['peer left'].length).to.equal(0)
      expect(eventLogger.logs['peer addresses changed']).to.deep.equal([[
        remotePeerId,
        remoteAddresses
      ]])
      expect(eventLogger.logs.changed.length).to.equal(1)

      eventLogger.clear()

      // Deliver remote CRDT with remote peer removed
      remoteCrdt.remove(remotePeerId)
      await membership.deliverRemoteMembership(remoteCrdt.state())
      expect(membership.peerCount()).to.equal(1)
      expect(eventLogger.logs['peer joined'].length).to.equal(0)
      expect(eventLogger.logs['peer left'][0][0]).to.equal(remotePeerId)
      expect(eventLogger.logs['peer addresses changed'].length).to.equal(0)
      expect(eventLogger.logs.changed.length).to.equal(1)

      eventLogger.clear()

      // We want to test what happens when the membership receives a message
      // that removes its own peer id

      // Trigger membership to send a gossip message with its state
      gfh.emit('gossip now')
      await new Promise((resolve) => setTimeout(resolve))
      const gossipMessages = membership._app.gossipMessages()
      expect(gossipMessages.length).to.equal(1)
      const localState = gossipMessages[0][1]

      // Apply the local state to the remote CRDT, then remove the local peer
      const localPeerId = membership._peerId
      remoteCrdt.apply(localState)
      remoteCrdt.remove(localPeerId)

      // Deliver remote CRDT with local peer removed
      // This should have no effect because the membership will restore it
      // after merging
      await membership.deliverRemoteMembership(remoteCrdt.state())
      expect(membership.peerCount()).to.equal(1)
      expect(eventLogger.logs['peer joined'].length).to.equal(0)
      expect(eventLogger.logs['peer left'].length).to.equal(0)
      expect(eventLogger.logs['peer addresses changed'].length).to.equal(0)
      expect(eventLogger.logs['changed'].length).to.equal(0)
    })
  })

  describe('convergence', function () {
    this.timeout(10000)

    let app
    let ipfs
    let globalConnectionManager
    let collaboration
    let store
    let clocks

    let memberships = []

    let peerCount = 10

    before(async () => {
      const members = []
      for (let memberIndex = 0; memberIndex < peerCount; memberIndex++) {
        members.push(memberIndex)
      }
      return Promise.all(members.map(async (memberIndex) => {
        let membership

        ipfs = mock.ipfs()
        globalConnectionManager = mock.connectionManager()
        app = {
          peerCountGuess () {
            return memberships.length
          },
          gossip (message) {
            message = decode(message)
            const [collabName, membershipMessage] = message
            expect(collabName).to.equal('collab name')
            // console.log(`${memberIndex}:`, membershipMessage)
            if (typeof membershipMessage !== 'string') {
              const clock = membershipMessage.cc.cc
              for (let clockEntry of clock) {
                const [, counter] = clockEntry
                // tests if there are no cycles in membership:
                // each peer should update the membership CRDT exactly once
                expect(counter).to.equal(1)
              }
            }
            for (let otherMembership of memberships) {
              if (otherMembership !== membership) {
                otherMembership.deliverRemoteMembership(membershipMessage)
              }
            }
          }
        }
        const collaboration = {
          name: 'collab name',
          typeName: 'gset'
        }
        const store = {}
        const clocks = {}
        const options = {
          peerIdByteCount: 32,
          preambleByteCount: 2,
          keys: {}
        }
        const replication = {}

        ipfs._peerInfo.multiaddrs.add(Multiaddr(`/ip4/127.0.0.1/tcp/${memberIndex}`))

        membership = new Membership(ipfs, globalConnectionManager, app, collaboration, store, clocks, replication, options)

        await membership.start()

        memberships.push(membership)
      }))
    })

    after(() => Promise.all(memberships.map((membership) => membership.stop())))

    it('waits a bit', (done) => {
      setTimeout(done, 9000)
    })

    it('has all members', () => {
      for (let membership of memberships) {
        expect(membership.peers().size).to.deep.equal(memberships.length)
      }
    })

    it('knows all members addresses', () => {
      for (let membership of memberships) {
        let i = 0
        for (let otherMembership of memberships) {
          const peerId = otherMembership._ipfs._peerInfo.id.toB58String()
          const otherAddresses = membership.peerAddresses(peerId)
          // console.log(otherAddresses)
          expect(otherAddresses).to.deep.equal([`/ip4/127.0.0.1/tcp/${i}`])
          i++
        }
      }
    })
  })
})
