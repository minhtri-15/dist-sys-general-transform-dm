import type { SequenceCollection, SequenceCursor } from "../interface/collections.interface";
import type { LocalAction, Memory } from "./causal";

export interface Direc 
{ 
// communicate to get status first as signal <> if with valid state <-> ask for fetch
  history: Memory<null>
  version: string   // monotonic increasing value comparison
  status: null | 'PARENT' | 'NEWER'
  entries: Array<[status: 'NORMAL' | 'REMOVED' | 'ADDED', entry: Entry ]>
  active_entry: number
}

// when entry active <> continous fetching from peers
// communicate to get status first as signal <> if with valid state <-> ask for fetch
// newly active: --> update both direc & entry
export interface Entry 
{
  timestamp: Array<SequenceCursor<LocalAction<null>>>  // Causal graph frontier
  status: null | 'MODIFIED' | 'UNMODIFIED'
}


console.log('Hello bun!')