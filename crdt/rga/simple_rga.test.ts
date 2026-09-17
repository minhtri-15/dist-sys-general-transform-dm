import { apply_remote_operation } from "../test.util.ts";
import { SimpleRGArrayCRDT, type SimpleRGAExternalOperation, type SimpleRGAInternalOperation, type SimpleRGAInternalState } from "./simple_rga.ts";

let global_test_id = 0
const crdt = new SimpleRGArrayCRDT()

function get_id(prefix: string = 'array'): string {
  const new_id = global_test_id
  global_test_id ++
  return `${prefix}-${new_id}`
}

function gen_ran_content(n: number): string {
  let res = ''
  for(let i = 0; i < n - 1; i++) {
    res += String.fromCharCode('a'.charCodeAt(0) + Math.floor(Math.random() * 26))
  }

  return res + '.'
}

let state = crdt.initialize_state()
const id1 = get_id()
let seq = 0

let r = gen_ran_content(3)
console.log('Should have this: ', r)
state = apply_remote_operation<SimpleRGAInternalState<string>, string,  SimpleRGAInternalOperation<string>, SimpleRGAExternalOperation> 
  ([[id1, seq], 'insert', 0, r], state, crdt)
seq += 3
console.log(crdt.get_value(state))
console.table(state.operation_log)

r = gen_ran_content(3)
console.log('Should have this: ', r)
state = apply_remote_operation<SimpleRGAInternalState<string>, string,  SimpleRGAInternalOperation<string>, SimpleRGAExternalOperation> 
  ([[id1, seq], 'insert', 0, r], state, crdt)
seq += 3
console.log(crdt.get_value(state))
console.table(state.operation_log)

r = gen_ran_content(3)
console.log('Should have this: ', r)
state = apply_remote_operation<SimpleRGAInternalState<string>, string,  SimpleRGAInternalOperation<string>, SimpleRGAExternalOperation> 
  ([[id1, seq], 'insert', 3, r], state, crdt)
seq += 3
console.log(crdt.get_value(state))
console.table(state.operation_log)