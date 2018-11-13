const d3 = require('../../node_modules/d3/dist/d3.js')

// User configurable
const OptionDefaults = {
  samplingIntervalMS: 2000,
  targetGlobalMembershipGossipFrequencyMS: 2000,
  resetConnectionIntervalMS: 200,
  maxUnreachableBeforeEviction: 20,
  urgencyFrequencyMultiplier: 1,
  // These are specific to the simulator
  avgNetworkDelay: 400,
  avgPeerStartTime: 500,
  initialPeerCount: 1
}
// Not configurable
const options = {
  preambleByteCount: 2,
  peerIdByteCount: 32,
  nodeRadius: 10,
  paddingY: 20
}

function localStorageKey(name) {
  return 'sim.options.' + name
}

function init() {
  Object.keys(OptionDefaults).forEach(name => {
    // Use local storage to save options values between refreshes
    localStorageVal = localStorage.getItem(localStorageKey(name))
    localStorage.setItem(localStorageKey(name), localStorageVal === null ? OptionDefaults[name] : localStorageVal)
    Object.defineProperty(options, name, {
      get: () => localStorage.getItem(localStorageKey(name))
    })

    // Set up options inputs
    const div = d3.select('.controls .options').append('div')
    div.attr('class', 'option')
    div.append('label').attr('class', 'row').text(name)
    const input = div.append('input')
      .attr('type', 'text')
      .attr('name', name)
      .attr('value', localStorage.getItem(localStorageKey(name)))
    input.node().addEventListener('keyup', () => localStorage.setItem(localStorageKey(name), input.node().value))
    input.node().addEventListener('change', () => localStorage.setItem(localStorageKey(name), input.node().value))
  })

  let showDiasConnections = localStorage.getItem(localStorageKey('showDiasConnections'))
  showDiasConnections = !showDiasConnections || showDiasConnections === 'true'
  Object.defineProperty(options, 'showDiasConnections', {
    get: () => {
      const localVal = localStorage.getItem(localStorageKey('showDiasConnections'))
      return localVal === null || localVal === 'true'
    }
  })
  const diasCheck = d3.select('#dias-set-checkbox')
  diasCheck.property('checked', showDiasConnections)
  diasCheck.node().addEventListener('click', () => {
    localStorage.setItem(localStorageKey('showDiasConnections'), diasCheck.property('checked'))
  })

  // Set up reset button
  const div = d3.select('.controls .options').append('div')
  const resetButton = div.attr('class', 'option').append('button')
  resetButton.text('Reset to Defaults')
  resetButton.node().addEventListener('click', () => {
    Object.keys(OptionDefaults).forEach(name => {
      localStorage.setItem(localStorageKey(name), OptionDefaults[name])
      d3.select(`.controls .options input[name=${name}]`).node().value = OptionDefaults[name]
    })
    localStorage.setItem(localStorageKey('showDiasConnections'), true)
    diasCheck.property('checked', showDiasConnections)
  })
}

document.addEventListener('DOMContentLoaded', init)

module.exports = {
  options,
  localStorageKey
}
