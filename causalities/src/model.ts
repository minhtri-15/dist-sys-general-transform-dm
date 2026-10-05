import { DEV } from "../dev_config";
import { type SequenceCollection, type SequenceCursor } from "../interface/collections.interface";
import { randomString } from "../utils/ramdom";

type GlobalId = [agent: string, seq: number];

class Identifier {
  constructor(private id: GlobalId | null) {}
  get_agent() { return this.id ? this.id[0] : null }
  get_seq() { return this.id ? this.id[1] : null }
  get_value(): GlobalId | null { return this.id }
  compare(id: GlobalId | null) {
    const id1 = this.id, id2 = id;
    if (id1 === null && id2 === null) return 0;
    if (id1 === null) return -1;
    if (id2 === null) return 1;
    return id1[0] === id2[0] ? id1[1] - id2[1] : id1[0].localeCompare(id2[0]);
  }
}
const sort_global_id = (id1: GlobalId | null, id2: GlobalId | null) => new Identifier(id1).compare(id2); // increasing

export type LocalAction = [id: GlobalId, parents: Array<SequenceCursor<LocalAction>>]
export type RemoteAction = [id: GlobalId, parents: Array<GlobalId>]

class LAction {
  constructor(private action: LocalAction | null, private remote: boolean = true) {}
  get_id(): Identifier { return new Identifier(this.action ? this.action[0] : null) }
  get_parents(): Array<SequenceCursor<LocalAction>> | null { return this.action ? this.action[1] : null }
  get_value(): LocalAction | null { return this.action }
  is_remote(): boolean | null { return this.action ? this.remote : null }
}

class RAction {
  constructor(private action: RemoteAction | null, private remote: boolean = true) {}
  get_id(): Identifier { return new Identifier(this.action ? this.action[0] : null) }
  get_parents(): Array<GlobalId> | null { return this.action ? this.action[1] : null }
  get_value(): RemoteAction | null { return this.action }
  is_remote(): boolean | null { return this.action ? this.remote : null }
}

export class ArrayOperationCursor implements SequenceCursor<LocalAction> {
  constructor(private readonly actions: LocalAction[], private position: number = 0) {}
  current(): LocalAction | null { return this.actions[this.position] ?? null }
  next(forward_steps: number = 0): LocalAction | null { this.position += forward_steps + 1; return this.current() }
  back(backward: number = 1): LocalAction | null { this.position -= backward; return this.current() }
  get_index(): number { return this.position }
}

export class ArrayOperation implements SequenceCollection<LocalAction> {
  constructor(private readonly actions: LocalAction[] = []) {}

  get_value(): Array<LocalAction> { return this.actions }
  length(): number { return this.actions.length }
  at(index: number): LocalAction | null { return this.actions[index] ?? null }
  cursor(position = 0): SequenceCursor<LocalAction> { return new ArrayOperationCursor(this.actions, position) }
  get_last(): SequenceCursor<LocalAction> { return new ArrayOperationCursor(this.actions, this.length() - 1) }
  for_each(callback: (element: LocalAction) => void): void { for (let i = 0; i < this.actions.length; i++) callback(this.actions[i]!); }

  push_back(element: LocalAction): SequenceCursor<LocalAction> { this.actions.push(element); return new ArrayOperationCursor(this.actions, this.actions.length - 1); }
  get_element_with_query_callback(query: (element: LocalAction) => boolean, reversed: boolean = false): SequenceCursor<LocalAction> {
    if (reversed) { for (let i = this.actions.length - 1; i >= 0; i--) if (query(this.actions[i]!)) return new ArrayOperationCursor(this.actions, i); } 
    else { for (let i = 0; i < this.actions.length; i++) if (query(this.actions[i]!)) return new ArrayOperationCursor(this.actions, i); }
    return new ArrayOperationCursor(this.actions, -1);
  }
}

class InvalidOperation extends Error { constructor(msg: string = "Invalid operation") { super(msg) } }

export class Memory {
  constructor(private operations: SequenceCollection<LocalAction> = new ArrayOperation()) {}
  get_operation(): SequenceCollection<LocalAction> { return this.operations }
}

interface Synchronize {
  get_pending(): Array<RemoteAction>
  sync_with_update_pending_queue(action: RemoteAction, current_frontier: Array<SequenceCursor<LocalAction>>): { state: Memory, frontier: Array<SequenceCursor<LocalAction>> }
}

/** FOR NATIVE LOCAL DEV ONLY */
const g_Replicas = Array<string>(); // dummy variable to simulate the network, which should be `unreliable`
function IsAgentExist(agent: string): boolean { for (const r of g_Replicas) { if (r.includes(agent)) return true } return false }
function InitAgent(): string {
  let new_agent = randomString();
  while (IsAgentExist(new_agent)) new_agent = randomString();
  g_Replicas.push(new_agent + "_" + (g_Replicas.length % 3));
  return g_Replicas[g_Replicas.length - 1]!;
}
/** FOR NATIVE LOCAL DEV ONLY */

export class LocalReplica {
  private version: Record<string, number> = {};
  private agent: string = DEV ? InitAgent() : crypto.randomUUID();
  private local_history: Memory = new Memory();
  private frontier: Array<SequenceCursor<LocalAction>> = [];
  private sync_module: Synchronize;

  constructor() { this.version[this.agent] = -1; this.sync_module = new UnreliableNetwork(this.version, this.local_history); }

  get_history(): Array<LocalAction> { return this.local_history.get_operation().get_value() }
  get_op_at_local_position(local: number): LocalAction | null { return this.local_history.get_operation().at(local) }
  get_agent() { return this.agent }
  get_frontier() { return this.frontier.map(f => f.get_index()) }
  get_frontier_ids(): Array<GlobalId | null> { return this.frontier.map(f => f.current()?.[0] ?? null) }

  private update_local_frontier() {
    const last_op = this.local_history.get_operation().get_last(); this.frontier = last_op ? [last_op] : []; this.sort_frontier();
  }
  private sort_frontier() { this.frontier.sort((a, b) => sort_global_id(new LAction(a.current()).get_id().get_value(), new LAction(b.current()).get_id().get_value())); }
  private get_current_seq() { return this.version[this.agent]! }
  private update_seq() { this.version[this.agent]! += 1 }

  action() {
    this.update_seq();
    const local_action: LocalAction = [[this.agent, this.get_current_seq()], this.frontier.slice()]; // copy
    this.local_history.get_operation().push_back(local_action); this.update_local_frontier();
  }
  merge(remote_actions: Array<RemoteAction>) {
    remote_actions.forEach(action => { this.frontier = this.sync_module.sync_with_update_pending_queue(action, this.frontier).frontier; });
    this.sort_frontier();
  }
  send(): Array<RemoteAction> {
    const remote_arr: Array<RemoteAction> = [];
    this.local_history.get_operation().for_each(local => {
      const local_action = new LAction(local);
      const parents = local_action.get_parents()?.map(p => new LAction(p.current()).get_id().get_value()!) ?? [];
      remote_arr.push([local_action.get_id().get_value()!, parents]);
    });
    return remote_arr;
  }
  get_pending(): Array<RemoteAction> { return this.sync_module.get_pending() }

  /** FOR NATIVE LOCAL DEV ONLY */
  get_agent_glob_number(): number { return g_Replicas.findIndex(r => r === this.agent) }
}

class UnreliableNetwork implements Synchronize {
  private pending_ops: Array<RemoteAction> = [];
  constructor(private version: Record<string, number>, private state: Memory) {}

  private find_local_idx_from_global_id(id: GlobalId): SequenceCursor<LocalAction> {
    const op = this.state.get_operation();
    return op.get_element_with_query_callback((element) => new LAction(element).get_id().compare(id) === 0, true);
  }

  get_pending(): Array<RemoteAction> { return this.pending_ops }

  sync_with_update_pending_queue(action: RemoteAction, current_frontier: Array<SequenceCursor<LocalAction>>): { state: Memory, frontier: Array<SequenceCursor<LocalAction>> } {
    if (!action) throw new InvalidOperation("The operation dont have id!");
    const id = new RAction(action).get_id();
    const lastReceived = this.version[id.get_agent()!] ?? -1;
    if (id.get_seq()! <= lastReceived) return this.result(current_frontier);

    const alreadyPending = this.pending_ops.some(op => id.compare(new RAction(op).get_id().get_value()) === 0);
    if (!alreadyPending) this.pending_ops.push(action);

    const newFrontier = this.drain_pending(current_frontier);
    return this.result(newFrontier);
  }

  private drain_pending(frontier: Array<SequenceCursor<LocalAction>>): Array<SequenceCursor<LocalAction>> {
    let progress = true;
    while (progress) {
      progress = false;
      let keep = 0;
      for (let i = 0; i < this.pending_ops.length; i++) {
        const action = new RAction(this.pending_ops[i] ?? null);
        if (action.get_id().get_seq()! <= (this.version[action.get_id().get_agent()!] ?? -1)) continue;
        const remote_action = action.get_value()!;
        const new_frontier = this.try_apply(remote_action, frontier);
        if (new_frontier) { frontier = new_frontier; progress = true; }
        else this.pending_ops[keep++] = remote_action;
      }
      this.pending_ops.length = keep;
    }
    return frontier;
  }

  private try_apply(action: RemoteAction, frontier: Array<SequenceCursor<LocalAction>>): Array<SequenceCursor<LocalAction>> | null {
    const remote_action = new RAction(action);
    const action_id = remote_action.get_id();
    if (action_id.get_seq() !== (this.version[action_id.get_agent()!] ?? -1) + 1) return null;

    const parents: Array<SequenceCursor<LocalAction>> = [];
    for (const p of remote_action.get_parents() ?? []) {
      const idx = this.find_local_idx_from_global_id(p);
      if (!idx.current()) return null;
      parents.push(idx);
    }
    const local_action = new LAction([action_id.get_value()!, parents]);

    this.state.get_operation().push_back(local_action.get_value()!);
    const new_local_index = this.state.get_operation().get_last();
    this.version[action_id.get_agent()!] = action_id.get_seq()!;

    // FIX: so sánh theo index, không so sánh theo tham chiếu object
    const parent_idx = new Set(parents.map(p => p.get_index()));
    const new_frontier = frontier.filter(f => !parent_idx.has(f.get_index()));
    new_frontier.push(new_local_index);
    return new_frontier;
  }

  private result(frontier: Array<SequenceCursor<LocalAction>>) { return { state: this.state, frontier } }
}

/* ===================== HIỂN THỊ ===================== */
const fmt_id = (id: GlobalId | null): string => (id ? ` ${id[0]}###${id[1]} ` : "null");
const fmt_list = (ids: Array<GlobalId | null>): string => `[${ids.map(fmt_id).join(", ")}]`; // rỗng -> []

function main() {
  const print_title = (r: LocalReplica, msg: string = "") =>
    console.log(`Replica ${r.get_agent_glob_number()} ${msg}: ${r.get_agent()} - frontier_id=${r.get_frontier()} - frontier_id=${fmt_list(r.get_frontier_ids())}`);

  const print_history = (r: LocalReplica) => {
    console.log(`History of replica ${r.get_agent_glob_number()}:`);
    const h = r.get_history();
    if (h.length === 0) console.log("  []");
    console.table(h.map(i => [i[0], i[1].map(c => c.get_index())]))
    // h.forEach((a, i) => console.log(`  [${i}] ${fmt_local(a)}`));
  };

  const print_pending = (r: LocalReplica) => {
    console.log(`Pending of replica ${r.get_agent_glob_number()}:`);
    const p = r.get_pending()
    if (p.length === 0) console.log("  []");
    console.table(p)
    // p.forEach((a, i) => console.log(`  [${i}] ${fmt_remote(a)}`));
  };

  const do_n_thing = (r: LocalReplica, n: number) => { for (let i = 0; i < n; i++) r.action() };
  const merge = (des: LocalReplica, src: LocalReplica, start: number = 0, end: number | null = null) => {
    const delta = end !== null ? src.send().slice(start, end) : src.send().slice(start);
    des.merge(delta);
  };

  const r1 = new LocalReplica();
  const r2 = new LocalReplica();
  const r3 = new LocalReplica();
  
  do_n_thing(r1, 3)
  do_n_thing(r2, 6)
  do_n_thing(r3, 5)
  // (r1 + r2) + r3
  merge(r1, r2)
  print_title(r1); print_title(r2); print_title(r3)
  print_history(r1)
  merge(r3, r2, 0, 3)
  print_title(r1); print_title(r2); print_title(r3)
  print_history(r3)
  
  print_title(r1); print_title(r2); print_title(r3)
  print_history(r1)
  merge(r3, r1)
  print_title(r1); print_title(r2); print_title(r3)
  print_history(r3)
}

main();