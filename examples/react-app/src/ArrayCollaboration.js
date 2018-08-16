import React from 'react';
import Collaboration from './Collaboration'
import NetworkVis from 'peer-star-network-vis-react'

class ArrayCollaboration extends Collaboration {
  constructor (props) {
    super(Object.assign({}, props, { type: 'rga' }))
    this.onPushClick = this.onPushClick.bind(this)
    this.onTextChange = this.onTextChange.bind(this)
    this.onPosChange = this.onPosChange.bind(this)
    this.onRemoveClick = this.onRemoveClick.bind(this)
  }

  onTextChange (event) {
    this.setState({ text: event.target.value })
  }

  onPushClick () {
    this._collab.shared.push(this.state.text || '')
  }

  onPosChange (event) {
    this.setState({ pos: Number(event.target.value) })
  }

  onRemoveClick (event) {
    if (typeof this.state.pos === 'number') {
      this._collab.shared.removeAt(this.state.pos)
    }
  }

  render() {
    return (
      <div>
        <hr />
        <h1>Array</h1>
        <p>({this._collab && this._collab.name})</p>
        <div className="App-intro">
          Value: <pre>{JSON.stringify(this.state.value)}</pre>
        </div>

        <div>
          <input type="text" onChange={this.onTextChange} value={this.state.text} />
          <button onClick={this.onPushClick}>push</button>
        </div>

        <div>
          <input type="text" onChange={this.onPosChange} value={this.state.pos} />
          <button onClick={this.onRemoveClick}>removeAt</button>
        </div>

        <p>Have {this.state.peers.size} peers for this collaboration (myself included)</p>
        <p>Outbound connection count: {this.state.outboundConnectionCount}</p>
        <p>Inbound connection count: {this.state.inboundConnectionCount}</p>
        <NetworkVis collaboration={this._collab} />
      </div>
    );
  }
}

export default ArrayCollaboration
