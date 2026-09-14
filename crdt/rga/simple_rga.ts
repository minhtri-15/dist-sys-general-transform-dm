import type { CRDTLibrary } from "../crdt.interface";
import type { SimpleAgentId, SimpleExternalID } from "./simple_causal_array";

export type SimpleRGAInternalState = [] 
export type SimpleRGAExternalState = string
export type SimpleRGAInternalOperation = {}
  // | [actor_id: SimpleAgentId, position: InternalOperationID]
  // | [actor_id: SimpleAgentId, position: InternalOperationID]

export type SimpleRGAExternalOperation = {}

export class SimpleRGArrayCRDT implements CRDTLibrary<SimpleRGAInternalState, SimpleRGAExternalState, SimpleRGAInternalOperation, SimpleRGAExternalOperation> {
  initialize_state(): [] {
    return []
  }
  
  get_value(state: []): string {
    throw new Error("Method not implemented.");
  }
  
  update(localOperator: SimpleRGAInternalOperation, state: []): [] {
    throw new Error("Method not implemented.");
  }
  
  equal(state1: [], state2: []): boolean {
    throw new Error("Method not implemented.");
  }
  
  downstream(remoteOperator: SimpleRGAExternalOperation, state: []): SimpleRGAInternalOperation {
    throw new Error("Method not implemented.");
  }
  
  require_state_downstream(remoteOperation: SimpleRGAExternalOperation): boolean {
    throw new Error("Method not implemented.");
  }
  
  is_operation(operator: unknown): boolean {
    throw new Error("Method not implemented.");
  }
  
}