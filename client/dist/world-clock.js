// The world's clock. Shared by the browser and the server so a child and their
// classmates are never in different parts of the day.
//
// Ported from Roblox's TimeManager, including its lengths: a long afternoon, a slow
// dusk, a night worth exploring, and a short morning. The whole cycle is under twelve
// minutes, so a 45-minute lesson sees it turn three or four times.
//
// It is a pure function of the wall clock, with no state to store and nothing to keep
// in step: any browser and any server, given the same moment, produce the same sky.
// (Clock skew between them is handled by the client, which asks the server what time
// it thinks it is when joining.)

export const PHASES = [
  { id: 'day', ja: 'ひるま', en: 'Day', mark: '☀', seconds: 300, from: 0, to: 0 },
  { id: 'dusk', ja: 'ゆうがた', en: 'Dusk', mark: '🌇', seconds: 120, from: 0, to: 1 },
  { id: 'night', ja: 'よる', en: 'Night', mark: '☾', seconds: 240, from: 1, to: 1 },
  { id: 'dawn', ja: 'あさ', en: 'Dawn', mark: '🌅', seconds: 45, from: 1, to: 0 },
];

export const CYCLE_SEC = PHASES.reduce((sum, p) => sum + p.seconds, 0); // 705

// Where each phase begins inside the cycle.
const STARTS = PHASES.reduce((acc, p) => { acc.push(acc[acc.length - 1] + p.seconds); return acc; }, [0]);

export function phaseAt(now = Date.now()) {
  const at = ((now / 1000) % CYCLE_SEC + CYCLE_SEC) % CYCLE_SEC;
  let index = 0;
  while (index < PHASES.length - 1 && at >= STARTS[index + 1]) index += 1;
  const phase = PHASES[index];
  const into = at - STARTS[index];
  const ratio = phase.seconds ? into / phase.seconds : 0;
  return {
    id: phase.id, ja: phase.ja, en: phase.en, mark: phase.mark, index,
    // 0 is broad daylight, 1 is the middle of the night; dusk and dawn slide between.
    night: phase.from + (phase.to - phase.from) * ratio,
    into, endsIn: phase.seconds - into, seconds: phase.seconds,
  };
}

// True while the ghosts are out. Dusk is not night: the sky is still turning and a
// child walking home should not meet one.
export const isNight = (now = Date.now()) => phaseAt(now).id === 'night';

// When the next night begins, in milliseconds from now (0 while it is already night).
export function untilNight(now = Date.now()) {
  const p = phaseAt(now);
  if (p.id === 'night') return 0;
  let wait = p.endsIn;
  for (let i = (p.index + 1) % PHASES.length; PHASES[i].id !== 'night'; i = (i + 1) % PHASES.length) wait += PHASES[i].seconds;
  return Math.round(wait * 1000);
}
