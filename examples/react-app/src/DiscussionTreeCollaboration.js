import React from 'react';
import Collaboration from './Collaboration'
import PeerStarApp from 'peer-star-app'
import discussionTreeCrdt from './lib/discussion-tree-crdt'

console.log(PeerStarApp.collaborationTypes)
PeerStarApp.collaborationTypes.define('discussion-tree', discussionTreeCrdt)

class DiscussionTreeCollaboration extends Collaboration {
  constructor (props) {
    super(Object.assign({}, props, { type: 'discussion-tree' }))
    this.onAddClick = this.onAddClick.bind(this)
  }

  onTextChange (event) {
    this.setState({ text: event.target.value })
  }

  onAddClick () {
    const message = {
      cid: this.refs.cid.value,
      parentCid: this.refs.parentCid.value,
      did: this.refs.did.value,
      signature: this.refs.signature.value
    }
    this._collab.shared.add(message)
  }

  onPosChange (event) {
    this.setState({ pos: Number(event.target.value) })
  }

  render() {
    return (
      <div>
        <hr />
        <h1>Discussion Tree</h1>
        <div className="App-intro">
          Value: <pre style={{textAlign: 'left'}}>{JSON.stringify(this.state.value, null, '  ')}</pre>
        </div>

        <div>
          <input placeholder="cid" type="text" ref="cid" />
          <input placeholder="parentCid" type="text" ref="parentCid" />
          <input placeholder="did" type="text" ref="did" />
          <input placeholder="signature" type="text" ref="signature" />
          <button onClick={this.onAddClick}>add</button>
        </div>

        <p>Have {this.state.peers.size} peers for this collaboration (myself included)</p>
        <p>Outbound connection count: {this.state.outboundConnectionCount}</p>
        <p>Inbound connection count: {this.state.inboundConnectionCount}</p>
      </div>
    );
  }
}

export default DiscussionTreeCollaboration
