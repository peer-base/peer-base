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
    let saved = false
    const app = App(appName, { maxThrottleDelayMS: 1000 })
    await app.start()
    repo = app.app.ipfs._repo
    expect(repo).to.exist()

    const collaboration = await app.app.collaborate('local persistence test collaboration', 'rga')
    collaboration.shared.push('a')
    collaboration.shared.push('b')
    expect(collaboration.shared.value()).to.deep.equal(['a', 'b'])

    const sub = await collaboration.sub('sub collab', 'gset')
    sub.shared.add(1)
    sub.shared.add(2)
    expect(sub.shared.value()).to.deep.equal(new Set([1, 2]))

    collaboration.once('saved', () => { saved = true })

    await collaboration.stop()
    await app.app.stop()
    expect(saved).to.be.true()
  })

  it('can revive collaboration from ipfs repo', async () => {
    const app = App(appName, { maxThrottleDelayMS: 1000 }, { repo })
    await app.start()
    const collaboration = await app.app.collaborate('local persistence test collaboration', 'rga')
    expect(collaboration.shared.value()).to.deep.equal(['a', 'b'])
    const sub = await collaboration.sub('sub collab', 'gset')
    expect(sub.shared.value()).to.deep.equal(new Set([1, 2]))
    await app.stop()
  })
})
