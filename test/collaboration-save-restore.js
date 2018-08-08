/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const crypto = require('libp2p-crypto')
const PeerStar = require('../')
const App = require('./utils/create-app')

describe('collaboration save and restore', function () {
  this.timeout(20000)
  let seeder
  let collab
  let seed
  let leach

  before(async () => {
    seeder = App({ maxThrottleDelayMS: 1000 })
    const p = seeder.app.start()
    seeder.app.ipfs.once('ready', () => {
      seeder.app.ipfs.config.get().then((config) => {
        console.log(config)
      })
    })

    return p
  })

  // before((done) => {
  //   setTimeout(done, 10000)
  // })

  before(async () => {
    collab = await seeder.app.collaborate('save and restore test collab', 'rga')
    collab.shared.push('a')
    collab.shared.push('b')
  })

  it('saves state to the DHT', async() => {
    seed = await collab.save()
    console.log('seed:', seed.toString())
    expect(Buffer.isBuffer(seed)).to.be.true()
  })

  it.skip('stops app', () => {
    return seeder.app.stop()
  })

  it('creates replica from seed', async () => {
    leach = App({ maxThrottleDelayMS: 1000 })
    await leach.app.start()
    const collab = await leach.app.collaborate('save and restore test collab', 'rga')
    await collab.restore(seed)
    expect(collab.shared.value()).to.deep.equal(['a', 'b'])
  })
})
