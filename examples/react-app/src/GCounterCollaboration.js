import React from 'react'
import NetworkVis from 'peer-star-network-vis-react'
import { withCollaboration, withCollaborationLiveValue } from 'peer-star-react'
import CollaborationStats from './CollaborationStats'

function LiveValue ({ value }) {
  return (
    <div className='App-intro'>
      Value: <pre>{JSON.stringify(value)}</pre>
    </div>
  )
}

class GCounterCollaboration extends React.Component {
  constructor (props) {
    super(props)
    this.onIncrementClick = this.onIncrementClick.bind(this)
    this.LiveValue = withCollaborationLiveValue(this.props.collaboration)(LiveValue)
    this.NetworkVis = withCollaboration(this.props.collaboration)(NetworkVis)
    this.Stats = withCollaboration(this.props.collaboration)(CollaborationStats)
  }

  onIncrementClick () {
    this.props.shared.inc()
  }

  render () {
    const { collaboration } = this.props
    return (
      <div>
        <hr />
        <h1>G-Counter</h1>
        <p>({collaboration.name})</p>
        <this.LiveValue />
        <button onClick={this.onIncrementClick}>+</button>
        <this.Stats />
        <this.NetworkVis />
      </div>
    )
  }
}

export default GCounterCollaboration
