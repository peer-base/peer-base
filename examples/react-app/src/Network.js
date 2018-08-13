import React, { Component } from 'react'
import peerColor from './lib/peer-color'
const d3 = require('d3')

class Network extends Component {
  constructor (props) {
    super(props)
    console.log('collaboration:', props.collaboration)
    this.state = {
      initialized: false
    }
  }

  render () {
    return (this.props.collaboration && (
      <svg style={{border: '1px solid red'}} ref="graph" width="960" height="600"></svg>)) || null
  }

  componentDidUpdate () {
    if (!this.state.initialized && this.refs.graph && this.props.collaboration) {
      const { collaboration } = this.props
      if (collaboration.app.ipfs.isOnline()) {
        this.setState({ initialized: true })
        this.initSimulation(this.props.collaboration)
      } else {
        collaboration.app.ipfs.once('ready', () => {
          this.setState({ initialized: true })
          this.initSimulation(this.props.collaboration)
        })
      }
    }
  }

  async initSimulation (collaboration) {
    const id = (await collaboration.app.ipfs.id()).id

    let nodes = [{id, me: true, index: 0}]
    let links = []

    const svg = d3.select(this.refs.graph)
    const width = +svg.attr('width')
    const height = +svg.attr('height')
    console.log('width:', width)
    console.log('height:', height)

    const simulation = d3.forceSimulation()
      .force('link', d3.forceLink(links).id((d) => d.id).distance(200))
      .force('charge', d3.forceManyBody().strength(-1000))
      .force('center', d3.forceCenter(0, 0))
      .alphaTarget(1)
      .on('tick', ticked)

    let g = svg.append('g').attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')')
    let link = g.append('g').attr('stroke', '#000').attr('stroke-width', 1.5).selectAll('.link')
    let node = g.append('g').attr('stroke', '#fff').attr('stroke-width', 1.5).selectAll('.node')

    const restart = () => {
      // Apply the general update pattern to the nodes.
      node = node.data(nodes, function(d) { return d.id;});
      node.exit().remove();
      node = node.enter().append('circle').attr('fill', (d) => peerColor(d.id)).attr("r", 8).merge(node);

      // Apply the general update pattern to the links.
      link = link.data(links, function(d) { return d.source.id + '-' + d.target.id; });
      link.exit().remove();
      link = link.enter().append('line').merge(link);

      // Update and restart the simulation.
      simulation.nodes(nodes);
      simulation.force("link").links(links);
      simulation.alpha(1).restart();
    }

    restart()

    function ticked () {
      if (!node) {
        return
      }

      link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y)


      node
        .attr('cx', (d) => d.x)
        .attr('cy', (d) => d.y)
    }

    collaboration.stats.on('peer updated', (peerId, stats) => {
      console.log('peer updated', peerId, stats)
      const changed = syncFromStats(peerId, stats)
      if (changed) {
        restart()
      }
    })

    collaboration.on('membership changed', (peers) => {
      nodes = nodes.filter((node) => node.me || peers.has(node.id))
      links = nodes.filter((link) => peers.has(link.source) && peers.has(link.target))
      restart()
    })


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
        changed = true
        nodes.push({id: peerId, index: nodes.length})
      }

      for(let connectedToPeerId of stats.connections.outbound) {
        const link = links.find((link) => link.source === peerId && link.target === connectedToPeerId)
        if (!link) {
          const targetExists = nodes.find((node) => node.id === connectedToPeerId)
          if (targetExists) {
            changed = true
            links.push({source: peerId, target: connectedToPeerId, value: 1})
          }
        }
      }

      return changed
    }
  }
}

export default Network

