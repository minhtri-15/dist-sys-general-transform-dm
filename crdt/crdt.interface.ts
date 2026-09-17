export interface CRDTLibrary<InternalState, Value, Internaloperation, Externaloperation> {
  initialize_state(): InternalState
  get_value(state: InternalState): Value

  // Local operation Handler (LOH)
  update(localoperation: Internaloperation, state: InternalState): InternalState

  //// Helpers
  equal(state1: InternalState, state2: InternalState): boolean
  
  // Remote operation Handlers (ROH)
  downstream(remoteoperation: Externaloperation, state: InternalState): Internaloperation 
  require_state_downstream(remoteOperation: Externaloperation): boolean
  
  //// Helpers
  is_operation(operation: unknown): boolean
  
}

export interface Serializer<T> {
  to_binary(value: T):  Uint8Array
  from_binary(data: Uint8Array): T
  
}