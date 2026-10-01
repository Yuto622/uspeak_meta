// The screens a child can open, and the in-page helpers that open them. Shared by
// browser-layout.mjs (are they the right size?) and browser-english.mjs (are they in English?).
// Every panel a child can actually open, and how to open it from the page. A screen that
// only looks right on a laptop is a screen a classroom never sees: these are all measured
// at phone and iPad sizes, one at a time.
//
// `go` is run in the page and may be async; it should leave the panel open. `sel` is what
// gets measured. Anything that fails to open is reported rather than skipped quietly.
export const SCREENS = [
  { id: 'chat', sel: '#net-chat', go: `document.querySelector('#net-chat-button').click()` },
  { id: 'teacher', sel: '#net-teacher', go: `document.querySelector('#net-teacher-button').click()` },
  // 「?」のあそびかたガイド。**はじめての子が最初に開く画面**なので、5サイズで測る。
  { id: 'guide', sel: '#guide-dialog', go: `document.querySelector('#help').click()` },
  { id: 'map', sel: '#rpg-dialog', go: `uspeak.rpg.openMap()` },
  { id: 'book', sel: '#rpg-dialog', go: `uspeak.rpg.openBook()` },
  { id: 'fishing', sel: '#fishing-dialog', go: `document.querySelector('#fishing-button').click()` },
  // The island screens. Each one flies there, stands in the right building and opens the
  // panel through the same call the E key makes.
  { id: 'errand', sel: '#mission-dialog', go: `await uspeak.__layout.island('errand'); document.querySelector('#mission-button').click()` },
  { id: 'quiz', sel: '#quiz-dialog', go: `await uspeak.__layout.at('school', 'easy'); uspeak.net.schoolInteract()` },
  { id: 'gym', sel: '#gym-dialog', go: `await uspeak.__layout.at('school', 'gym'); uspeak.net.schoolInteract()` },
  { id: 'battle', sel: '#battle-dialog', go: `await uspeak.__layout.at('arena', 'easy'); uspeak.net.arenaInteract()` },
  { id: 'dojo', sel: '#dojo-dialog', go: `await uspeak.__layout.at('arena', 'dojo'); uspeak.net.arenaInteract()` },
  { id: 'pet', sel: '#pet-dialog', go: `await uspeak.__layout.at('pet', 'nest'); uspeak.net.petInteract()` },
  { id: 'town', sel: '#town-dialog', go: `await uspeak.__layout.at('town', 'shop'); uspeak.net.townInteract()` },
  { id: 'garage', sel: '#ride-dialog', go: `await uspeak.__layout.at('ride', 'kick'); uspeak.net.rideInteract()` },
  { id: 'eiken', sel: '#eiken-dialog', go: `await uspeak.__layout.at('eiken5', 'reading'); uspeak.net.eikenInteract()` },
  { id: 'interview', sel: '#iv-dialog', go: `await uspeak.__layout.at('eiken5', 'interview'); uspeak.net.eikenInteract()` },
  { id: 'conv', sel: '#conv-dialog', go: `await uspeak.__layout.at('conv', 'cafe'); uspeak.net.convInteract()` },
  { id: 'voice', sel: '#voice-panel', go: `await uspeak.__layout.at('talk', null)` },
  // The race is the one screen that takes the whole window: it is measured like the rest,
  // and on a touch screen it must also put the throttle and the steering under the thumbs.
  { id: 'race', sel: '#race-screen', go: `await uspeak.__layout.race()` },
  // …and the grand prix, which takes the whole window too and has its own thumbs.
  { id: 'gp', sel: '#gp', go: `await uspeak.__layout.gp()` },
  // マイページ: the chart is drawn to a canvas whose size comes from the dialog, so it is
  // worth measuring at every width rather than trusting one.
  { id: 'dash', sel: '#dash-dialog', go: `uspeak.net.dash.open(); await new Promise(r => setTimeout(r, 700))` },
  // きせかえ: a preview canvas beside a grid of cards. The two-column body has to become
  // one column on a phone, and the cards have to stay pressable at every width.
  { id: 'wear', sel: '#wear-dialog', go: `uspeak.net.wardrobe.open(); await new Promise(r => setTimeout(r, 900))` },
];

// The helpers the list above uses, installed in the page once it is online.
export const LAYOUT_HELPERS = `uspeak.__layout = {
  async island(id) {
    for (const el of document.querySelectorAll('dialog[open]')) el.close();
    uspeak.rpg.fly(id); uspeak.rpg.finishFlight();
    await new Promise((r) => setTimeout(r, 500));
  },
  // Fly to an island and stand in one of its buildings, the way a child walks in. The
  // spot's own coordinates come from the island the game itself built.
  async at(island, spot) {
    await this.island(island);
    if (!spot) { await new Promise((r) => setTimeout(r, 900)); return; }
    const data = await (uspeak.rpg[island]?.ready || Promise.resolve(null));
    const isle = data?.island || data;
    const place = (isle?.spots || []).find((s) => s.id === spot) || (isle?.spots || [])[0];
    if (!place) throw new Error('no spot ' + island + '/' + spot);
    uspeak.player.position.set(isle.x + place.x, 0, isle.z + place.z);
    // Walking to a building takes a child inside it, and this renderer takes its time
    // about it: wait for the room rather than for the clock.
    for (let i = 0; i < 40 && !uspeak.rpg.insideBuilding; i += 1) await new Promise((r) => setTimeout(r, 150));
    if (uspeak.rpg.insideBuilding) {
      // Inside, the counter is the place. Same as every island.
      uspeak.player.position.set(0, 0, -1.8);
      for (let i = 0; i < 30; i += 1) {
        await new Promise((r) => setTimeout(r, 150));
        if (uspeak.rpg.schoolNearby?.() || uspeak.rpg.arenaNearby?.() || uspeak.rpg.petNearby?.()
          || uspeak.rpg.townNearby?.() || uspeak.rpg.eikenNearby?.() || uspeak.rpg.convNearby?.()
          || uspeak.rpg.rideNearby?.()) break;
      }
    } else {
      await new Promise((r) => setTimeout(r, 600));
    }
  },
  // のりもの島のレース: the screen the room puts up when the lights come on. The payload is
  // the one race:grid carries, built out of vehicles.json — the same file the island and
  // the server read — so what is measured here is the real screen rather than a mock-up.
  async race() {
    await this.island('ride');
    const v = await (await fetch('vehicles.json')).json();
    const c = v.course;
    uspeak.net.race.onGrid({
      gates: c.gates, road: c.road, reach: c.reach, boosts: c.boosts, items: c.items,
      island: { x: v.island.x, z: v.island.z }, laps: c.laps, opensIn: 12000,
      you: { place: 1, grid: c.grid?.[0] || { x: 0, z: 0 } },
      standings: [{ id: 'me', kind: 'child', name: 'Yuto', place: 1, progress: 0 },
        ...(c.rivals || []).map((r, i) => ({ id: r.id, kind: 'rival', name: r.name, place: i + 2, progress: i * 0.7 }))],
    });
    await new Promise((r) => setTimeout(r, 500));
  },
  // U-SPEAK GRAND PRIX: its own screen, opened with the payload the room's gp:grid
  // carries. The circuit itself comes from tracks.json, the same file the room judges on,
  // so this measures the real screen with the real HUD on it.
  async gp() {
    await this.island('ride');
    await uspeak.net.gp.onGrid({ track: 'sunset', laps: 3, grid: 3, checkpoints: 16, opensIn: 12000,
      you: { id: 'me', name: 'Yuto', grid: 3 } });
    // A field to draw and a running order to fill the corner panel: the HUD is only worth
    // measuring with something in it.
    uspeak.net.gp.onField({ phase: 'lights', standings: [
      { id: 'me', kind: 'child', name: 'Yuto', place: 1, progress: 0 },
      { id: 'ai-midori', kind: 'rival', name: 'ミドリ', place: 2, progress: 0, x: 0, y: 0, z: 0, h: 0 },
      { id: 'ai-sora', kind: 'rival', name: 'ソラ', place: 3, progress: 0, x: 0, y: 0, z: 0, h: 0 },
    ] });
    await new Promise((r) => setTimeout(r, 600));
  },
  close() {
    try { uspeak.net.race.quit(); } catch { /* not racing */ }
    try { uspeak.net.gp.quit(); } catch { /* not racing */ }
    try { uspeak.net.dash.dialog.close(); } catch { /* not open */ }
    try { uspeak.net.wardrobe.dialog.close(); } catch { /* not open */ }
    for (const el of document.querySelectorAll('dialog[open]')) el.close();
    // Closing the panel is not ending the session: a battle or a set of five is still
    // open on the server, and the next screen on the list would be refused. Say goodbye
    // to all of them — the room ignores the ones that were not running.
    for (const bye of ['battle:quit', 'quiz:quit', 'gym:quit', 'eiken:quit', 'interview:quit',
      'mission:quit', 'conv:end', 'race:leave', 'gp:leave', 'voice:leave']) {
      try { uspeak.net.room?.send(bye, {}); } catch { /* not connected */ }
    }
    // Leaving the building too: the next screen is somewhere else, and a child standing
    // in a room has the room's coordinates rather than the island's.
    try { uspeak.rpg.inside?.leave?.(true); } catch { /* not inside */ }
  },
  where() {
    return { space: uspeak.net.currentSpace(), inside: uspeak.rpg.insideBuilding?.spot?.id || null };
  },
};`;

