export interface CRDTLibrary<InternalState, Value, InternalOperator, ExternalOperator> {
  initialize_state(): InternalState
  get_value(state: InternalState): Value

  // Local Operator Handler (LOH)
  update(localOperator: InternalOperator, state: InternalState): InternalState

  //// Helpers
  equal(state1: InternalState, state2: InternalState): boolean
  
  // Remote Operator Handlers (ROH)
  downstream(remoteOperator: ExternalOperator, state: InternalState): InternalOperator 
  require_state_downstream(remoteOperation: ExternalOperator): boolean
  
  //// Helpers
  is_operation(operator: unknown): boolean
  
}

export interface Serializer<T> {
  to_binary(value: T):  Uint8Array
  from_binary(data: Uint8Array): T
  
}