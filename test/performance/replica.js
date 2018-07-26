'use strict'

const PeerStar = require('../../')

const args = process.argv[2]
const workerData = JSON.parse(args)
console.log('workerData:', workerData)

const App = require('../utils/create-app')

const start = async () => {
  console.log('starting peer...')
  const peer = App({ maxThrottleDelayMS: 1000 })
  peer.app.on('error', (err) => {
    console.log('Error on app:', err)
  })
  await peer.start()

  console.log('starting collaboration...')
  const collaboration = await peer.app.collaborate(
    workerData.collaborationName,
    'rga',
    {
      keys: await PeerStar.keys.uriDecode(workerData.keys)
    })

  collaboration.on('error', (err) => {
    console.log('Error on collaboration:', err)
  })

  // let stateChanges = 0
  // collaboration.on('state changed', () => {
  //   stateChanges ++
  //   console.log('worker %s has %d state changes', workerData.workerId, stateChanges)
  // })

  setTimeout(() => {
    console.log('starting load...')
    const intervalMS = 1000 / workerData.opsPerSecond
    const data = workerData.data
    const interval = setInterval(() => {
      const datum = data.shift()
      process.stdout.write('' + datum)
      process.stdout.write('.')
      if (!data.length) {
        stop()
      }
      collaboration.shared.push(datum)
    }, intervalMS)

    function stop () {
      console.log('cooling down...')
      clearInterval(interval)
      let debugEnabled = false
      let stopStarted = Date.now()
      scheduleStopPoll()

      function scheduleStopPoll () {
        setTimeout(() => {
          if (!pollForFinalDataLength()) {
            scheduleStopPoll()
          }
        }, 2000)
      }

      function pollForFinalDataLength () {
        if (workerData.enablDebug && ((Date.now() - stopStarted) > 5000) && !debugEnabled) {
          console.log('%s: ENABLING DEBUGGING', workerData.workerId)
          debugEnabled = true
          PeerStar.debug.enable('peer-star:collaboration:*')
        }
        const l = collaboration.shared.value().length
        console.log('%s: current length: %d', workerData.workerId, l)
        console.log('%s: collaboration:', workerData.workerId, {
          peerId: collaboration.app.ipfs._peerInfo.id.toB58String(),
          inboundConnectionCount: collaboration.inboundConnectionCount(),
          outboundConnectionCount: collaboration.outboundConnectionCount(),
          inboundConnectedPeers: collaboration.inboundConnectedPeers(),
          ouboundConnectedPeers: collaboration.outboundConnectedPeers(),
          vertices: Array.from(collaboration.shared.state()[2]).length,
          clock: collaboration.vectorClock(),
          value: collaboration.shared.value()
          // state: collaboration.shared.state()
        })
        if (l === workerData.expectedLength) {
          console.log('stopping...')
          process.send(collaboration.shared.value())
          return true
        }
      }
    }
  }, 1000)
}

start()