/** 无依赖的硬锁拼接工具（避免 production-style ↔ script-gen-layout 循环引用） */

/** 给提示词前补硬锁（已有「画风硬锁」则不重复） */
export function prependStyleLock(prompt: string, lock: string): string {
  const body = String(prompt || '').trim();
  const head = String(lock || '').trim();
  if (!head) return body;
  if (!body) return head;
  if (/画风硬锁|风格硬锁|只禁真人/.test(body)) return body;
  return `${head}\n\n${body}`;
}
