import { describe, expect, it } from "vitest";
import { CounterBoundedCRDT, type CounterBoundedInternalState, CounterBoundedInternalStateSerializer, type CounterBoundedOperation, type ID } from "./counter_bounded.ts";
import { InvalidOperationError } from "./operation.exception.ts";
import { apply_remote_operation } from "./test.util.ts";
const crdt = new CounterBoundedCRDT()
const serializer = new CounterBoundedInternalStateSerializer()
let global_test_id = 0

function get_id(prefix: string = 'counter'): ID {
  const new_id = global_test_id
  global_test_id ++
  return `${prefix}-${new_id}`
}

describe("CounterBoundedCRDT", () => {
  it("test initialize empty state", () => {
    const crdt = new CounterBoundedCRDT();
    const state = crdt.initialize_state();
    expect(state.transfer.size).toBe(0);
    expect(state.decrement.size).toBe(0);
  });

  it ("test increment operations.", () => {
    const counter0 = crdt.initialize_state();
    const id1 = get_id()
    const id2 = get_id()
    const counter1 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'increment', 10], counter0, crdt)
    const counter2 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id2, 'increment', 5], counter1, crdt)
    
    expect(crdt.get_local_permissions_to_decrease(id1, counter2)).toBe(10)
    expect(crdt.get_local_permissions_to_decrease(id2, counter2)).toBe(5)
    expect(crdt.get_global_permissions_to_decrease(counter2)).toBe(15)
  })

  it ("test the function `local_permissions()'.", () => {
    
    const counter0 = crdt.initialize_state();
    const id1 = get_id()
    const id2 = get_id()
    const counter1 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'increment', 10], counter0, crdt)
    
    expect(crdt.get_local_permissions_to_decrease(id1, counter1)).toBe(10)
    expect(crdt.get_local_permissions_to_decrease(id2, counter1)).toBe(0)
    expect(crdt.get_global_permissions_to_decrease(counter1)).toBe(10)
    
  })

  it ("test decrement operations.", () => {
    const counter0 = crdt.initialize_state();
    const id1 = get_id()
    const counter1 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'increment', 10], counter0, crdt)
    const counter2 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'decrement', 6], counter1, crdt)

    expect(counter2.decrement.get(id1)).toBe(6)
    expect(crdt.get_global_permissions_to_decrease(counter2)).toBe(4)
    expect(() => apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'decrement', 6], counter2, crdt), 
        "Cannot execute decrement that exceed local permission (4)"
      ).toThrow(InvalidOperationError)

    const id2 = get_id()
    expect(crdt.get_local_permissions_to_decrease(id2, counter2)).toBe(0)
    expect(() => apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id2, 'decrement', 6], counter2, crdt),
      "Cannot execute decrement that exceed local permission (0)"
    ).toThrow(InvalidOperationError);
  })

  it ("test a more complex chain of increment and decrement operations.", () => {
    const counter0 = crdt.initialize_state()
    const id1 = get_id()
    const id2 = get_id()
    const counter1 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'increment', 10], counter0, crdt)
    const counter2 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'decrement', 6], counter1, crdt)
    const counter3 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id2, 'increment', 6], counter2, crdt)

    expect(crdt.get_global_permissions_to_decrease(counter3), 
      "Test several replicas (balance each other)"
    ).toBe(10)
    expect(() => apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'decrement', 6], counter3, crdt), 
    "Test forbidden permissions, when total is higher than consumed"
    ).toThrow(InvalidOperationError);

    const counter4 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id2, 'decrement', 6], counter3, crdt)
    expect(crdt.get_global_permissions_to_decrease(counter4), 
      "Test the same operation is allowed on another replica with enough permissions"
    ).toBe(4)

  })

  it ("test transferring permissions.", () => {
    const counter0 = crdt.initialize_state()
    const id1 = get_id()
    const id2 = get_id()
    const counter1 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'increment', 10], counter0, crdt)
    const counter2 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'transfer', 6, id2], counter1, crdt)
    // %% .
    expect(crdt.get_local_permissions_to_decrease(id1, counter2), "transferring permissions from id1 to id2 with downgrade id1 to (4)").toBe(4)
    expect(crdt.get_local_permissions_to_decrease(id2, counter2), "transferring permissions from id1 to id2 with upgrade id2 to (6)").toBe(6)
    expect(crdt.get_global_permissions_to_decrease(counter2), "transferring permissions would not change the total permission (10)").toBe(10)
    
    expect(() => apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'transfer', 5, id2], counter2, crdt), "Test transference forbidden by lack of previously transfered resources (5 > current 4)"
    ).toThrow(InvalidOperationError)
    //
    "Test transference enabled by previously transfered resources"
    const counter3 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id2, 'transfer', 5, id1], counter2, crdt)
    expect(crdt.get_local_permissions_to_decrease(id1, counter3), "transferring permissions from id2 to id1 with upgrade id1 to (9)").toBe(9)
    expect(crdt.get_local_permissions_to_decrease(id2, counter3), "transferring permissions from id2 to id1 with downgrade id2 to (6)").toBe(1)
    expect(crdt.get_global_permissions_to_decrease(counter3), "transferring permissions would not change the total permission (10)").toBe(10)
  })

  it ("test the function `value()'.", () => {
    const counter0 = crdt.initialize_state()
    const id1 = get_id()
    const id2 = get_id()
    const counter1 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'increment', 10], counter0, crdt)
    const counter2 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'transfer', 6, id2], counter1, crdt)

    expect(crdt.get_value(counter2), "return same value").toEqual(counter2)
  })

  it("test transfer itself but with not enough permission", () => {
    const counter0 = crdt.initialize_state()
    const id1 = get_id()
    const counter1 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'increment', 10], counter0, crdt)
    expect(() => apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'transfer', 16, id1], counter1, crdt))
      .toThrow(InvalidOperationError)
  })

  it("test transfer itself with enough permission", () => {
    const counter0 = crdt.initialize_state()
    const id1 = get_id()
    const counter1 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'increment', 10], counter0, crdt)
    const counter2 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'increment', 5], counter1, crdt)
    const counter3 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'transfer', 5, id1], counter1, crdt)
    expect(counter2).toEqual(counter3)
  })

  it ("test that operations are correctly detected.", () => {
    const id1 = get_id()
    expect(crdt.is_operation([id1, 'increment', 10])).toBe(true)
    expect(crdt.is_operation([id1, 'increment'])).toBe(false)
    expect(crdt.is_operation([id1, 'decrement', 10])).toBe(true)
    expect(crdt.is_operation([id1, 'decrement'])).toBe(false)
    expect(crdt.is_operation([id1, 'transfer', 10, id1])).toBe(true)
    expect(crdt.is_operation([id1, 'give-away', 10, id1])).toBe(false)
  })

  it ("test serialization functions `to_binary()' and `from_binary()'.", () => {
    const counter0 = crdt.initialize_state()
    const id1 = get_id()
    const counter1 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'increment', 10], counter0, crdt)
    const counter2 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'increment', 5], counter1, crdt)
    const counter3 = apply_remote_operation<CounterBoundedInternalState, CounterBoundedInternalState, CounterBoundedOperation, CounterBoundedOperation>
      ([id1, 'transfer', 5, id1], counter2, crdt)

    const binary = serializer.to_binary(counter3)
    expect(counter3).toEqual(serializer.from_binary(binary)) 
  })
});