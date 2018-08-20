import React from 'react';
import NetworkVis from 'peer-star-network-vis-react'
import { withCollaboration, withCollaborationLiveValue } from 'peer-star-react'

function LiveValue ({value}) {
  return (
    <div className="App-intro">
      Value: <pre>{JSON.stringify(value)}</pre>
    </div>
  )
}

class ArrayCollaboration extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      text: '',
      pos: 0
    }

    this.LiveValue = withCollaborationLiveValue(this.props.collaboration)(LiveValue)
    this.NetworkVis = withCollaboration(this.props.collaboration)(NetworkVis)

    this.onPushClick = this.onPushClick.bind(this)
    this.onTextChange = this.onTextChange.bind(this)
    this.onPosChange = this.onPosChange.bind(this)
    this.onRemoveClick = this.onRemoveClick.bind(this)
  }

  onTextChange (event) {
    this.setState({ text: event.target.value })
  }

  onPushClick () {
    const { shared } = this.props
    shared.push(this.state.text || '')
  }

  onPosChange (event) {
    this.setState({ pos: Number(event.target.value) })
  }

  onRemoveClick (event) {
    if (typeof this.state.pos === 'number') {
      const { shared } = this.props
      shared.removeAt(this.state.pos)
    }
  }

  render() {
    const { collaboration } = this.props
    return (
      <div>
        <hr />
        <h1>Array</h1>
        <p>({collaboration.name})</p>
        <this.LiveValue />

        <div>
          <input type="text" onChange={this.onTextChange} value={this.state.text} />
          <button onClick={this.onPushClick}>push</button>
        </div>

        <div>
          <input type="text" onChange={this.onPosChange} value={this.state.pos} />
          <button onClick={this.onRemoveClick}>removeAt</button>
        </div>

        <this.NetworkVis />
      </div>
    );
  }
}

export default ArrayCollaboration
