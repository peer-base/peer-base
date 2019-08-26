import React from 'react'
import PeerStarApp from 'peer-base'
import NetworkVis from 'peer-star-network-vis-react'
import discussionTreeCrdt from './lib/discussion-tree-crdt'
import CollaborationStats from './CollaborationStats'
import { withCollaboration, withCollaborationLiveValue } from 'peer-star-react'

PeerStarApp.collaborationTypes.define('discussion-tree', discussionTreeCrdt)

function LiveValue ({ value }) {
  return (
    <div className='App-intro' style={{ textAlign: 'left' }}>
      Value: <pre>{JSON.stringify(value, null, '\t')}</pre>
    </div>
  )
}

class DiscussionTreeCollaboration extends React.Component {
  constructor (props) {
    super(props)

    this.LiveValue = withCollaborationLiveValue(this.props.collaboration)(LiveValue)
    this.NetworkVis = withCollaboration(this.props.collaboration)(NetworkVis)
    this.Stats = withCollaboration(this.props.collaboration)(CollaborationStats)

    this.onAddClick = this.onAddClick.bind(this)
  }

  onAddClick () {
    const message = {
      cid: this.refs.cid.value,
      parentCid: this.refs.parentCid.value,
      did: this.refs.did.value,
      signature: this.refs.signature.value
    }
    this.props.collaboration.shared.add(message)
  }

  render () {
    return (
      <div>
        <hr />
        <h1>Discussion Tree</h1>
        <this.LiveValue />

        <div>
          <input placeholder='cid' type='text' ref='cid' />
          <input placeholder='parentCid' type='text' ref='parentCid' />
          <input placeholder='did' type='text' ref='did' />
          <input placeholder='signature' type='text' ref='signature' />
          <button onClick={this.onAddClick}>add</button>
        </div>

        <this.Stats />
        <this.NetworkVis />
      </div>
    )
  }
}

export default DiscussionTreeCollaboration
