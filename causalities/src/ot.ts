import PriorityQueue from 'priorityqueuejs'
import { ArrayOperation, type GlobalId, LAction, type LocalAction, LocalReplicaCausalGraph } from '../src/causal'


export function findAllConcurrentOperation(graph: LocalReplicaCausalGraph<any>) 
{
  const queue = new PriorityQueue<number>()
  const history = graph.get_history()
  const visited = new Set()

  const add_to_queue = (e: number) => { visited.add(e); queue.enq(e); }

  for (const f of graph.get_frontier()) {
    if(!visited.has(f)) { add_to_queue(f) }
  }

  while(!queue.isEmpty()) {
    const idx = queue.deq()
    const action = new LAction<any>(history[idx]!)
    const parents = action.get_parents()?.map(it => it.get_index()) ?? []
    for (const parentIdx of parents) {
      if (!visited.has(parentIdx)) { add_to_queue(parentIdx) }
    }
  }

  const ops: number[] = []
  for (let i = 0; i < history.length; i++) {
    if (!visited.has(i)) ops.push(i)
  }

  return ops
}


const fmt_id = (id: GlobalId | null): string => (id ? ` ${id[0]}###${id[1]} ` : "null");
const fmt_list = (ids: Array<GlobalId | null>): string => `[${ids.map(fmt_id).join(", ")}]`;

function main() {
  // const print_title = (r: LocalReplicaCausalGraph<string>, msg: string = "") =>
  //   console.log(`Replica ${r.get_agent_glob_number()} ${msg}: ${r.get_agent()} - frontier_id=${r.get_frontier()} - frontier_id=${fmt_list(r.get_frontier_ids())}`);

  const print_history = (r: LocalReplicaCausalGraph<string>) => {
    console.log(`History of replica ${r.get_agent_glob_number()}:`);
    const h = r.get_history();
    if (h.length === 0) console.log("  []");
    console.table(h.map(i => [i[0], i[1].map(c => c.get_index()), i[2]]))
    // h.forEach((a, i) => console.log(`  [${i}] ${fmt_local(a)}`));
  };

  // const print_pending = (r: LocalReplicaCausalGraph<string>) => {
  //   console.log(`Pending of replica ${r.get_agent_glob_number()}:`);
  //   const p = r.get_pending()
  //   if (p.length === 0) console.log("  []");
  //   console.table(p)
  //   // p.forEach((a, i) => console.log(`  [${i}] ${fmt_remote(a)}`));
  // };

  const do_n_thing = (r: LocalReplicaCausalGraph<string>, n: number, contents: string[] = []) => { for (let i = 0; i < n; i++) r.action(contents[Math.min(i, contents.length)]!) };
  const merge = (des: LocalReplicaCausalGraph<string>, src: LocalReplicaCausalGraph<string>, start: number = 0, end: number | null = null) => {
    const delta = end !== null ? src.send().slice(start, end) : src.send().slice(start);
    des.merge(delta);
  };

  const multi_merge_from_left = (r: LocalReplicaCausalGraph<string>, r_list: LocalReplicaCausalGraph<string>[]) => {for (const _r of r_list) merge(r, _r) }

  const r1 = new LocalReplicaCausalGraph<string>();
  const r2 = new LocalReplicaCausalGraph<string>();
  const r3 = new LocalReplicaCausalGraph<string>();
  const tartget = r3
  const others = [r1, r2, r3].filter(e => e != tartget)

  do_n_thing(r1, 10)
  do_n_thing(r2, 5)
  do_n_thing(r3, 3)
  multi_merge_from_left(tartget, others)
  multi_merge_from_left(tartget, others)
  multi_merge_from_left(tartget, others)

  console.log(findAllConcurrentOperation(tartget))
  console.log(tartget.get_frontier())
  print_history(tartget)
}

// main()