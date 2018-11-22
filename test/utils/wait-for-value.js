'use strict'

const isEqual = require('lodash/isEqual')

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
      if (isEqual(currentValue, value)) {
        collaboration.shared.removeListener('state changed', onStateChanged)
        setTimeout(resolve, 100)
      }
    }
    const currentValue = collaboration.shared.value()
    if (isEqual(currentValue, value)) {
      resolve()
    } else {
      collaboration.shared.on('state changed', onStateChanged)
    }
  })
}
