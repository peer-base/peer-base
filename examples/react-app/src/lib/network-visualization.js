import peerColor from './peer-color'
import EventEmitter from 'events'
const d3 = require('d3')

export default async function initVisualization (collaboration, graph) {
  const id = (await collaboration.app.ipfs.id()).id
  const emitter = new EventEmitter()

  let nodes = [{id, me: true}]
  let links = []

  const svg = d3.select(graph)
  const bbox = svg.node().getBoundingClientRect()
  const {width, height} = bbox
  console.log('width:', width)
  console.log('height:', height)

  const simulation = d3.forceSimulation()
    .force('link', d3.forceLink(links).id((d) => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-50))
    .force('center', d3.forceCenter(0, 0))
    .alphaTarget(1)
    .on('tick', ticked)

  let g = svg.append('g').attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')')
  let link = g.append('g').selectAll('.link')
  let node = g.append('g').attr('stroke', '#fff').attr('stroke-width', 1.5).selectAll('.node')

  const restart = () => {
    // Apply the general update pattern to the nodes.
    node = node.data(nodes, function(d) { return d.id;});
    node.exit().remove();
    node = node.enter()
      .append('circle')
        // .data('id', (d) => d.id)
        .attr('class', 'node')
        .attr('id', (d) => d.id)
        .attr('fill', (d) => peerColor(d.id))
        .attr('r', (node) => node.me ? 16 : 8).merge(node)
        .on('click', function () {
          node.attr('stroke', '#fff')
          const selection = d3.select(this)
          console.log('selection:', selection)
          selection.attr('stroke', '#000')
          emitter.emit('selected peer', this.id)
        })
        .call(d3.drag()
          .on('start', dragStarted)
          .on('drag', dragged)
          .on('end', dragEnded))

    // Apply the general update pattern to the links.
    link = link.data(links, function(d) { return d.source.id + '-' + d.target.id; });
    link.attr('stroke', (d) => peerColor(d.source.id))
    link.attr('stroke-width', (d) => Math.max(Math.sqrt(d.traffic / 5), 0.5))
    link.exit().remove();
    link = link.enter().append('line').merge(link);

    // Update and restart the simulation.
    simulation.nodes(nodes);
    simulation.force('link').links(links);
    simulation.alpha(1).restart();
  }

  const onPeerStatsUpdated = (peerId, stats) => {
    console.log('peer updated', peerId, stats)
    const changed = syncFromStats(peerId, stats)
    if (changed) {
      restart()
    }
    emitter.emit('peer stats updated', { peerId, stats })
  }

  collaboration.stats.on('peer updated', onPeerStatsUpdated)

  const onMembershipChanged = (peers) => {
    console.log('membership changed', peers)
    let changed = false
    nodes = nodes.filter((node) => node.me || peers.has(node.id))
    for(let peerId of peers) {
      const found = nodes.find((node) => node.id === peerId)
      if (!found) {
        changed = true
        nodes.push({id:peerId})
      }
    }
    links = links.filter((link) => {
      const has = peers.has(link.source.id) && peers.has(link.target.id)
      if (!has) {
        changed = true
      }
      return has
    })

    if (changed) {
      restart()
    }
  }

  restart()

  collaboration.on('membership changed', onMembershipChanged)

  return Object.assign(emitter, {
    stop: () => {
      collaboration.stats.removeListener('peer updated', onPeerStatsUpdated)
      collaboration.removeListener('membership changed', onMembershipChanged)
      simulation.on('tick', null)
    }
  })

  function ticked () {
    if (!node) {
      return
    }

    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x - ((d.target.x - d.source.x) / 2))
      .attr('y2', (d) => d.target.y - ((d.target.y - d.source.y) / 2))


    node
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y)
  }

  function dragStarted(d) {
    if (!d3.event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
  }

  function dragEnded(d) {
    if (!d3.event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  function syncFromStats (peerId, stats) {
    let changed = false
    const found = nodes.find((node) => node.id === peerId)
    if (!found) {
      return false
    }

    for(let connectedToPeerId of stats.connections.outbound) {
      console.log('links:', links)
      const link = links.find((link) => link.source.id === peerId && link.target.id === connectedToPeerId)
      if (!link) {
        const targetExists = nodes.find((node) => node.id === connectedToPeerId)
        if (targetExists) {
          changed = true
          const peerTraffic = stats.traffic.perPeer.get(connectedToPeerId)
          const outboundTraffic = (peerTraffic && peerTraffic.out) || 0
          console.log('outboundTraffic:', outboundTraffic)
          links.push({source: peerId, target: connectedToPeerId, traffic: outboundTraffic})
        }
      } else {
        const peerTraffic = stats.traffic.perPeer.get(connectedToPeerId)
        const outboundTraffic = (peerTraffic && peerTraffic.out) || 0
        if (outboundTraffic !== link.traffic) {
          link.traffic = outboundTraffic
          changed = true
        }
      }
    }

    return changed
  }
}