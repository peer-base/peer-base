import React, { Component } from 'react';
import { Redirect } from 'react-router-dom';
import PeerStar, { keys as Keys } from 'peer-star-app'

export default class CreateKey extends Component {
  state = {}
  constructor (props) {
    super(props)
    console.log('generating keys...')
    Keys.generate().then((keys) => {
      this.setState({
        name: PeerStar.generateRandomName(),
        keys
      })
    })
  }

  render () {
    if (!this.state.keys) {
      return (<p>Generating keys...</p>)
    }

    const keys = this.state.keys
    this.state.keys = null
    return (<Redirect to={`${this.props.match.url}/${this.state.name}/${Keys.uriEncode(keys)}`} />)
  }

}
