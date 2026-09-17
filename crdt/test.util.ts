
import type { CRDTLibrary } from "./crdt.interface";

export function apply_remote_operation<InternalState, Value, Internaloperation, Externaloperation>(
  remote_op: Externaloperation, state: InternalState, 
  crdt_lib: CRDTLibrary<InternalState, Value, Internaloperation, Externaloperation>
): InternalState {
  const transformed_local = crdt_lib.downstream(remote_op, state)
  const new_state = crdt_lib.update(transformed_local, state)
  return new_state
}