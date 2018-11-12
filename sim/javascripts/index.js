const d3 = require('../../node_modules/d3/dist/d3.js')
const debounce = require('lodash/debounce')
const { LayoutType } = require('./layout')
const InfoBox = require('./info')
const Network = require('./network')
const Renderer = require('./renderer')
const { options, localStorageKey } = require('./options')

async function init() {
  const infoBox = new InfoBox(options)
  const network = new Network(options)
  await Promise.all([...Array(parseInt(options.initialPeerCount))].map(() => network.generatePeer()))
  const renderer = new Renderer(network, options)

  d3.select('#add-node').on('click', async () => {
    await network.generatePeer()
    renderer.peerChanged()
  })
  d3.select('#layout-evenly').on('click', () => {
    renderer.setLayoutMode(LayoutType.Evenly)
  })
  d3.select('#layout-organic').on('click', () => {
    renderer.setLayoutMode(LayoutType.Organic)
  })
  d3.select('#dias-set-checkbox').on('click', () => {
    renderer.renderDiasSetConnections()
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

document.addEventListener('DOMContentLoaded', init)
