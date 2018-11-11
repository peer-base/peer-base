const d3 = require('../../node_modules/d3/dist/d3.js')
const debounce = require('lodash/debounce')
const { LayoutType } = require('./layout')
const InfoBox = require('./info')
const Network = require('./network')
const Renderer = require('./renderer')

const INIT_PEER_COUNT = 1
const OptionDefaults = {
  samplingIntervalMS: 2000,
  targetGlobalMembershipGossipFrequencyMS: 2000,
  resetConnectionIntervalMS: 200,
  maxUnreachableBeforeEviction: 20,
  urgencyFrequencyMultiplier: 1,
  // These are specific to the simulator
  avgNetworkDelay: 400,
  avgPeerStartTime: 500,
}
const options = {
  preambleByteCount: 2,
  peerIdByteCount: 32,
  nodeRadius: 10,
  paddingY: 20
}
Object.keys(OptionDefaults).forEach(name => {
  // Use local storage to save options values between refreshes
  localStorageVal = localStorage.getItem(name)
  localStorage.setItem(name, localStorageVal === null ? OptionDefaults[name] : localStorageVal)
  Object.defineProperty(options, name, {
    get: () => localStorage.getItem(name)
  })

  // Set up options inputs
  const div = d3.selectAll('.controls .options').append('div')
  div.attr('class', 'option')
  div.append('label').attr('class', 'row').text(name)
  const input = div.append('input')
    .attr('type', 'text')
    .attr('name', name)
    .attr('value', localStorage.getItem(name))
  input.node().addEventListener('keyup', () => localStorage.setItem(name, input.node().value))
  input.node().addEventListener('change', () => localStorage.setItem(name, input.node().value))
})


async function init() {
  const infoBox = new InfoBox(options)

  let showDiasConnections = localStorage.showDiasConnections
  showDiasConnections = !showDiasConnections || showDiasConnections === 'true'

  const network = new Network(options)
  await Promise.all([...Array(INIT_PEER_COUNT)].map(() => network.generatePeer()))
  const renderer = new Renderer(network, showDiasConnections, options)

  d3.select('#add-node').on('click', async () => {
    await network.generatePeer()
    renderer.peerChanged()
  })

  const diasCheck = d3.select('#dias-set-checkbox').on('click', () => {
    const show = diasCheck.node().checked
    renderer.setShowDiasConnections(show)
    localStorage.showDiasConnections = show
  }).property('checked', showDiasConnections)

  d3.select('#layout-evenly').on('click', () => {
    renderer.setLayoutMode(LayoutType.Evenly)
  })
  d3.select('#layout-organic').on('click', () => {
    renderer.setLayoutMode(LayoutType.Organic)
  })
  let lastResize = null
  window.addEventListener("resize", debounce(() => {
    renderer.setLayoutMode(renderer.layoutMode)
  }, 1000))

  network.on('gossip send', () => renderer.messageGenerated())
  network.on('gossip arrive', () => renderer.renderNodes())
  network.on('membership changed', () => renderer.renderNodes())
  network.on('peer chose leader', () => renderer.renderNodes())
  network.on('peer started', () => renderer.renderNodes())
  network.on('peer removed', () => renderer.peerChanged())

  let changeStart, lastChange
  network.on('peer added', p => {
    const now = Date.now()
    lastChange = now
    changeStart = changeStart || now
    infoBox.addMessage(p, 'Peer added')
  })
  network.on('peer removed', p => {
    const now = Date.now()
    lastChange = now
    changeStart = changeStart || now
    infoBox.addMessage(p, 'Peer removed', false)
  })
  network.on('membership converged', p => {
    if (!changeStart) return

    const now = Date.now()
    const elapsed = (now - changeStart) / 1000
    const sinceChange = (now - lastChange) / 1000
    changeStart = undefined
    let msg = `Membership converged in ${elapsed}s`
    if (elapsed != sinceChange) {
      msg += ` (${sinceChange}s since last change)`
    }
    infoBox.addMessage(p, msg)
  })

  let electionStart = Date.now()
  network.on('leader removed', () => {
    electionStart = Date.now()
    infoBox.addMessage(null, 'Leader removed')
  })
  network.on('leader elected', p => {
    const elapsed = (Date.now() - electionStart) / 1000
    infoBox.addMessage(p, `${p.b58.substring(0, 8)} elected leader in ${elapsed}s`)
  })

  renderer.peerChanged()
}

init()
