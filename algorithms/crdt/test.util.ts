
import type { CRDTLibrary } from "./crdt.interface";

export function apply_remote_operation<InternalState, Value, InternalOperation, ExternalOperation>(
  remote_op: ExternalOperation, state: InternalState, 
  crdt_lib: CRDTLibrary<InternalState, Value, InternalOperation, ExternalOperation>
): InternalState {
  const transformed_local = crdt_lib.downstream(remote_op, state)
  const new_state = crdt_lib.update(transformed_local, state)
  return new_state
}