// One fetch of missions.json, shared by the island that gets built and the board that
// lists the errands. Both read the same coordinates the server checks against.
let promise = null;

export function loadErrandData() {
  if (!promise) {
    promise = fetch('missions.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`missions.json: ${r.status}`); return r.json(); })
      .then((d) => {
        const island = d.island || null;
        const spots = new Map((island?.spots || []).map((s) => [s.id, s]));
        return { missions: d.missions || [], turnLimit: d.turnLimit || 12, island, spots };
      })
      .catch((err) => {
        console.warn('[errand] missions.json failed to load', err);
        return { missions: [], turnLimit: 12, island: null, spots: new Map() };
      });
  }
  return promise;
}
