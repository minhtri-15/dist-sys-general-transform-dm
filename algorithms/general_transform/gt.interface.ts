export interface LocalObjectHandler<ExternalOperation, InternalOperation, InternalState> {
  generate(eo: ExternalOperation, is: InternalState): InternalOperation   // 1. convert External to Internal (step 1 in GT)
  update(io: InternalOperation, is: InternalState): InternalState         // 2. integrate the converted IO into IS (step 1 in GT)

  propogate(): InternalOperation                                          // 3. Add to LocalOperation logs (step 1 in GT)
}

// This one should only care about how to integrate internal operation (maybe reused the local handler)
// The state is only used for CRDT due to content-centric handling, so in OT maybe ES & IS is the same type
export interface RemoteObjectHandler<ExternalOperation, InternalOperation, InternalState, ExternalState> {

  accept(io: InternalOperation, is: InternalState): boolean               // 1. accept after check the causal (step 4 in GT)
  transform(io: InternalOperation, is: InternalState): ExternalOperation  // 2. transform / integrate <> convert IO into EO for apply (step 5, 6 in GT)
  apply(io: InternalOperation, is: InternalState): InternalState          // 3. apply / relay the transformed operation int state (step 7 in GT) <> this may used the LOH
}

export interface CommunicateAndPropogateHanlder {
  // Propogate mechanism
  broadcast(): void;             // Propogate internal object & as well as the last version of other site
  onReceive(): void;        // Receive internal Object - this should check the pending queue to extract waiting operation;
  
  // Algorithm preconditions
  checkCausality(): void      // Check version of the incoming object to execution queue or pending queue
  addPendingQueue(): void;  // Queue for missing operations
  
  // Communication mechanism (network topology)
  onJoin(): void;
  onDisconnect(): void;
  onPeerDisconnect(): void;
  onPeerJoin(): void;
}

/**
 *  This class should have logs: 
 *    1. CRDT: log-based content
 *    2. OT: log for operation buffer <> that integrate garbage collector -- consensus scheme
 * */
export interface GenernalTransformer<InternalState, Value, InternalOperation, ExternalOperation> {
  onGenerate(eo: ExternalOperation, is: InternalState): InternalOperation;     // convert EO to IO 
  execute(io: InternalOperation, is: InternalState): InternalState;            // apply IO to IS
  
  addLocalOperations: void;     // Queue for operations need to send, get from propogate of LOH
  getInternalOperation(): void  // Get the requested operation from other sites
  sendRequest(): void;          // If missing some operation based on the causal check;
  onRequest(): void;            // This should extract local operation to send 

  
  getExternalState(state: InternalState): Value
}