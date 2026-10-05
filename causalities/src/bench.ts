// Chạy: node --expose-gc --import tsx bench.ts   (hoặc: npx tsx --expose-gc bench.ts)
type GlobalId = { agent: string, seq: number }
type LocalAction = GlobalId & { parents: Array<number> }
type RemoteAction = GlobalId & { parents: Array<GlobalId> }
type Memory = { op: Array<LocalAction> }
type Sync = { state: Map<string, Memory>, frontier: Map<string, Array<number>> }
class InvalidOperation extends Error { constructor(msg: string = "Invalid operation") { super(msg) } }
class NotExistAgent extends Error { constructor() { super("Invalid agent! The agent not exist"); }}
interface Synchronize { sync_with_update_pending_queue(action: RemoteAction, current_frontier: Array<number>): Sync }
type Make = (agent: string, version: Record<string, number>, state: Memory) => Synchronize

const check_same_actions = (id1: GlobalId, id2: GlobalId) => { return id1.agent === id2.agent && id1.seq === id2.seq }
const find_local_position_from_global_id = (memory: Memory, id: GlobalId): number | undefined => { return memory.op.findIndex(action => check_same_actions({agent: action.agent, seq: action.seq}, id))}

// ───────────── V1: bản gốc (đã sửa bug progress) ─────────────
class NetOriginal implements Synchronize {
  private pending_ops: Array<RemoteAction> = [];
  constructor(private agent: string, private version: Record<string, number>, private state: Memory) {}
  private find_local_idx_from_global_id(id: GlobalId) { const idx = find_local_position_from_global_id(this.state, id); if (idx === undefined || idx === null || idx < 0) throw new NotExistAgent(); return idx; }
  private get_next_local_idx(): number { return this.state.op.length; }
  private update_local_frontier(current_frontier: Array<number>, new_action_local_index: number, new_action_parent_with_local_index: Array<number>): Array<number> { const filter_out_old_parent_frontier = current_frontier.filter(f => !new_action_parent_with_local_index.includes(f)); return [...filter_out_old_parent_frontier, new_action_local_index]; }
  sync_with_update_pending_queue(action: RemoteAction, current_frontier: Array<number>): Sync {
    const lastReceived = this.version[action.agent] ?? -1;
    if (action.seq <= lastReceived) return { state: new Map<string, Memory>([["simple", this.state]]), frontier: new Map([["simple", current_frontier]])};
    const alreadyPending = this.pending_ops.some( (op) => op.agent === action.agent && op.seq === action.seq); if (!alreadyPending) { this.pending_ops.push(action); }
    const newFrontier = this.drain_pending(current_frontier); return { state: new Map<string, Memory>([["simple", this.state]]), frontier: new Map([["simple", newFrontier]])};
  }
  private drain_pending(frontier: number[]): number[] {
    let currentFrontier = frontier; let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < this.pending_ops.length; i++) {
        const action = this.pending_ops[i]; if (!action) continue;
        const result = this.try_apply_pending_action(action, currentFrontier); if (!result.applied) continue; currentFrontier = result.frontier;
        this.pending_ops.splice(i, 1); progress = true;
        break;
      }
    }
    return currentFrontier;
  }
  private try_apply_pending_action(action: RemoteAction, frontier: number[]): { applied: boolean; frontier: number[] } {
    const lastReceived = this.version[action.agent] ?? -1;
    if (action.seq <= lastReceived) return { applied: false, frontier };
    if (action.seq !== lastReceived + 1) return { applied: false, frontier, };
    try { const newFrontier = this.apply_action(action, frontier); return { applied: true, frontier: newFrontier, } } catch (error) {
      if (error instanceof NotExistAgent)  return { applied: false, frontier, };
      throw error;
    }
  }
  private apply_action(action: RemoteAction, current_frontier: Array<number>): Array<number> {
    const last_receive_op = this.version[action.agent] ?? -1;
    if (action.seq <= last_receive_op) return current_frontier;
    if (action.seq !== last_receive_op + 1) throw new InvalidOperation("Out of order actions")
    const parents = action.parents.map(p => this.find_local_idx_from_global_id(p))
    const new_local_index = this.get_next_local_idx();
    const new_frontier = this.update_local_frontier(current_frontier, new_local_index, parents)
    this.state.op.push({ agent: action.agent, seq: action.seq, parents: parents })
    this.version[action.agent] = action.seq ;
    return new_frontier;
  }
}

// ───────────── V2: index Map (nhanh, tốn thêm bộ nhớ) ─────────────
class NetIndexed implements Synchronize {
  private pending_ops = new Map<string, Map<number, RemoteAction>>();
  private index = new Map<string, number>(); private indexed = 0;
  constructor(private agent: string, private version: Record<string, number>, private state: Memory) {}
  private key(id: GlobalId) { return `${id.agent}:${id.seq}` }
  private catch_up_index() { for (; this.indexed < this.state.op.length; this.indexed++) this.index.set(this.key(this.state.op[this.indexed]!), this.indexed); }
  private result(frontier: Array<number>): Sync { return { state: new Map<string, Memory>([["simple", this.state]]), frontier: new Map([["simple", frontier]]) } }
  private update_local_frontier(current_frontier: Array<number>, new_action_local_index: number, new_action_parent_with_local_index: Array<number>): Array<number> { const filter_out_old_parent_frontier = current_frontier.filter(f => !new_action_parent_with_local_index.includes(f)); return [...filter_out_old_parent_frontier, new_action_local_index]; }
  sync_with_update_pending_queue(action: RemoteAction, current_frontier: Array<number>): Sync {
    if (action.seq <= (this.version[action.agent] ?? -1)) return this.result(current_frontier);
    let queue = this.pending_ops.get(action.agent); if (!queue) this.pending_ops.set(action.agent, queue = new Map());
    queue.set(action.seq, action);
    return this.result(this.drain_pending(current_frontier));
  }
  private drain_pending(frontier: number[]): number[] {
    let progress = true;
    while (progress) {
      progress = false;
      for (const [agent, queue] of this.pending_ops) {
        let next: RemoteAction | undefined;
        while ((next = queue.get((this.version[agent] ?? -1) + 1))) {
          const new_frontier = this.try_apply(next, frontier); if (!new_frontier) break;
          frontier = new_frontier; queue.delete(next.seq); progress = true;
        }
        if (queue.size === 0) this.pending_ops.delete(agent);
      }
    }
    return frontier;
  }
  private try_apply(action: RemoteAction, frontier: number[]): number[] | undefined {
    this.catch_up_index();
    const parents: Array<number> = [];
    for (const p of action.parents) { const idx = this.index.get(this.key(p)); if (idx === undefined) return undefined; parents.push(idx); }
    const new_local_index = this.state.op.length;
    this.state.op.push({ agent: action.agent, seq: action.seq, parents: parents });
    this.index.set(this.key(action), new_local_index); this.indexed++;
    this.version[action.agent] = action.seq;
    return this.update_local_frontier(frontier, new_local_index, parents);
  }
}

// ───────────── V3: không index, quét ngược + nén pending tại chỗ ─────────────
class NetLean implements Synchronize {
  private pending_ops: Array<RemoteAction> = [];
  constructor(private agent: string, private version: Record<string, number>, private state: Memory) {}
  private find_local_idx_from_global_id(id: GlobalId): number { const op = this.state.op; for (let i = op.length - 1; i >= 0; i--) { const a = op[i]!; if (a.agent === id.agent && a.seq === id.seq) return i; } return -1; }
  private update_local_frontier(current_frontier: Array<number>, new_action_local_index: number, new_action_parent_with_local_index: Array<number>): Array<number> { const filter_out_old_parent_frontier = current_frontier.filter(f => !new_action_parent_with_local_index.includes(f)); return [...filter_out_old_parent_frontier, new_action_local_index]; }
  private result(frontier: Array<number>): Sync { return { state: new Map<string, Memory>([["simple", this.state]]), frontier: new Map([["simple", frontier]]) } }
  sync_with_update_pending_queue(action: RemoteAction, current_frontier: Array<number>): Sync {
    if (action.seq <= (this.version[action.agent] ?? -1)) return this.result(current_frontier);
    const alreadyPending = this.pending_ops.some((op) => op.agent === action.agent && op.seq === action.seq); if (!alreadyPending) this.pending_ops.push(action);
    return this.result(this.drain_pending(current_frontier));
  }
  private drain_pending(frontier: number[]): number[] {
    let progress = true;
    while (progress) {
      progress = false; let keep = 0;
      for (let i = 0; i < this.pending_ops.length; i++) {
        const action = this.pending_ops[i]!;
        if (action.seq <= (this.version[action.agent] ?? -1)) continue;
        const new_frontier = this.try_apply(action, frontier);
        if (new_frontier) { frontier = new_frontier; progress = true; } else this.pending_ops[keep++] = action;
      }
      this.pending_ops.length = keep;
    }
    return frontier;
  }
  private try_apply(action: RemoteAction, frontier: number[]): number[] | undefined {
    if (action.seq !== (this.version[action.agent] ?? -1) + 1) return undefined;
    const parents: Array<number> = [];
    for (const p of action.parents) { const idx = this.find_local_idx_from_global_id(p); if (idx < 0) return undefined; parents.push(idx); }
    const new_local_index = this.state.op.length;
    this.state.op.push({ agent: action.agent, seq: action.seq, parents: parents });
    this.version[action.agent] = action.seq;
    return this.update_local_frontier(frontier, new_local_index, parents);
  }
}

// ───────────── Replica tối giản (giống LocalReplica, nhận network qua factory) ─────────────
class BenchReplica {
  private version: Record<string, number> = {}; private memory: Memory = { op: [] }; private frontier: Array<number> = []; private net: Synchronize;
  constructor(private agent: string, make: Make) { this.version[agent] = -1; this.net = make(agent, this.version, this.memory) }
  action() { this.version[this.agent]! += 1; this.memory.op.push({ agent: this.agent, seq: this.version[this.agent]!, parents: this.frontier }); this.frontier = [this.memory.op.length - 1] }
  send(): Array<RemoteAction> { return this.memory.op.map(l => ({ agent: l.agent, seq: l.seq, parents: l.parents.map(i => ({ agent: this.memory.op[i]!.agent, seq: this.memory.op[i]!.seq })) })) }
  merge(actions: Array<RemoteAction>) { actions.forEach(a => { this.frontier = this.net.sync_with_update_pending_queue(a, this.frontier).frontier.get("simple")! }) }
  get_frontier() { return this.frontier }
  get_len() { return this.memory.op.length }
}

// ───────────── Benchmark ─────────────
const gc = (globalThis as any).gc as (() => void) | undefined;
if (!gc) console.warn("⚠ Chạy với --expose-gc để số đo bộ nhớ chính xác\n");
const settle = () => { gc?.(); gc?.() };

function run(make: Make, n: number, order: "in-order" | "reverse") {
  // kịch bản giống main: r1.action(); r2.action() x n; r1.merge(r2.send())
  const r1 = new BenchReplica("r1", make); const r2 = new BenchReplica("r2", make);
  r1.action(); for (let i = 0; i < n; i++) r2.action();
  const actions = r2.send(); if (order === "reverse") actions.reverse();

  settle(); const before = process.memoryUsage().heapUsed;
  const t0 = performance.now(); r1.merge(actions); const ms = performance.now() - t0;
  settle(); const heap = process.memoryUsage().heapUsed - before; // phần r1 giữ lại sau merge (op + cấu trúc phụ)

  if (r1.get_len() !== n + 1) throw new Error(`Sai kết quả: len=${r1.get_len()}, kỳ vọng ${n + 1}`);
  return { ms, heap, frontier: JSON.stringify(r1.get_frontier()) };
}

function bench(name: string, make: Make, n: number, order: "in-order" | "reverse", reps = 3) {
  run(make, Math.min(n, 200), order); // warm-up JIT
  const rs = Array.from({ length: reps }, () => run(make, n, order)).sort((a, b) => a.ms - b.ms);
  const mid = rs[Math.floor(reps / 2)]!;
  return { impl: name, n, order, "time(ms)": +mid.ms.toFixed(2), "heap(KB)": +(mid.heap / 1024).toFixed(0), frontier: mid.frontier };
}

const impls: Array<[string, Make]> = [
  ["original", (a, v, s) => new NetOriginal(a, v, s)],
  ["indexed-map", (a, v, s) => new NetIndexed(a, v, s)],
  ["lean-scan", (a, v, s) => new NetLean(a, v, s)],
];
const cases: Array<[number, "in-order" | "reverse"]> = [[1000, "in-order"], [5000, "in-order"], [10000, "in-order"], [1000, "reverse"], [3000, "reverse"]];

const rows: Array<ReturnType<typeof bench>> = [];
for (const [n, order] of cases) for (const [name, make] of impls) rows.push(bench(name, make, n, order));
console.table(rows);