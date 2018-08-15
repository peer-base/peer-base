import React, { Component } from 'react'
import NetworkVisualization from './lib/network-visualization'
import peerColor from './lib/peer-color'

const TRAFFIC_KBYTES_DECIMAL_COUNT = 3

class Network extends Component {
  state = {
    initialized: false
  }
  constructor (props) {
    super(props)
    console.log('collaboration:', props.collaboration)

  }

  render () {
    if (!this.props.collaboration) {
      return null
    }

    let statsTable = null
    let stats = this.state.selectedPeer && this.state[this.state.selectedPeer]

    if (stats) {
      const inboundConnectionCount = stats.connections.inbound.size
      const inboundConnections = Array.from(stats.connections.inbound).sort().map((peerId) => (
        <li>{shortPeerId(peerId)}</li>
      ))

      const outboundConnectionCount = stats.connections.outbound.size
      const outboundConnections = Array.from(stats.connections.outbound).sort().map((peerId) => (
        <li>{shortPeerId(peerId)}</li>
      ))

      stats = (
        <tbody className="small">
          <tr>
            <th colspan="2" className="text-left"><h6>Connections</h6></th>
          </tr>
          <tr>
            <th scope="row">{inboundConnectionCount} inbound connections from:</th>
            <td><ul>{inboundConnections}</ul></td>
          </tr>
          <tr>
            <th scope="row">{outboundConnectionCount} outbound connections to:</th>
            <td><ul>{outboundConnections}</ul></td>
          </tr>
          <tr>
            <th colspan="2" scope="column" className="text-left"><h6>Traffic (kBytes / min)</h6></th>
          </tr>
          <tr>
            <th>Total in</th>
            <td>{tokBytes(stats.traffic.total.in)}</td>
          </tr>
          <tr>
            <th>Total out</th>
            <td>{tokBytes(stats.traffic.total.out)}</td>
          </tr>
          <tr>
            <th colspan="2" scope="column" className="text-left"><h6>Traffic by peer (kBytes / min)</h6></th>
          </tr>
          {Array.from(stats.traffic.perPeer).map(([peerId, stats]) => (
            <tr>
              <th>{shortPeerId(peerId)}</th>
              <td>
                <table>
                  <tbody>
                    <tr>
                      <th scope="row">In:</th><td>{tokBytes(stats.in)}</td>
                    </tr>
                    <tr>
                      <th scope="row">Out:</th><td>{tokBytes(stats.out)}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          ))}

          <tr>
            <th colspan="2" scope="column" className="text-left"><h6>Messages (messages / min)</h6></th>
          </tr>
          <tr>
            <th>Total in</th>
            <td>{stats.messages.total.in}</td>
          </tr>
          <tr>
            <th>Total out</th>
            <td>{stats.messages.total.out}</td>
          </tr>
          <tr>
            <th colspan="2" scope="column" className="text-left"><h6>Messages by peer (messages / min)</h6></th>
          </tr>
          {Array.from(stats.messages.perPeer).map(([peerId, stats]) => (
            <tr>
              <th>{shortPeerId(peerId)}</th>
              <td>
                <table>
                  <tbody>
                    <tr>
                      <th scope="row">In:</th><td>{stats.in}</td>
                    </tr>
                    <tr>
                      <th scope="row">Out:</th><td>{stats.out}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          ))}
        </tbody>)

      statsTable = (
        <table className="table table-sm table-dark" style={{
          width: '33%',
          float: 'left',
          overflow: 'hidden'
        }}>
          <thead>
            <tr>
              <th scope="column" colspan="2">Collaboration {this.props.collaboration.name}</th>
            </tr>
            <tr>
              <th scope="column" colspan="2">Stats for {shortPeerId(this.state.selectedPeer)}</th>
            </tr>
          </thead>
          {stats}
        </table>)
    }

    return (
      <div style={{width: '100%', height:'600px'}}>
        <svg style={{
          border: '0.5px solid grey',
          height: '600px',
          width: '66%',
          float: 'left'
        }} ref="graph"></svg>
        {this.state.selectedPeer ? (statsTable ? statsTable : <p>Waiting for stats...</p>) : <p>Click on peer...</p>}
      </div>)
  }

  componentDidUpdate () {
    if (!this.state.initialized && this.refs.graph && this.props.collaboration) {
      const { collaboration } = this.props
      if (collaboration.app.ipfs.isOnline()) {
        this.initVisualization()
      } else {
        collaboration.app.ipfs.once('ready', () => this.initVisualization())
      }
    }
  }

  componentWillUnmount () {
    if (this._vis) {
      this._vis.stop()
      this._vis.removeAllListeners('selected peer')
      this._vis.removeAllListeners('peer stats updated')
      this._vis = null
    }
  }

  async initVisualization () {
    this.setState({ initialized: true })
    this._vis = await NetworkVisualization(this.props.collaboration, this.refs.graph)
    this._vis.on('selected peer', (peerId) => {
      console.log('peer selected', peerId)
      this.setState({selectedPeer: peerId})
    })
    this._vis.on('peer stats updated', ({peerId, stats}) => {
      const stateMod = {}
      stateMod[peerId] = stats
      this.setState(stateMod)
    })
  }
}

export default Network

function tokBytes (bytes) {
  return toFixed(bytes / 1000, TRAFFIC_KBYTES_DECIMAL_COUNT)
}

function shortPeerId (peerId) {
  const shortId = peerId.slice(0, 6) + '…' + peerId.slice(peerId.length - 6)
  const color = peerColor(peerId)
  return (<span style={{color}}>{shortId}</span>)
}

function toFixed(value, precision) {
    var precision = precision || 0,
        power = Math.pow(10, precision),
        absValue = Math.abs(Math.round(value * power)),
        result = (value < 0 ? '-' : '') + String(Math.floor(absValue / power));

    if (precision > 0) {
        var fraction = String(absValue % power),
            padding = new Array(Math.max(precision - fraction.length, 0) + 1).join('0');
        result += '.' + padding + fraction;
    }
    return result;
}