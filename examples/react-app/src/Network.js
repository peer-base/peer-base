import React, { Component } from 'react'
import NetworkVisualization from './lib/network-visualization'

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
        this.initVisualization()
      } else {
        collaboration.app.ipfs.once('ready', () => this.initVisualization())
      }
    }
  }

  componentWillUnmount () {
    if (this._destroyVisualization) {
      this._destroyVisualization()
    }
  }

  async initVisualization () {
    this.setState({ initialized: true })
    this._destroyVisualization = await NetworkVisualization(this.props.collaboration, this.refs.graph)
  }
}

export default Network
