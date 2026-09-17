// import { mapsEqual } from "../../libs/comapre.lib.ts";
import type { CRDTLibrary } from "../crdt.interface.ts";
import { InvalidOperationError } from "../operation.exception.ts";
import { type SimpleExternalID } from "./simple_causal_array.ts";

// What actually store under the hoods
export type SimpleRGAInternalState<T> = {
  operation_log: SimpleRGAInternalStateItem<T>[]
}

function get_item_at_internal_position<T>(state: SimpleRGAInternalState<T>, position: number): SimpleRGAInternalStateItem<T> | null {
  if (position < 0 || position >= state.operation_log.length) throw new InvalidOperationError("Invalid position. Out of index of internal state")
  return state.operation_log[position] ?? null
}

function get_item_with_internal_id(state: SimpleRGAInternalState<any>, id: SimpleExternalID | null): [internal_position: number, item: SimpleRGAInternalStateItem<any> | null] {
  if (!id) return [-1, null]
  for (let i = 0; i < state.operation_log.length; i++) {
    const item = get_item_at_internal_position(state, i)
    if (item && compare_agent_id(get_item_id(item), id)) return [i, item];
  }
  return [-1, null]
}

function convert_eo_position_to_io_position(external_position: number, state: SimpleRGAInternalState<any>, stick_end: boolean = false): number {
  let i = 0;
  let pos = external_position;
  for(i; i < state.operation_log.length; i++, pos--) {
    const item = get_item_at_internal_position(state, i)
    if (stick_end && pos === 0) return i
    else if (!item || get_item_deletion_status(item)) continue
    else if (pos === 0) return i
    
  }

  if (pos === 0) return i
  throw new InvalidOperationError("Invalid insert position. Past to the end of operations")
}

function conver_eo_len_to_io_len(start_external_position: number, external_len: number, state: SimpleRGAInternalState<any>): number {
  let ex_len = 0;
  let start = convert_eo_position_to_io_position(start_external_position, state);

  let len = 0
  for(let i = start; i < state.operation_log.length; i++, ex_len--, len++) {
    const item = get_item_at_internal_position(state, i)
    if (!item || get_item_deletion_status(item)) continue
    else if (ex_len === 0) return len
    
  }

  if (ex_len === 0) return len
  throw new InvalidOperationError("Invalid insert position. Past to the end of operations")
}

function find_internal_position_to_insert<T>(item: SimpleRGAInternalStateItem<T>, doc: SimpleRGAInternalState<T>) {
    // Finding range to insert item in the array
    let [left, _] = get_item_with_internal_id(doc, get_org_left_item_id(item)) ?? -1
    let destination_position = left + 1
    let right = get_org_right_item_id(item) == null ? 
        doc.operation_log.length : 
        get_item_with_internal_id(doc, get_org_right_item_id(item))[0]
        
    let scanning = false
  
    for (let current_scanning_position = destination_position; current_scanning_position < right; current_scanning_position++) {
      if (!scanning) destination_position = current_scanning_position;
  
      let current_item = get_item_at_internal_position(doc, current_scanning_position)
      if (!current_item) continue
      let [current_item_left_position, _] = get_item_with_internal_id(doc, get_item_id(current_item))
      const item_right_id = get_org_right_item_id(current_item)
      let current_item_right_position = item_right_id == null ?
                                          doc.operation_log.length :
                                          get_item_with_internal_id(doc, item_right_id)[0]
  
      const item_agent = get_item_id(item)[0]
      const current_item_agent = get_item_id(current_item)[0]
      if (
        current_item_left_position < left 
        || (current_item_left_position === left && current_item_right_position === right && item_agent < current_item_agent)
      ) 
        break
  
      if (current_item_left_position === left) scanning = current_item_right_position < right
    }
  
    return destination_position
}

function delete_item_at_internal_position_with_len(start_internal_position: number, len: number, state: SimpleRGAInternalState<any>): SimpleRGAInternalState<any> {
  if (start_internal_position < 0 || start_internal_position >= state.operation_log.length) return state

  for (let i = start_internal_position; i < Math.min(state.operation_log.length, len); i++) {
    state.operation_log[i] = [
      state.operation_log[i]!![0], state.operation_log[i]!![1], state.operation_log[i]!![2],
      true,
      state.operation_log[i]!![4],
    ]
  }
  return state
}

// The operation is only used for inserting new elements
export type SimpleRGAInternalStateItem<T> = [ 
  id: SimpleExternalID,
  origin_left_id: SimpleExternalID | null,
  origin_right_id: SimpleExternalID | null,
  deletion: boolean,

  content: T,
]
export type SimpleRGAInternalOperation<T> = 
| { type: 'insert', len: number, items: SimpleRGAInternalStateItem<T>[] }
| { type: 'delete', len: number, start_pos: number }

function get_item_id(item: SimpleRGAInternalStateItem<any>): SimpleExternalID { return item[0]; }
function get_org_left_item_id(item: SimpleRGAInternalStateItem<any>): SimpleExternalID | null { return item[1]; }
function get_org_right_item_id(item: SimpleRGAInternalStateItem<any>): SimpleExternalID | null { return item[2]; }
function get_item_deletion_status(item: SimpleRGAInternalStateItem<any>): boolean { return item[3]; }
function get_item_content<T>(item: SimpleRGAInternalStateItem<T>): T { return item[4]; }

function is_agent_id(id: unknown): id is SimpleExternalID {
    if (!Array.isArray(id)) { return false; }
    const [agent, seq] = id
    if (typeof agent !== "string")     { return false; }
    if (typeof seq !== "number")     { return false; }
    return true
}
function compare_agent_id(id1: SimpleExternalID | null, id2: SimpleExternalID | null): boolean { return !!id1 && !!id2 && id1[0] === id2[0] && id1[1] === id2[1] }
function compare_item<T>(item1: SimpleRGAInternalStateItem<T> | null, item2: SimpleRGAInternalStateItem<T> | null): boolean {
  if (!item1 || !item2) return false
  return compare_agent_id(get_item_id(item1), get_item_id(item2)) && 
      compare_agent_id(get_org_left_item_id(item1), get_org_left_item_id(item2)) && 
      compare_agent_id(get_org_right_item_id(item1), get_org_right_item_id(item2)) && 
      get_item_deletion_status(item1) == get_item_deletion_status(item2) &&
      get_item_content<T>(item1) == get_item_content<T>(item2)
}

  // | [actor_id: SimpleExternalID, item: InternalOperation, position: InternalOperationID]
  // | [actor_id: SimpleExternalID, position: InternalOperationID]
// What user see on screen

export type SimpleRGAExternaliInsertOperation = [from_id: SimpleExternalID, type: 'insert', position: number, content: string, ]
export type SimpleRGAExternaliDeleteOperation = [from_id: SimpleExternalID, type: 'delete', position: number, len: number, ]
export type SimpleRGAExternalOperation = SimpleRGAExternaliInsertOperation | SimpleRGAExternaliDeleteOperation

// function get_extern_item_id(item: SimpleRGAExternalOperation): SimpleExternalID { return item[0] }
// function get_extern_item_type(item: SimpleRGAExternalOperation): 'insert' | 'delete' { return item[1] }
// function get_extern_item_position(item: SimpleRGAExternalOperation): number { return item[2] }
// function get_extern_item_content(item: SimpleRGAExternaliInsertOperation): string { return item[3] }
// function get_extern_item_deleted_length(item: SimpleRGAExternaliDeleteOperation): number { return item[3] }

export class SimpleRGArrayCRDT implements CRDTLibrary<
  SimpleRGAInternalState<string>, 
  string, 
  SimpleRGAInternalOperation<string>, 
  SimpleRGAExternalOperation
> {
  initialize_state(): SimpleRGAInternalState<string> {
    return { operation_log: [] }
  }
  
  get_value(state: SimpleRGAInternalState<string>): string {
    return state.operation_log
      .filter(item => !get_item_deletion_status(item))
      .map(item => get_item_content<string>(item))
      .join('')
  }
  
  update(localoperation: SimpleRGAInternalOperation<string>, state: SimpleRGAInternalState<string>): SimpleRGAInternalState<string> {
    if(localoperation.type === 'delete') {
      return delete_item_at_internal_position_with_len(localoperation.start_pos, localoperation.len, state)
    }

    if (localoperation.type === 'insert') {
      for (let item of localoperation.items) {
        const dest_int = find_internal_position_to_insert(item, state)
        state.operation_log.splice(dest_int, 0 ,item)
      }
    }

    return state
  }
  
  equal(state1: SimpleRGAInternalState<string>, state2: SimpleRGAInternalState<string>): boolean {
    // return mapsEqual(state1.version, state2.version);
    if (state1.operation_log.length != state2.operation_log.length) return false
    for (let i = 0; i < state1.operation_log.length; i++) {
      const item1 = get_item_at_internal_position(state1, i) ?? null
      const item2 = get_item_at_internal_position(state2, i) ?? null
      if (!compare_item(item1, item2)) return false
    }

    return true
  }
  
  downstream(remote_operation: SimpleRGAExternalOperation, state: SimpleRGAInternalState<string>): SimpleRGAInternalOperation<string> {
    // const type = get_extern_item_type(remote_operation) 
    const [id, type, position, info] = remote_operation;
    const io_position = convert_eo_position_to_io_position(position, state, true)

    switch (type) {
      case "insert": 
      let left_id: SimpleExternalID | null = null, right_id: SimpleExternalID | null  = null
      const left_item = io_position - 1 >= 0 ? get_item_at_internal_position(state, io_position - 1): null
      const right_item = io_position < state.operation_log.length - 1 ? get_item_at_internal_position(state, io_position) : null

      return {
        type: 'insert', 
        len: info.length,
        items: info.split('').map((char_item, idx): SimpleRGAInternalStateItem<string> => {
          if(idx === 0) {
            left_id = left_item ? get_item_id(left_item) : null
          }
          
          if(idx === info.length - 1)
          {
            right_id = right_item ? get_item_id(right_item) : null
          } else if (idx < info.length - 1) {
            right_id = [id[0], id[1] + idx + 1]
          }

          const current_id: SimpleExternalID = [id[0], id[1] + idx]
          const item: SimpleRGAInternalStateItem<string> = [current_id, left_id, right_id, false, char_item]
          left_id = current_id
          return item
        })
      }

      case "delete":
        const start_pos = io_position
        return {
          type: 'delete', 
          len: conver_eo_len_to_io_len(start_pos, info, state),
          start_pos: start_pos
        }
    }
  }
  
  require_state_downstream(remoteOperation: SimpleRGAExternalOperation): boolean {
    return true; // need to check the operation is in version or not
  }
  
  is_operation(operation: unknown): operation is SimpleRGAExternalOperation {
    if (!Array.isArray(operation)) { return false; }
    
    const [id, type, position, info] = operation;
    if(!is_agent_id(id)) return false
    if (typeof position !== "number")  { return false; }

    switch (type) {
      case "insert": return typeof info === 'string';
      case "delete": return typeof info === 'number';
      default:
        return false;
    }
  }

}