/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const MemoryDatastore = require('interface-datastore').MemoryDatastore
const crypto = require('libp2p-crypto')
const { encode, decode } = require('delta-crdts-msgpack-codec')
const pull = require('pull-stream')
const CRDT = require('delta-crdts').type('rga')
const vectorclock = require('../src/common/vectorclock')

const Store = require('../src/store')

describe('store', () => {
  let shared

  const strategyNames = ['ipfs-repo']

  strategyNames.forEach((strategyName) => {
    describe(strategyName, () => {
      let ipfs = {
        _repo: {
          datastore: new MemoryDatastore()
        },
        id: () => ({
          id: 'fake peer id'
        })
      }
      let collaboration = {}
      let state = CRDT.initial()
      let verifyApply

      let shared = {
        apply (remoteClock, encodedDelta, isPartial) {
          expect(Buffer.isBuffer(encodedDelta)).to.be.true()
          const delta = decode(encodedDelta)

          if (verifyApply) {
            verifyApply(remoteClock, delta, isPartial)
          }
          const [forName, typeName, deltaState] = delta
          state = CRDT.join(state, deltaState)
          return [null, encode([null, null, state])]
        },
        initial () {
          return Promise.resolve(new Map())
        },
        async join (acc, delta) {
          acc = await acc
          const [previousClock, authorClock, encodedDelta] = delta
          const [forName, typeName, encryptedDelta] = decode(encodedDelta)
          const name = forName

          if (!acc.has(name)) {
            acc.set(name, [name, typeName, previousClock, {}, CRDT.initial()])
          }
          let [, , clock, previousAuthorClock, s1] = acc.get(name)
          const newAuthorClock = vectorclock.incrementAll(previousAuthorClock, authorClock)

          const newState = CRDT.join(s1, encryptedDelta)
          acc.set(forName, [forName, typeName, clock, newAuthorClock, newState])
          return acc
        },
        async signAndEncrypt (message) {
          return message
        },
        name: null
      }

      let store

      it('can be created', () => {
        store = Store(ipfs, collaboration, {
          storeStrategyName: strategyName
        })
      })

      it('can be started', () => store.start())

      it('can be assigned a shared', () => {
        store.setShared(shared)
      })

      it('can get the latest clock', async () => {
        const clock = await store.getLatestClock()
        expect(clock).to.deep.equal({})
      })

      it('contains empty clock', async () => {
        expect(await store.contains({})).to.equal(true)
      })

      it('does not contains other clock', async () => {
        expect(await store.contains({'some peer id': 1})).to.equal(false)
      })

      it('can save self delta', async () => {
        let applyCalls = 0
        verifyApply = (remoteClock, delta, isPartial) => {
          applyCalls++
          expect(remoteClock).to.deep.equal({'fake peer id': 1})
          expect(Array.isArray(delta)).to.be.true()
          expect(delta[0]).to.be.null()
          expect(delta[1]).to.equal('fake')
          expect(typeof delta[2]).to.equal('object')
          expect(isPartial).to.be.true()
        }
        const delta = encode([null, 'fake', CRDT.mutators.push('fake peer id', state, 'a')])
        expect(await store.saveDelta([null, null, delta])).to.deep.equal({'fake peer id': 1})
        expect(applyCalls).to.be.equal(1)
      })

      it('can get state', async () => {
        expect(decode(await store.getState())).to.deep.equal([null, null, state])
      })

      it('can stream deltas', (done) => {
        pull(
          store.deltaStream(),
          pull.collect((err, deltas) => {
            expect(err).to.not.exist()
            expect(deltas.length).to.equal(1)
            const deltaRecord = deltas[0]
            const [previousClock, authorClock, delta] = deltaRecord
            expect(previousClock).to.deep.equal({})
            expect(authorClock).to.deep.equal({'fake peer id': 1})
            expect(typeof delta).to.equal('object')
            done()
          })
        )
      })

      it('cannot save duplicate delta', async () => {
        let applyCalls = 0
        verifyApply = (remoteClock, encodedDelta, isPartial) => {
          applyCalls++
        }
        expect(await store.saveDelta([{}, {'fake peer id': 1}, 'some delta'])).to.equal(false)
        expect(applyCalls).to.equal(0)
      })

      it('can save concurrent delta', async () => {
        let applyCalleds = 0
        verifyApply = (remoteClock, encodedDelta, isPartial) => {
          applyCalleds++
          expect(remoteClock).to.deep.equal({'fake peer id': 1, 'other peer id': 1})
          expect(Array.isArray(encodedDelta)).to.be.true()
          expect(encodedDelta[0]).to.be.null()
          expect(encodedDelta[1]).to.equal('fake')
          expect(typeof encodedDelta[2]).to.equal('object')
          expect(isPartial).to.be.true()
        }
        const delta = encode([null, 'fake', CRDT.mutators.push('other peer id', state, 'b')])
        expect(await store.saveDelta([{}, {'other peer id': 1}, delta])).to.deep.equal({'fake peer id': 1, 'other peer id': 1})
        expect(applyCalleds).to.be.equal(1)
        expect(CRDT.value(state)).to.deep.equal(['a', 'b'])
      })

      it('cannot save causally  delta', async () => {
        let applyCalls = 0
        verifyApply = (remoteClock, encodedDelta, isPartial) => {
          applyCalls++
        }
        expect(await store.saveDelta([{'third peer id': 1}, {'some other peer id': 1}, 'some delta'])).to.equal(false)
        expect(applyCalls).to.equal(0)
      })

      it('can save another self delta', async () => {
        let applyCalls = 0
        verifyApply = (remoteClock, encodedDelta, isPartial) => {
          applyCalls++
          expect(remoteClock).to.deep.equal({'fake peer id': 2, 'other peer id': 1})
          expect(Array.isArray(encodedDelta)).to.be.true()
          expect(encodedDelta[0]).to.be.null()
          expect(encodedDelta[1]).to.equal('fake')
          expect(typeof encodedDelta[2]).to.equal('object')
          expect(isPartial).to.be.true()
        }
        const delta = encode([null, 'fake', CRDT.mutators.push('fake peer id', state, 'c')])
        expect(await store.saveDelta([null, null, delta])).to.deep.equal({'fake peer id': 2, 'other peer id': 1})
        expect(applyCalls).to.be.equal(1)
        expect(CRDT.value(state)).to.deep.equal(['a', 'b', 'c'])
      })

      it('can stream deltas', (done) => {
        pull(
          store.deltaStream(),
          pull.collect((err, deltas) => {
            expect(err).to.not.exist()
            expect(deltas.length).to.equal(3)

            const delta0 = deltas[0]
            expect(delta0[0]).to.deep.equal({})
            expect(delta0[1]).to.deep.equal({'fake peer id': 1})
            expect(typeof delta0[2]).to.equal('object')

            const delta1 = deltas[1]
            expect(delta1[0]).to.deep.equal({})
            expect(delta1[1]).to.deep.equal({'other peer id': 1})
            expect(typeof delta1[2]).to.equal('object')

            const delta2 = deltas[2]
            expect(delta2[0]).to.deep.equal({'fake peer id': 1, 'other peer id': 1})
            expect(delta2[1]).to.deep.equal({'fake peer id': 1})
            expect(typeof delta2[2]).to.equal('object')

            done()
          })
        )
      })

      it('can create delta batch', async () => {
        const deltaBatch = await store.deltaBatch()
        const rootDelta = deltaBatch.get(null)
        expect(rootDelta.length).to.equal(3)
        const [baseClock, authorClock, encodedDeltaRecord] = rootDelta
        expect(baseClock).to.deep.equal({})
        expect(authorClock).to.deep.equal({'fake peer id': 2, 'other peer id': 1})
        const decodedDeltaRecord = decode(encodedDeltaRecord)
        const [forName, type, encodedDelta] = decodedDeltaRecord
        const delta = decode(encodedDelta)
        expect(state).to.deep.equal(delta)
        expect(CRDT.value(delta)).to.deep.equal(['a', 'b', 'c'])
      })

      it('can get state', async () => {
        expect(decode(await store.getState())).to.deep.equal([null, null, state])
      })

      it('can be stopped', () => store.stop())
    })
  })

})