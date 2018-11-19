# peer-star-app Interfaces

## Types

### `peerId`

String

### `Clock`

Plain JS Object containing mapping `PeerId` to positive integers.

### `States`

Plain JS Object containing mapping a state name (String) to a state (Any).

### `ClockAndStates`

Plain JS Array with the following items in the following positions:

* 0: Clock
* 1: States

### `DeltaRecord`

Array with the following positions:

* 0: previousClock:Clock
* 1: authorClock:Clock
* 2: delta:Any

## Local Collaboration Store

### Factory methods

#### `LocalCollaborationStore.create (ipfs:IPFS, collaboration:Collaboration [, options:Object]) : LocalCollaborationStore`

Options:

* `deltaTrimTimeoutMS`: positive inteher
* `maxDeltaRetention`: positive inteher

### `LocalCollaborationStore` instance methods

#### `async start ()`

#### `async stop ()`

#### `async getLatestClock () : Clock`

#### `contains (clock:Clock]`

#### `async saveDelta (delta:DeltaRecord)`

#### `deltaStream ([since:Clock]) : PullStream<DeltaRecord>`

#### `deltaBatch ([since:Clock]) : DeltaRecord`

#### `async saveStates (clock:Clock, states:States)`

#### `async getState ([name]) : Any`

#### `async getStates () : States`

#### `async getClockAndStates () : ClockAndStates`


### Produced events

#### `delta (delta : Any, newClock : Clock)`

#### `clock changed (clock : Clock)`

#### `state changed (state : Any, newClock : Clock)`

