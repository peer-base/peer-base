'use strict'

module.exports = (message) => {
  return (what) => {
    let m = message
    if (what) {
      m += ': ' + JSON.stringify(what)
    }
    throw new Error(m)
  }
}
