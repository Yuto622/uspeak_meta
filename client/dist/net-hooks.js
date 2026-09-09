// Tiny event bus so game modules can report answers and wallet operations without
// depending on the network layer. In offline mode nobody listens and nothing happens.
const listeners = new Map();
export const hooks = {
  on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type)?.delete(fn);
  },
  emit(type, payload) {
    for (const fn of listeners.get(type) || []) {
      try { fn(payload); } catch (err) { console.error('[hooks]', type, err); }
    }
  },
};
