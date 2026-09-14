
import { mapsEqual } from '../libs/comapre.lib.ts'
import type { CRDTLibrary, Serializer } from './crdt.interface.ts'
import { InvalidOperationError } from './operation.exception.ts'

/**
 * 
 * An operation based implementation of the bounded counter CRDT.
 * This counter is able to maintain a non-negative value by
 * explicitly exchanging permissions to execute decrement operations.
 * All operations on this CRDT are monotonic and do not keep extra tombstones.
 * 
 * The rule of non-negative is based on the constraint of MAX GLOBAL DECREMENT VALUE,
 * where specific user can decrease to specific number, 
 * which total of all user equal the current counter value
 */

export type ID = string

// [ID, ...Payloads]
export type CounterBoundedOperation =
  | [from_id: ID, type: "decrement", value: number]
  | [from_id: ID, type: "increment", value: number] 
  | [from_id: ID, type: "transfer",  value: number, to_id: ID]

type HashedPairID = string

export type CounterBoundedInternalState = {
  transfer: Map<HashedPairID, number>,
  decrement: Map<ID, number>
}

// function get_increment_value_from_transfer_map(id: ID, state: CounterBoundedInternalState): number {
//   return [...state.transfer].filter(([key]) => {
//         const [from_id, to_id] = key.split("->");
//         return from_id === id && id === to_id ;
//       }).map((record: [string, number]) => record[1])
//       .reduce((acc: number, value: number) => acc + value, 0)
// }

function get_granted_decrement_value_from_transfer_map(id: ID, state: CounterBoundedInternalState): number {
  const received = [...state.transfer].filter(([key]) => {
        const [_, to_id] = key.split("->");
        return to_id === id;
      }).map((record: [string, number]) => record[1])
      .reduce((acc: number, value: number) => acc + value, 0)

  const granted = [...state.transfer].filter(([key]) => {
        const [from_id, to_id] = key.split("->");
        return from_id === id && to_id !== id  ;
      }).map((record: [string, number]) => record[1])
      .reduce((acc: number, value: number) => acc + value, 0)

  return received - granted;
}

function get_value_from_decrement_map(id: ID, state: CounterBoundedInternalState): number {
  return [...state.decrement].filter(([key_id]) => key_id === id)
  .map((record: [ID, number]) => record[1])
  .reduce((acc: number, value: number) => acc + value, 0)
}

function get_global_value_from_counter_bounded(state: CounterBoundedInternalState): number {
    const total_increment = [...state.transfer].filter(([key]) => {
        const [from_id, to_id] = key.split("->");
        return from_id === to_id ;
      }).map((record: [string, number]) => record[1])
      .reduce((acc: number, value: number) => acc + value, 0)
      
    const totle_decrement = [...state.decrement]
      .map((record: [string, number]) => record[1])
      .reduce((acc: number, value: number) => acc + value, 0)

    return total_increment - totle_decrement
}

function make_hash_with_pair(id1: ID, id2: ID): HashedPairID {
  // need more secured and right hash algorithm 
  return `${id1}->${id2}`;
}

export class CounterBoundedCRDT implements CRDTLibrary<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation> {
  initialize_state(): CounterBoundedInternalState {
    const transfer = new Map<HashedPairID, number>()
    const decrement = new Map<ID, number>()

    const state = {
      transfer: transfer,
      decrement: decrement
    };
    
    // this.internal_state = state
    return state
  }

  get_value(state: CounterBoundedInternalState): CounterBoundedInternalState {
    return state;
  }

  update(localOperation: CounterBoundedOperation, state: CounterBoundedInternalState): CounterBoundedInternalState {
    const [actor_id, type, value, to_id] = localOperation
    switch (type) {
      case 'increment': return this.increase(actor_id, value, state)
      case 'decrement': return this.decrease(actor_id, value, state)
      case 'transfer':  return this.transfer(actor_id, value, to_id, state);
    }
  }

  equal(state1: CounterBoundedInternalState, state2: CounterBoundedInternalState): boolean {
    // Need deep comparison based on all of the key that 2 states have
    return (
      mapsEqual(state1.transfer, state2.transfer) &&
      mapsEqual(state1.decrement, state2.decrement)
    );
  }

  downstream(remoteOperation: CounterBoundedOperation, state: CounterBoundedInternalState): CounterBoundedOperation {
    const [actor_id, type, value, to_id] = remoteOperation;
    if (!Number.isInteger(value) || value <= 0) {
      throw new InvalidOperationError("Operation value must be a positive integer");
    }
    
    if (type === 'decrement') return this.generata_downstream_check([actor_id, 'decrement', value], actor_id, state, value);
    if (type === 'transfer') return this.generata_downstream_check([actor_id, 'transfer', value, to_id], actor_id, state, value);
    return [actor_id, 'increment', value]
  }

  require_state_downstream(remoteOperation: CounterBoundedOperation): boolean {
    const [_, type, ] = remoteOperation
    return type !== 'increment'
  }

  // Don't sure that javascript/typescript have real casting based on type
  is_operation(operation: unknown): operation is CounterBoundedOperation {
    if (!Array.isArray(operation)) { return false; }

    const [id, type, value, toId] = operation;
    if (typeof id !== "string")     { return false; }
    if (typeof value !== "number")  { return false; }

    switch (type) {
      case "increment":
      case "decrement":
        return operation.length === 3;
      case "transfer":
        return operation.length === 4 && typeof toId === "string";
      default:
        return false;
    }
  }
  get_global_permissions_to_decrease(state: CounterBoundedInternalState) {
    return get_global_value_from_counter_bounded(state)
  }

  get_local_permissions_to_decrease(id: ID, state: CounterBoundedInternalState) {
    const decreasable_val = get_granted_decrement_value_from_transfer_map(id, state)
    const decreased_val = get_value_from_decrement_map(id, state)
    return decreasable_val - decreased_val
  }

  generata_downstream_check(op: CounterBoundedOperation, actor_id: ID, state: CounterBoundedInternalState, decrement_value: number): CounterBoundedOperation {
    const available_decreasement = this.get_local_permissions_to_decrease(actor_id, state)
    if (available_decreasement < decrement_value) {
      throw new InvalidOperationError(`Decreasable amount value must be greater than decrement_value! (${available_decreasement} < ${decrement_value})`);
    }

    return op
  }

  private increase(actor_id: ID, value: number, state: CounterBoundedInternalState): CounterBoundedInternalState {
    const transfer = new Map(state.transfer);
    const hashed_id = make_hash_with_pair(actor_id, actor_id)
    const current_value = transfer.get(hashed_id) ?? 0
    
    transfer.set(hashed_id, current_value + value)
    return {
      ...state, transfer
    }  
  }

  private decrease(actor_id: ID, value: number, state: CounterBoundedInternalState): CounterBoundedInternalState {
    const decrement = new Map(state.decrement);
    const current_value = decrement.get(actor_id) ?? 0
    
    decrement.set(actor_id, current_value + value)
    return {
      ...state, decrement
    }
  }

  private transfer(actor_id: ID, value: number, to_id: ID, state: CounterBoundedInternalState): CounterBoundedInternalState {
    const transfer = new Map(state.transfer);
    const hashed_id = make_hash_with_pair(actor_id, to_id)
    const current_value = transfer.get(hashed_id) ?? 0
    
    transfer.set(hashed_id, current_value + value)
    return {
      ...state, transfer
    }
  }
} 

export class CounterBoundedInternalStateSerializer implements Serializer<CounterBoundedInternalState> {
  to_binary(value: CounterBoundedInternalState): Uint8Array {
    const obj = {
      transfer: Array.from(value.transfer.entries()),
      decrement: Array.from(value.decrement.entries()),
    }
    const json = JSON.stringify(obj)
    return new TextEncoder().encode(json)
  }

  from_binary(data: Uint8Array): CounterBoundedInternalState {
    const json = new TextDecoder().decode(data)
    const obj = JSON.parse(json)

    return {
      transfer: new Map(obj.transfer),
      decrement: new Map(obj.decrement),
    }    
  }
}

export type CounterBoundedLibrary = CRDTLibrary<
  CounterBoundedInternalState,
  CounterBoundedInternalState,
  CounterBoundedOperation,
  CounterBoundedOperation
>;