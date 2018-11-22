/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const App = require('./utils/create-app')

describe('local-persistence', function () {
  this.timeout(30000)

  let appName
  let repo

  before(() => {
    appName = App.createName()
  })

  it('can create collaboration and populate it', async () => {
    const app = App(appName, { maxThrottleDelayMS: 1000 })
    await app.start()
    repo = app.app.ipfs._repo
    expect(repo).to.exist()

    const collaboration = await app.app.collaborate('local persistence test collaboration', 'rga')
    collaboration.on('saved', () => {
      console.log('collaboration saved')
    })
    collaboration.shared.push('a')
    collaboration.shared.push('b')
    expect(collaboration.shared.value()).to.deep.equal(['a', 'b'])
    await collaboration.stop()
    await app.app.stop()
  })

  it('can revive collaboration from ipfs repo', async () => {
    const app = App(appName, { maxThrottleDelayMS: 1000 }, { repo })
    await app.start()
    console.log('started app')
    const collaboration = await app.app.collaborate('local persistence test collaboration', 'rga')
    console.log('started collaboration')
    expect(collaboration.shared.value()).to.deep.equal(['a', 'b'])
    await app.stop()
  })
})
