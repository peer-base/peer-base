'use strict'

const execa = require('execa')

module.exports = () => {
  let daemon

  return {
    start () {
      return new Promise((resolve, reject) => {
        daemon = execa('rendezvous')
        daemon.stdout.setEncoding('utf8')
        daemon.stdout.on('data', onStdOut)
        daemon.stderr.setEncoding('utf8')
        daemon.stderr.on('data', onStdOut)

        function onStdOut (d) {
          process.stdout.write('rendezvous: ' + d)
          if (d.toLowerCase().indexOf('listening') >= 0) {
            daemon.stdout.removeListener('data', onStdOut)
            resolve()
          }
        }
      })
    },
    stop () {
      return new Promise((resolve, reject) => {
        daemon.once('exit', resolve)
        daemon.kill()
      })
    }
  }
}
