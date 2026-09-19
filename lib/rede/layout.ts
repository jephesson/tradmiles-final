export type RedeNode = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  status: string;
  ownerName: string;
  parentId: string | null;
};

export type LaidOutNode = RedeNode & {
  x: number;
  y: number;
  depth: number;
  directCount: number;
};

export const NODE_W = 236;
export const NODE_H = 86;
export const GAP_X = 52;
export const GAP_Y = 118;

export function childrenMap(nodes: RedeNode[]) {
  const byParent = new Map<string, RedeNode[]>();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    if (!n.parentId || !byId.has(n.parentId)) continue;
    const list = byParent.get(n.parentId) || [];
    list.push(n);
    byParent.set(n.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"));
  }
  return byParent;
}

export function layoutForest(nodes: RedeNode[]): {
  placed: LaidOutNode[];
  width: number;
  height: number;
  roots: RedeNode[];
} {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = childrenMap(nodes);
  const roots = nodes
    .filter((n) => !n.parentId || !byId.has(n.parentId))
    .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"));

  const placed: LaidOutNode[] = [];
  let cursorX = 0;
  let maxY = NODE_H;

  function walk(node: RedeNode, depth: number, left: number): number {
    const children = kids.get(node.id) || [];
    let width = NODE_W;
    let childLeft = left;

    if (children.length) {
      let span = 0;
      for (const child of children) {
        const w = walk(child, depth + 1, childLeft);
        childLeft += w + GAP_X;
        span += w + GAP_X;
      }
      span -= GAP_X;
      width = Math.max(NODE_W, span);
    }

    const x = left + (width - NODE_W) / 2;
    const y = depth * (NODE_H + GAP_Y);
    placed.push({
      ...node,
      x,
      y,
      depth,
      directCount: children.length,
    });
    maxY = Math.max(maxY, y + NODE_H);
    return width;
  }

  for (const root of roots) {
    const w = walk(root, 0, cursorX);
    cursorX += w + GAP_X * 2;
  }

  return {
    placed,
    width: Math.max(NODE_W, cursorX - GAP_X * 2),
    height: maxY,
    roots,
  };
}

export function descendantsOf(id: string, kids: Map<string, RedeNode[]>) {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    for (const child of kids.get(cur) || []) stack.push(child.id);
  }
  return out;
}

export function ancestorsOf(id: string, byId: Map<string, RedeNode>) {
  const out = new Set<string>();
  let cur: RedeNode | undefined = byId.get(id);
  while (cur) {
    out.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    if (cur && out.has(cur.id)) break;
  }
  return out;
}

export function rootOf(id: string, byId: Map<string, RedeNode>) {
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur?.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId.get(cur.parentId);
  }
  return cur || null;
}

export function pathToRoot(id: string, byId: Map<string, RedeNode>) {
  const path: RedeNode[] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    path.push(cur);
    seen.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path.reverse();
}

export function treeNodes(rootId: string, byId: Map<string, RedeNode>, kids: Map<string, RedeNode[]>) {
  return [...descendantsOf(rootId, kids)]
    .map((id) => byId.get(id))
    .filter((n): n is RedeNode => Boolean(n));
}
