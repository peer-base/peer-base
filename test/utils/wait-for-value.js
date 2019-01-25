'use strict'

const isEqual = require('lodash/isEqual')
const debug = require('debug')('peer-base:tests:waitforvalue')

module.exports = (collaborations, value) => {
  if (!Array.isArray(collaborations)) {
    collaborations = [collaborations]
  }

  return Promise.all(collaborations.map((collaboration) => waitForCollaborationValue(collaboration, value)))
}

function waitForCollaborationValue (collaboration, value) {
  return new Promise((resolve) => {
    const onStateChanged = () => {
      const currentValue = collaboration.shared.value()
      debug('state changed. new value:', currentValue)
      if (isEqual(currentValue, value)) {
        collaboration.shared.removeListener('state changed', onStateChanged)
        setTimeout(resolve, 100)
      }
    }
    const currentValue = collaboration.shared.value()
    debug('current value:', currentValue)
    if (isEqual(currentValue, value)) {
      debug('done')
      resolve()
    } else {
      collaboration.shared.on('state changed', onStateChanged)
    }
  })
}
