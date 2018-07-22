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
      setTimeout(async () => {
        process.send(collaboration.shared.value())
        console.log('stopping...')
        setTimeout(() => {
          process.exit()
        }, 1000)
      }, workerData.coolDownTimeMS)
    }
  }, 1000)
}

start()