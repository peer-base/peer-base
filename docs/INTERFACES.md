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

### `Delta`

A JS array containing the following entries:

* 0: forName : String|null — the name of the collaboration. `null` refers to the root collaboration
* 1: typeName : String — the name of the type of CRDT
* 2: encryptedState : Buffer

### `DeltaRecord`

Array with the following positions:

* 0: previousClock:Clock
* 1: authorClock:Clock
* 2: delta:Delta

## Local Collaboration Store

### Factory methods

#### `LocalCollaborationStore.create (ipfs:IPFS, collaboration:Collaboration [, options:Object]) : LocalCollaborationStore`

Options:

* `deltaTrimTimeoutMS`: positive inteher
* `maxDeltaRetention`: positive inteher

### `LocalCollaborationStore` instance methods

#### `async start ()`

#### `async stop ()`

#### `setShared (shared : Shared)`

#### `async getLatestClock () : Clock`

#### `contains (clock:Clock]`

#### `async saveDelta (delta:DeltaRecord) : Boolean`

Returns the new vector clock if delta was causally (type Clock) consistent, `false` otherwise

#### `deltaStream ([since:Clock]) : PullStream<DeltaRecord>`

#### `deltaBatch ([since:Clock]) : DeltaRecord`

#### `async saveStates (clock:Clock, states:States)`

#### `async getState ([name]) : Any`

#### `async getStates () : States`

#### `async getClockAndStates () : ClockAndStates`


### Produced events

#### `delta (delta : Delta, newClock : Clock)`

#### `clock changed (clock : Clock)`

#### `state changed (state : Any, newClock : Clock)`

