'use strict'

const rimraf = require('rimraf')

module.exports = (dir) => {
  try {
    rimraf.sync(dir)
  } catch (err) {
    // Does not exist so all good
  }
}
