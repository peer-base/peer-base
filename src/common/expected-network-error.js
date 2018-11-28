'use strict'

// These are some error codes that happen when the network connection has been severed.
// All these errors should then be ig
// This is not good practise, but it's a temporary measure that prevents users getting bothered
// with common network errors that are recoverable.

const EXPECTED_NETWORK_ERRORS = [
  'underlying socket has been closed',
  'stream ended with:0 but wanted:1'
]

module.exports = (err) => {
  return EXPECTED_NETWORK_ERRORS.indexOf(err.message) >= 0
}
