import React from 'react';
import Collaboration from './Collaboration'
import Diff from 'fast-diff'

class TextCollaboration extends Collaboration {
  constructor (props) {
    super(Object.assign({}, props, { type: 'rga' }))
    this.onTextChange = this.onTextChange.bind(this)
    this.cursor = {}
    this.onKeyUp = this.onKeyUp.bind(this)
  }

  onTextChange (event) {
    this.applyChanges(event.target, event.target.value)
  }

  onKeyUp (event) {
    this.saveCursorPos()
  }

  applyChanges (target, newText) {
    const oldText = (this.state.value && this.state.value.join('')) || ''
    const diffs = Diff(oldText, newText)
    let pos = 0
    diffs.forEach((d) => {
      if (d[0] === 0) { // EQUAL
        pos += d[1].length
      } else if (d[0] === -1) { // DELETE
        const delText = d[1]
        for (let i = delText.length - 1; i >=0; i--) {
          this._collab.shared.removeAt(pos + i)
        }
      } else { // INSERT
        d[1].split('').forEach((c) => {
          this._collab.shared.insertAt(pos, d[1])
        })
        pos += d[1].length
      }
    })

    this.saveCursorPos()
  }

  saveCursorPos () {
    this.cursor.start = this.refs.collaborativeTextArea.selectionStart
    this.cursor.end = this.refs.collaborativeTextArea.selectionEnd
  }

  restoreCursorPos () {
    // this.refs.collaborativeTextArea.selectionStart = this.cursor.start
    // this.refs.collaborativeTextArea.selectionEnd = this.cursor.end
  }

  componentDidUpdate () {
    this.restoreCursorPos()
  }

  render() {
    return (
      <div>
        <hr />
        <h1>Text</h1>
        <div className="App-intro">
          Value: <pre>{JSON.stringify(this.state.value)}</pre>
        </div>

        <div>
          <textarea
            ref="collaborativeTextArea"
            onChange={this.onTextChange}
            onKeyUp={this.onKeyUp}
            onClick={this.onKeyUp}
            value={((this.state.value !== undefined) && this.state.value.join('')) || ''} />
        </div>

        <p>Have {this.state.peers.size} peers for this collaboration (myself included)</p>
        <p>Outbound connection count: {this.state.outboundConnectionCount}</p>
        <p>Inbound connection count: {this.state.inboundConnectionCount}</p>
      </div>
    );
  }
}

export default TextCollaboration
