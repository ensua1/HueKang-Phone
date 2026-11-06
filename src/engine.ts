import type { Action, Condition, Runtime, StoryNode, Work } from "./schema";
import { makeItem } from "./schema";
export function testCondition(c: Condition, s: Runtime): boolean {
  const [scope, ...rest] = c.key.split(":");
  const key = rest.join(":");
  const lists: Record<string, string[]> = {
    visited: s.visited,
    read: s.read,
    clue: s.clues,
    unlocked: s.unlocked,
    completed: s.completed,
  };
  const actual =
    scope === "ui"
      ? s.ui?.[rest[0]]?.[rest.slice(1).join(":")]
      : lists[scope]
        ? lists[scope].includes(key)
        : s.variables[c.key];
  switch (c.op) {
    case "eq":
      return actual === c.value;
    case "neq":
      return actual !== c.value;
    case "gt":
      return typeof actual === "number" && actual > Number(c.value);
    case "lt":
      return typeof actual === "number" && actual < Number(c.value);
    case "includes":
      return String(actual ?? "").includes(String(c.value));
  }
}
function apply(a: Action, s: Runtime, w: Work) {
  switch (a.type) {
    case "date":
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(a.value))) s.date = String(a.value);
      break;
    case "variable":
      s.variables[a.key] = a.value;
      break;
    case "unlock":
      if (!s.unlocked.includes(a.key)) s.unlocked.push(a.key);
      break;
    case "hide":
      if (!s.hidden.includes(a.key)) s.hidden.push(a.key);
      break;
    case "notification":
      s.notifications.push(String(a.value));
      s.notificationMeta ??= [];
      s.notificationMeta.push({
        app: a.meta?.app,
        thread: a.meta?.thread,
      });
      break;
    case "call":
      s.notifications.push(`${String(a.value)} 来电`);
      s.incomingCall = {
        caller: String(a.value),
        target: a.key,
        status: "ringing",
      };
      break;
    case "clue":
      if (!s.clues.includes(a.key)) s.clues.push(a.key);
      break;
    case "time":
      s.time = String(a.value);
      s.clockRemainderMs = 0;
      break;
    case "ending":
      if (!s.endings.includes(String(a.value))) s.endings.push(String(a.value));
      break;
    case "choice":
      if (!s.choices.some((c) => c.target === a.key))
        s.choices.push({ label: String(a.value), target: a.key });
      break;
    case "message":
      s.msgSeq = (s.msgSeq ?? 0) + 1;
      s.messages[a.key] = [
        ...(s.messages[a.key] ?? []),
        makeItem({
          id: `event-${a.key}-${s.completed.length}-${s.messages[a.key]?.length ?? 0}`,
          title: String(a.meta?.thread ?? "新消息"),
          body: String(a.value),
          sender: w.phone.owner,
          outgoing: true,
          time: a.time || s.time || w.phone.time,
          meta: { seq: String(s.msgSeq), ...(a.meta ?? {}) },
        }),
      ];
      break;
    case "reply": {
      s.msgSeq = (s.msgSeq ?? 0) + 1;
      const item = makeItem({
        id: `reply-${a.key}-${s.completed.length}-${s.messages[a.key]?.length ?? 0}`,
        title: String(a.meta?.thread ?? ""),
        body: String(a.value),
        sender: a.sender || w.phone.owner,
        avatar: a.avatar || "",
        time: a.time || s.time || w.phone.time,
        outgoing: false,
        meta: { reply: "true", seq: String(s.msgSeq), ...(a.meta ?? {}) },
      });
      s.messages[a.key] = [...(s.messages[a.key] ?? []), item];
      s.appBadges ??= {};
      s.appBadges[a.key] = (s.appBadges[a.key] ?? 0) + 1;
      break;
    }
  }
}
function runQueue(
  w: Work,
  s: Runtime,
  event: string,
  target: string,
  queue: string[],
  resuming = new Set<string>(),
  usedPools = new Set<string>(),
) {
  const seen = new Set<string>();
  let steps = 0;
  while (queue.length && steps++ < 200) {
    const id = queue.shift()!;
    const n = w.nodes.find((n) => n.id === id);
    if (!n || seen.has(id) || (n.once && s.completed.includes(id))) continue;
    seen.add(id);
    const conditions = n.conditions.map((c) => testCondition(c, s));
    const pass =
      n.logic === "or"
        ? conditions.some(Boolean)
        : n.logic === "not"
          ? !conditions.every(Boolean)
          : conditions.every(Boolean);
    if (!pass) continue;
    const replyActions = n.actions.filter((a) => a.type === "reply");
    if (replyActions.length) {
      const pool = replyActions[0].meta?.randomPool;
      // 同一批随机回复在一个事件周期内只出一条。
      // 周期以一次 dispatch 为单位：玩家每发一条消息就开启一个新的周期，
      // 于是下一条消息仍能随机抽到一句，而这一次不会把整批都倒出来。
      if (pool && usedPools.has(pool)) continue;
      // 兜底回复只在这一轮还没有人开口时才补位，
      // 这样关键词命中时不会出现"回两句"。
      if (replyActions[0].meta?.fallback === "true" && usedPools.size > 0)
        continue;
      if (pool) usedPools.add(pool);
    }
    if (n.type === "delay" && !resuming.has(id)) {
      s.scheduled ??= [];
      if (!s.scheduled.some((t) => t.nodeId === id))
        s.scheduled.push({
          nodeId: id,
          due: (s.elapsedMs ?? 0) + (n.delayMs ?? 1000),
        });
      s.trace.push(`delay:${n.delayMs ?? 1000}ms → ${n.label}`);
      continue;
    }
    if (!s.completed.includes(id)) s.completed.push(id);
    s.trace.push(`${event}:${target} → ${n.label}`);
    for (const a of n.actions) {
      const previous =
        a.type === "variable"
          ? s.variables[a.key]
          : a.type === "time"
            ? s.time
            : undefined;
      apply(a, s, w);
      if (a.type === "variable" && previous !== s.variables[a.key])
        queue.push(
          ...w.nodes
            .filter(
              (n) =>
                n.event === "variable" && (!n.target || n.target === a.key),
            )
            .map((n) => n.id),
        );
      if (a.type === "time" && previous !== s.time)
        queue.push(
          ...w.nodes
            .filter(
              (n) => n.event === "time" && (!n.target || n.target === s.time),
            )
            .map((n) => n.id),
        );
    }
    if (
      n.type === "ending" &&
      !n.actions.some((a) => a.type === "ending") &&
      !s.endings.includes(n.label)
    )
      s.endings.push(n.label);
    if (n.type === "choice") {
      const context = n.target || "";
      for (const id of n.next)
        if (!s.choices.some((c) => c.target === id))
          s.choices.push({
            label: w.nodes.find((n) => n.id === id)?.label ?? id,
            target: id,
            context,
          });
    } else queue.push(...n.next);
  }
  s.trace = s.trace.slice(-100);
  return s;
}
export function dispatch(
  w: Work,
  previous: Runtime,
  event: string,
  target = "",
): Runtime {
  const s = structuredClone(previous);
  if (event === "choose") s.choices = [];
  if (event === "openApp" && !s.visited.includes(target))
    s.visited.push(target);
  if ((event === "read" || event === "order") && !s.read.includes(target))
    s.read.push(target);
  if (w.mode === "explore") return s;
  const queue = w.nodes
    .filter(
      (n) =>
        (n.type === "start" && event === "start") ||
        (n.event === event && (!n.target || n.target === target)),
    )
    .map((n) => n.id);
  return runQueue(w, s, event, target, queue);
}
export function advance(
  w: Work,
  previous: Runtime,
  milliseconds: number,
): Runtime {
  const s = structuredClone(previous);
  const delta = Number.isFinite(milliseconds)
    ? Math.max(0, Math.min(milliseconds, 86400000))
    : 0;
  const end = (s.elapsedMs ?? 0) + delta;
  s.elapsedMs ??= 0;
  s.clockRemainderMs ??= 0;
  s.scheduled ??= [];
  let resumes = 0;
  while (true) {
    s.scheduled.sort((a, b) => a.due - b.due);
    const due =
      w.mode !== "explore" && resumes < 200 ? s.scheduled[0] : undefined;
    const clockAt = s.elapsedMs + 60000 - s.clockRemainderMs;
    const next = Math.min(
      end,
      clockAt,
      due ? Math.max(s.elapsedMs, due.due) : Infinity,
    );
    s.clockRemainderMs += next - s.elapsedMs;
    s.elapsedMs = next;
    if (s.clockRemainderMs >= 60000) {
      s.clockRemainderMs -= 60000;
      const match = s.time.match(/^(\d{1,2}):(\d{2})$/);
      if (match) {
        const value = (Number(match[1]) * 60 + Number(match[2]) + 1) % 1440;
        s.time =
          String(Math.floor(value / 60)).padStart(2, "0") +
          ":" +
          String(value % 60).padStart(2, "0");
        if (w.mode !== "explore")
          runQueue(
            w,
            s,
            "time",
            s.time,
            w.nodes
              .filter(
                (n) => n.event === "time" && (!n.target || n.target === s.time),
              )
              .map((n) => n.id),
          );
      }
    }
    if (due && due.due <= s.elapsedMs) {
      s.scheduled.splice(s.scheduled.indexOf(due), 1);
      resumes++;
      runQueue(w, s, "timer", due.nodeId, [due.nodeId], new Set([due.nodeId]));
      continue;
    }
    if (s.elapsedMs >= end) break;
  }
  return s;
}
export function choose(w: Work, s: Runtime, id: string) {
  const node = w.nodes.find((n) => n.id === id);
  if (!node || !s.choices.some((c) => c.target === id)) return s;
  return dispatch(
    {
      ...w,
      nodes: w.nodes.map((n) =>
        n.id === id ? { ...n, event: "choose", target: id } : n,
      ),
    },
    s,
    "choose",
    id,
  );
}
export function validateGraph(nodes: StoryNode[]) {
  const errors: string[] = [];
  for (const n of nodes) {
    for (const id of n.next)
      if (!nodes.some((x) => x.id === id))
        errors.push(`${n.label} 引用了不存在的节点 ${id}`);
    if (n.next.includes(n.id))
      errors.push(`${n.label} 存在自环（运行时会阻止循环）`);
  }
  const reachable = new Set<string>();
  const visit = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    nodes.find((n) => n.id === id)?.next.forEach(visit);
  };
  nodes
    .filter((n) => n.type === "start" || n.event)
    .forEach((n) => visit(n.id));
  nodes
    .filter((n) => n.type !== "comment" && !reachable.has(n.id))
    .forEach((n) => errors.push(`${n.label} 不可达`));
  return errors;
}
export function visible(
  item: { id: string; hidden: boolean; unlock: string },
  s: Runtime,
) {
  return (
    !s.hidden.includes(item.id) &&
    (!item.hidden || s.unlocked.includes(item.id)) &&
    (!item.unlock ||
      testCondition({ key: item.unlock, op: "eq", value: true }, s))
  );
}
