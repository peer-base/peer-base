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

describe('membership', function () {
  this.timeout(10000)

  let app
  let ipfs
  let globalConnectionManager
  let collaboration
  let store
  let clocks
  let options

  let memberships = []

  let peerCount = 10

  before(async () => {
    for (let memberIndex = 0; memberIndex < peerCount; memberIndex ++) {
      await (async (memberIndex) => {
        let membership

        ipfs = {
          _peerInfo: new FakePeerInfo(randomPeerId()),
          id () {
            return Promise.resolve({ id: this._peerInfo.id.toB58String() })
          }
        }
        globalConnectionManager = {
          handle (protocolName, handler) {},
          unhandle (protocolName) {}
        }
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
                const [peerId, counter] = clockEntry
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
        collaboration = {
          name: 'collab name',
          typeName: 'gset'
        }
        store = {}
        clocks = {}
        options = {
          peerIdByteCount: 32,
          preambleByteCount: 2,
          keys: {}
        }

        ipfs._peerInfo.multiaddrs.add(Multiaddr(`/ip4/127.0.0.1/tcp/${memberIndex}`))

        membership = new Membership(ipfs, globalConnectionManager, app, collaboration, store, clocks, options)

        await membership.start()

        memberships.push(membership)
      })(memberIndex)
    }
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
