'use strict'

function removedFrom (a, b) {
  return new Set([...a].filter((v) => !b.has(v)))
}

module.exports = (a, b) => ({
  removed: removedFrom(a, b),
  added: removedFrom(b, a),
})

