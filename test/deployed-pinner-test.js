'use strict'

// This test is a standalone nodejs script that tests that a pinner functions
// as we expect it to
//
// In short, it works in the following steps:
// 1. Start a new collaboration
// 2. Change the shared state
// 3. Wait for it to be pinned
// 4. Stop the collaboration started in step 1
// 5. Start a new collaboration
// 6. Wait for the shared state to change
// 7. Make sure the shared state is the same as it was in step 3
//
// You can override the configuration values here by specifying the following
// environment variables:
// - PEER_BASE_APP_NAME - What PeerStarApp application name to use
// - PEER_BASE_SWARM_ADDRESS - Which rendezvous server to use
// - PEER_BASE_PINNER_ID - What PeerID the pinner we test against have

if (!process.env.DEBUG) {
  process.env.DEBUG = 'peer-base:pinner-test'
}

const path = require('path')
const os = require('os')
const assert = require('assert')

const log = require('debug')('peer-base:pinner-test')

const peerStarApp = require('../src')

// Environment variable OR default value
const envVarOrDefVal = (envVar, defVal) => {
  return process.env['PEER_BASE_' + envVar] || defVal
}

const defaultAppName = 'peer-pad/2'
const defaultSwarmAddress = '/dns4/localhost/tcp/9090/ws/p2p-websocket-star'
const defaultPinnerID = 'Qmb9WDZUnUzEmZwkbMMGi4cV65F1sqcQa49dfZy9baRBJo'

const appName = envVarOrDefVal('APP_NAME', defaultAppName)
const swarmAddress = envVarOrDefVal('SWARM_ADDRESS', defaultSwarmAddress)
const pinnerID = envVarOrDefVal('PINNER_ID', defaultPinnerID)

// How long we should wait for events in the waitForEvent function
const WAIT_FOR_EVENT_TIMEOUT = 1000 * 10

// Helper function to convert to JSON-as-a-string (JaaS)
const toJSONStr = (obj) => JSON.stringify(obj)

// Assertion-helper for a collaborations shared state
const assertSharedValue = (collab, expected) => {
  const value = collab.shared.value()
  log(`Asserting ${toJSONStr(value)} is equal to ${toJSONStr(expected)}`)
  assert.deepStrictEqual(value, expected)
}

// Assertion-helper for making sure a collaborations shared state is empty
const assertEmptySharedValue = (collab) => {
  assertSharedValue(collab, [])
}

// Waits for event `eventName` for `WAIT_FOR_EVENT_TIMEOUT`ms, otherwise fail
const waitForEvent = (ee, eventName) => new Promise((resolve, reject) => {
  log(`Waiting for event '${eventName}'`)
  const timeoutID = setTimeout(() => {
    log(`Timeout reached for event '${eventName}'`)
    reject(new Error(`Timeout reached when waiting for '${eventName}' event`))
  }, WAIT_FOR_EVENT_TIMEOUT)
  ee.on(eventName, function () {
    log(`Got event '${eventName}'`)
    clearTimeout(timeoutID)
    resolve(arguments)
  })
})

// Specifically wait for the `pinning` event from `expectedID` as the PeerID
const waitForPinning = async (collab, expectedID) => {
  const args = await waitForEvent(collab.replication, 'pinning')
  log(`Asserting '${args[0]}' is equal to '${expectedID}'`)
  assert.deepStrictEqual(args[0], expectedID)
}

// Specifically wait for the `pinned` event from `expectedID` as the PeerID
const waitForPinned = async (collab, expectedID) => {
  const args = await waitForEvent(collab.replication, 'pinned')
  log(`Asserting '${args[0]}' is equal to '${expectedID}'`)
  assert.deepStrictEqual(args[0], expectedID)
}

// Waits for the shared state to change
const waitForStateChanged = async (collab) => {
  await waitForEvent(collab, 'state changed')
}

// Pushes and returns a random element into the shared state
const pushRandomSharedItem = (collab) => {
  const testValue = Math.random()
  log(`Adding random test value '${testValue}' teo shared stat`)
  collab.shared.push(testValue)
  return testValue
}

// Starts a new app + collaboration with `collabName`
const startCollab = (collabName) => new Promise(async (resolve) => {
  log(`Creating a new PeerStarApp`)
  const app = peerStarApp(appName, {
    ipfs: {
      repo: path.join(os.tmpdir(), 'pinner-repo-' + Math.random()),
      swarm: [swarmAddress]
    }
  })
  await app.start()
  log(`PeerStarApp started`)

  const myID = await app.ipfs.id()
  log(`PeerStarApp PeerID: ${myID.id}`)

  log(`Starting new collaboration`)
  const collab = await app.collaborate(collabName, 'rga')
  log(`New collaboration started`)

  resolve({ app, collab })
})

// Stops a PeerStarApp + it's collaboration
const stop = async (app, collab) => {
  log(`Stopping PeerStarApp and collaboration`)
  await collab.stop()
  await app.stop()
  log(`Stopped`)
}

// Main test function
async function start () {
  const collabName = 'test-' + Math.random()
  const { app: app1, collab: collab1 } = await startCollab(collabName)
  assertEmptySharedValue(collab1)
  const testValue = pushRandomSharedItem(collab1)
  await waitForPinning(collab1, pinnerID)
  await waitForPinned(collab1, pinnerID)
  assertSharedValue(collab1, [testValue])
  await stop(app1, collab1)

  log('Waiting a bit before continuing')
  await new Promise(resolve => setTimeout(resolve, 2500))

  // Second application joining after first left
  const { app: app2, collab: collab2 } = await startCollab(collabName)
  assertEmptySharedValue(collab2)
  await waitForStateChanged(collab2)
  assertSharedValue(collab2, [testValue])
  await stop(app2, collab2)

  console.log('If you see this message, everything went OK!')
}

start()
