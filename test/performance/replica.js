'use strict'

const PeerStar = require('../../')

const args = process.argv[2]
const workerData = JSON.parse(args)
console.log('workerData:', workerData)

const App = require('../utils/create-app')

const start = async () => {
  console.log('starting peer...')
  const peer = App(
    { maxThrottleDelayMS: 1000 },
    {
      // swarm: ['/dns4/ws-star1.par.dwebops.pub/tcp/443/wss/p2p-websocket-star']
      // swarm: ['/dns4/ws-star2.sjc.dwebops.pub/tcp/443/wss/p2p-websocket-star'],
      swarm: ['/ip4/127.0.0.1/tcp/9090/ws/p2p-websocket-star']
    }
  )
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
    let pushed = 0
    console.log('starting load...')
    const id = collaboration.app.ipfs._peerInfo.id.toB58String()
    const intervalMS = 1000 / workerData.opsPerSecond
    const data = workerData.data

    collaboration.on('state changed', () => {
      // console.log('%s: state changed to', id, collaboration.shared.value())
      const clock = collaboration.vectorClock()
      // console.log('clock:', clock)
      if (!clock.hasOwnProperty(id)) {
        return;
      }
      const selfClock = clock[id]
      if (selfClock !== pushed) {
        // console.error('%s: self clock should be %d and is ', id, pushed, selfClock)
        // throw new Error('Clock mismatch')
      }
    })

    const interval = setInterval(() => {
      const datum = data.shift()
      // process.stdout.write('' + datum)
      // process.stdout.write('.')
      if (!data.length) {
        stop()
      }
      // console.log('%s: pushing', id, datum)
      pushed ++
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