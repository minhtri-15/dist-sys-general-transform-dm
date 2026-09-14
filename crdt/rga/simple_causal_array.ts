import { OutOfOrderError } from "../causality.exception"
import { UnexpectedInternalError } from "../operation.exception"

/** REMOTE OBJECT HANDLER 
 *  convert External -> Internal
 *  + integrate into Internal state
 * 
*/
// This is CRDT Metadata
export type SimpleAgentId = string
export type SimpleExternalID = [ agent: SimpleAgentId, sequence: number ]
// Payload of the datastructure
export function get_external_item_content(item: SimpleExternalItem): string { return item[3] }
export function get_external_item_deletion_flag(item: SimpleExternalItem): boolean { return item[4] }
// CRDT metadata
export function get_external_item_id(item: SimpleExternalItem): SimpleExternalID { return item[0] }
export function get_external_item_origin_left_id(item: SimpleExternalItem): SimpleExternalID | null { return item[1] }
export function get_external_item_origin_right_id(item: SimpleExternalItem): SimpleExternalID | null { return item[2] }

// This is CRDT Objects
export type SimpleExternalItem = [id: SimpleExternalID, originLeft: SimpleExternalID | null, originRight: SimpleExternalID | null, content: string, deleted: boolean]
// This is CRDT Tracking Map
export type SimpleVersion = Record<SimpleAgentId, number>

export function compare_simple_external_id(id1: SimpleExternalID | null, id2: SimpleExternalID | null): boolean {
  if (id1 == id2) return true;
  return id1 != null && id2 != null && id1[0] === id2[0] && id1[1] === id2[1]
}

// Convert EO --> IO in PHASE 1
// some External Operation into Internal Operation 
export function find_item_position_with_id(doc: SimpleInternalArray, id: SimpleExternalID | null): SimpleInternalID | null{
  if (id == null) return null

  // return doc.content.findIndex(c => idEq(c.id, id))
  for (let i = 0; i < doc.content.length; i++) {
    const content_item = doc.content[i]
    if(!content_item) continue
    if (compare_simple_external_id(get_external_item_id(content_item), id)) return i
  }
  throw new UnexpectedInternalError("Can't find item")
}


// finding external item in the logs, in the original will be the content[i]
export function find_external_item_at_position(doc: SimpleInternalArray, position: number): SimpleExternalItem | null {
  if (position > doc.content.length) {
    throw new UnexpectedInternalError("Out of index in array")
  }
  return doc.content[position] ?? null;
}

/**
 * 
 * @param version: causality trackers for peers
 * @param id: the checked id of upcoming item
 * @returns enums for queuing item:
 *    + OUT_OF_DATE = -1 - when id < last seen 
 *    + OK  = 0 - expected next item, 
 *    + PENDING = 1 - need to wait to more smaller item integrate
 */
export function check_causality_of_operation(version: SimpleVersion, id: SimpleExternalID): number {
  const [agent, seq] = id
  const lastSeen = version[agent] ?? -1
  if (seq < lastSeen + 1) return -1
  if (seq > lastSeen + 1) return 1
  return 0
}

export function find_position_to_integrate_external_item(doc: SimpleInternalArray, item: SimpleExternalItem): SimpleInternalID {
  const id = get_external_item_id(item)
  if(check_causality_of_operation(doc.version, id) !== 0) {
    throw new OutOfOrderError("Out of order item")
  }

  const [agent, seq] = id
  doc.version[agent] = seq

  // Finding range to insert item in the array
  let left = find_item_position_with_id(doc, get_external_item_origin_left_id(item)) ?? -1
  let destination_position = left + 1
  let right = get_external_item_origin_right_id(item) == null ? 
      doc.content.length : 
      find_item_position_with_id(doc, get_external_item_origin_right_id(item))!
  let scanning = false

  for (let current_scanning_position = destination_position; current_scanning_position < right; current_scanning_position++) {
    if (!scanning) destination_position = current_scanning_position;

    let current_item = find_external_item_at_position(doc, current_scanning_position)
    if (!current_item) continue
    let current_item_left_position = find_item_position_with_id(doc, get_external_item_id(current_item)) ?? -1
    const item_right_id = get_external_item_origin_right_id(current_item)
    let current_item_right_position = item_right_id == null ?
                                        doc.content.length :
                                        find_item_position_with_id(doc, item_right_id) ?? -1

    const item_agent = get_external_item_id(item)[0]
    const current_item_agent = get_external_item_id(current_item)[0]
    if (
      current_item_left_position < left 
      || (current_item_left_position === left && current_item_right_position === right && item_agent < current_item_agent)
    ) 
      break

    if (current_item_left_position === left) scanning = current_item_right_position < right
  }

  return destination_position
}

// Convert EO --> IO in PHASE 2


/** LOCAL OBJECT HANDLER 
 *  convert Internal into External, that used for:
 *  + propogate operator
*/

// This is the id for continous array
export type SimpleInternalID = number;
// This is the id for continous array
export type SimpleInternalArray = {
  content: SimpleExternalItem[], // Keep whole External State Item <-> because this is a combination between (CAUSAL LOGS + CONTENT)
  version: SimpleVersion // This to track the state of peers
}

export function create_simple_doc(): SimpleInternalArray {
  return { content: [], version: {} }
}

export function get_content(doc: SimpleInternalArray): string {
  return doc.content
    .filter(item => !get_external_item_deletion_flag(item))
    .map(item => get_external_item_content(item))
    .join('')
}

export function insert_item_with_position(doc: SimpleInternalArray, item: SimpleExternalItem, position: SimpleInternalID): SimpleInternalArray {
  doc.content.splice(position, 0, item)
  return doc
}

// some Internal Operation & Internal State
// this is only used for local handler, when user use the text cursor on the editor
export function find_item_at_internal_position(doc: SimpleInternalArray, position: number, stickEnd: boolean = false): number {
  let i = 0;
  for (; i < doc.content.length; i++) {
    const item = doc.content[i]
    if (stickEnd && position === 0) return i
    else if (!item) continue
    else if (get_external_item_deletion_flag(item)) continue
    else if (position === 0) return i

    position--
  }

  if (position === 0) return i
  else throw new UnexpectedInternalError('Past end of the document')
}