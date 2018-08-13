import React from 'react';
import Collaboration from './Collaboration'
import Network from './Network'

class GCounterCollaboration extends Collaboration {
  constructor (props) {
    super(Object.assign({}, props, { type: 'gcounter' }))
    this.onIncrementClick = this.onIncrementClick.bind(this)
  }

  onIncrementClick () {
    this._collab.shared.inc()
  }

  render() {
    return (
      <div>
        <hr />
        <h1>G-Counter</h1>
        <p>({this._collab && this._collab.name})</p>
        <div className="App-intro">
          Value: <pre>{JSON.stringify(this.state.value)}</pre>
        </div>
        <button onClick={this.onIncrementClick}>+</button>
        <p>Have {this.state.peers.size} peers for this collaboration (myself included)</p>
        <p>Outbound connection count: {this.state.outboundConnectionCount}</p>
        <p>Inbound connection count: {this.state.inboundConnectionCount}</p>
        <Network collaboration={this._collab} />
      </div>
    );
  }
}

export default GCounterCollaboration
