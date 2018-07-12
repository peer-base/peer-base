/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const crypto = require('libp2p-crypto')
const App = require('./utils/create-app')
require('./utils/fake-crdt')
const A_BIT = 19000

describe('collaboration', function () {
  this.timeout(20000)

  const peerCount = 2 // 10
  const key = crypto.randomBytes(16)
  const iv = crypto.randomBytes(16)
  const collaborationOptions = {
    createCipher: () => {
      return new Promise((resolve, reject) => {
        crypto.aes.create(Buffer.from(key), Buffer.from(iv), (err, key) => {
          if (err) {
            return reject(err)
          }
          resolve(key)
        })
      })
    }
  }

  let swarm = []
  let collaborations

  for (let i = 0; i < peerCount; i++) {
    ((i) => {
      before(() => {
        const app = App({ maxThrottleDelayMS: 1000 })
        swarm.push(app)
        return app.start()
      })

      after(() => swarm[i] && swarm[i].stop())
    })(i)
  }

  before((done) => {
    // wait a bit for things to sync
    setTimeout(done, A_BIT)
  })

  it('can be created', async () => {
    collaborations = await Promise.all(
      swarm.map((peer) => peer.app.collaborate('test collaboration', 'fake', collaborationOptions)))
    expect(collaborations.length).to.equal(peerCount)
  })

  it('waits a bit for membership to propagate', (done) => {
    setTimeout(done, A_BIT)
  })

  it('has all members', () => {
    return Promise.all(swarm.map((peer) => peer.app.ipfs.id())).then((ids) => {
      ids = ids.map((id) => id.id)
      collaborations.forEach((collaboration) => {
        expect(Array.from(collaboration.peers()).sort()).to.deep.equal(ids.sort())
      })
    })
  })

  it('adding another peer', async () => {
    const peer = App({ maxThrottleDelayMS: 1000 })
    const collaboration = await peer.app.collaborate('test collaboration', 'fake', collaborationOptions)
    swarm.push(peer)
    collaborations.push(collaboration)
    await peer.app.start()
  })

  it('waits a bit for membership to propagate', (done) => {
    setTimeout(done, A_BIT)
  })

  // it('all peers have entire membership', () => {
  //   return Promise.all(swarm.map((peer) => peer.app.ipfs.id())).then((ids) => {
  //     ids = ids.map((id) => id.id)
  //     collaborations.forEach((collaboration) => {
  //       expect(Array.from(collaboration.peers()).sort()).to.deep.equal(ids.sort())
  //     })
  //   })
  // })

  it('can push operation', async () => {
    const collaboration = await swarm[0].app.collaborate('test collaboration', 'fake', collaborationOptions)
    await collaboration.shared.add('a')
  })

  it('waits a bit', (done) => {
    setTimeout(done, 2000)
  })

  it('all replicas in sync', async () => {
    const collaborations = await Promise.all(
      swarm.map(async (peer) => peer.app.collaborate('test collaboration', 'fake', collaborationOptions)))

    await Promise.all(collaborations.map(async (collab) => {
      expect(collab.shared.value()).to.equal('a')
    }))
  })

  it('closes peer', () => {
    return swarm[swarm.length - 1].app.stop()
  })
})
