'use strict'

const debounce = require('lodash/debounce')

module.exports = (emitter, event, debounceMS) => {
  return new Promise((resolve) => {
    const listener = () => {
      emitter.removeListener(event, debounced)
      resolve()
    }
    const debounced = debounce(listener, debounceMS)

    emitter.on(event, debounced)
  })
}
