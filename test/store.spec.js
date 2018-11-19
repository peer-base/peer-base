/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const MemoryDatastore = require('interface-datastore').MemoryDatastore
const crypto = require('libp2p-crypto')
const { encode, decode } = require('delta-crdts-msgpack-codec')
const pull = require('pull-stream')
require('./utils/fake-crdt')
const CRDT = require('delta-crdts').type('fake')

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
          if (verifyApply) {
            verifyApply(remoteClock, encodedDelta, isPartial)
          }
          const [forName, typeName, deltaState] = encodedDelta
          state = CRDT.join(state, deltaState)
          return [null, encode([null, null, state])]
        }
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
        let applyCalleds = 0
        verifyApply = (remoteClock, encodedDelta, isPartial) => {
          applyCalleds++
          expect(remoteClock).to.deep.equal({'fake peer id': 1})
          expect(encodedDelta).to.deep.equal([null, 'fake', 'a'])
          expect(isPartial).to.be.true()
        }
        const delta = [null, 'fake', 'a']
        expect(await store.saveDelta([null, null, delta])).to.deep.equal({'fake peer id': 1})
        expect(applyCalleds).to.be.equal(1)
      })

      it('can get state', async () => {
        expect(decode(await store.getState())).to.deep.equal([null, null, new Set('a')])
      })

      it('can stream deltas', (done) => {
        pull(
          store.deltaStream(),
          pull.collect((err, deltas) => {
            expect(err).to.not.exist()
            expect(deltas).to.deep.equal([[{}, {'fake peer id': 1}, [null, 'fake', 'a']]])
            done()
          })
        )
      })

      it('can be stopped', () => store.stop())
    })
  })

})
