export interface CRDTLibrary<InternalState, Value, InternalOperation, ExternalOperation> {
  initialize_state(): InternalState
  get_value(state: InternalState): Value

  // Local operation Handler (LOH)
  update(localoperation: InternalOperation, state: InternalState): InternalState

  //// Helpers
  equal(state1: InternalState, state2: InternalState): boolean
  
  // Remote operation Handlers (ROH)
  downstream(remote_operation: ExternalOperation, state: InternalState): InternalOperation 
  require_state_downstream(remote_operation: ExternalOperation): boolean
  
  //// Helpers
  is_operation(operation: unknown): boolean
  
}

export interface Serializer<T> {
  to_binary(value: T):  Uint8Array
  from_binary(data: Uint8Array): T
  
}