// 絵本の 登場人物（人）— 顔だけの 絵文字を、体の ある 人物に かきなおす。
// 原点は 足もと（0,0）、上が マイナス。高さは 子ども 200・大人 250 くらい。同じ 本の 同じ 人は いつも 同じ 見た目（seed）。
const n = (v) => Math.round(v * 10) / 10;

const SKIN = ['#ffd9b3', '#f6c79b', '#e8b088', '#c98c62'];
const SKIN_SHADE = ['#f3c093', '#e6b081', '#d3986d', '#b0774f'];
const HAIR = ['#3b2a20', '#5a3a22', '#2a2a33', '#8a5a2b', '#c98a3c'];
const SHIRTS = ['#e2574c', '#4f86d9', '#f0b43c', '#5aae78', '#b06fc4', '#ff8f5a', '#3baacb', '#e0668e'];
const PANTS = ['#3f5f8f', '#5a6a7a', '#7a5a45', '#4a7a6a', '#6a5a8f'];

// 役（絵文字 → どんな 人か）。kid=子どもの 体つき、hair=かみ、hat=ぼうし、coat=上着の 色（きまっていれば）。
export const ROLES = {
  '👦': { kid: true, hair: 'short' }, '👧': { kid: true, hair: 'pigtails', skirt: true }, '🧒': { kid: true, hair: 'bowl' },
  '👶': { kid: true, baby: true, hair: 'curl' },
  '👩': { hair: 'long' }, '👨': { hair: 'short' }, '🧑': { hair: 'bowl' }, '🧔': { hair: 'short', beard: true },
  '👵': { hair: 'bun', gray: true, glasses: true, skirt: true }, '👴': { hair: 'sides', gray: true, mustache: true }, '🧓': { hair: 'short', gray: true, glasses: true },
  '👩‍🦳': { hair: 'bob', gray: true },
  '🤴': { hair: 'short', hat: 'crown', coat: '#7a4fb8', cape: '#e2574c' },
  '👩‍💼': { hair: 'bob', coat: '#3f4f6f', tie: '#e2574c' }, '👨‍💼': { hair: 'short', coat: '#3f4f6f', tie: '#e2574c' }, '🧑‍💼': { hair: 'bowl', coat: '#4a5a6a', tie: '#f0b43c' },
  '👩‍🏫': { hair: 'bun', glasses: true, coat: '#5aae78' }, '🧑‍🏫': { hair: 'short', glasses: true, coat: '#4f86d9' },
  '🧑‍🚀': { hair: 'short', hat: 'helmet', coat: '#f4f6fa', pants: '#f4f6fa', badge: '#e2574c' },
  '🧑‍🌾': { hair: 'short', hat: 'straw', coat: '#e8c170', overalls: '#4f7fbf' }, '👩‍🌾': { hair: 'long', hat: 'straw', coat: '#f0a08a', overalls: '#4f7fbf' },
  '👷': { hair: 'short', hat: 'hard', coat: '#ff9f3a', stripe: '#fff36b' },
  '👨‍✈️': { hair: 'short', hat: 'cap', coat: '#2f3f6f', tie: '#f0b43c' }, '👩‍✈️': { hair: 'bob', hat: 'cap', coat: '#2f3f6f', tie: '#f0b43c' },
  '👨‍🔧': { hair: 'short', hat: 'cap', coat: '#6a7a8a', overalls: '#3f5f8f' },
  '👮': { hair: 'short', hat: 'cap', coat: '#2f4f8f', badge: '#ffd24a' },
  '👩‍🔬': { hair: 'bun', glasses: true, coat: '#ffffff', tie: '#4f86d9' },
  '👩‍⚖️': { hair: 'bob', coat: '#2a2a33', collar: true }, '👨‍⚖️': { hair: 'short', gray: true, coat: '#2a2a33', collar: true }, '🧑‍⚖️': { hair: 'bowl', coat: '#2a2a33', collar: true },
  '👩‍🍳': { hair: 'bun', hat: 'chef', coat: '#ffffff' },
  '🕵️': { hair: 'short', hat: 'fedora', coat: '#b08a5a' },
  '🧑‍💻': { hair: 'bowl', coat: '#6a5a8f' }, '👩‍💻': { hair: 'long', coat: '#3baacb' },
  '🧍': { hair: 'bowl' }, '🧍‍♀️': { hair: 'long' }, '🧍‍♂️': { hair: 'short' },
};

// 顔の 絵文字 → 気持ち（近くの 人の 顔に うつす）。
export const MOODS = {
  '😄': 'happy', '😊': 'happy', '😃': 'happy', '😂': 'happy', '😋': 'happy', '🙂': 'smile', '😉': 'happy', '😅': 'happy',
  '😟': 'sad', '😢': 'cry', '😭': 'cry', '😔': 'sad', '😩': 'sad', '😓': 'sad', '😣': 'sad',
  '😰': 'scared', '😨': 'scared', '😱': 'scared', '🥶': 'scared',
  '😲': 'wow', '😮': 'wow', '😳': 'wow', '😵': 'wow',
  '😴': 'sleep', '🥱': 'sleep',
  '😠': 'angry', '😡': 'angry', '😤': 'angry',
  '🤔': 'think', '🤫': 'smile', '🤐': 'think',
};

const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

function hairBack(style, r, hy, c) {
  if (style === 'long') return `<path d="M${n(-r * 1.08)},${n(hy - r * 0.1)} Q${n(-r * 1.3)},${n(hy + r * 1.5)} ${n(-r * 0.7)},${n(hy + r * 1.75)} L${n(r * 0.7)},${n(hy + r * 1.75)} Q${n(r * 1.3)},${n(hy + r * 1.5)} ${n(r * 1.08)},${n(hy - r * 0.1)} Z" fill="${c}"/>`;
  if (style === 'bob') return `<path d="M${n(-r * 1.12)},${n(hy - r * 0.1)} Q${n(-r * 1.3)},${n(hy + r * 0.9)} ${n(-r * 0.8)},${n(hy + r * 1.05)} L${n(r * 0.8)},${n(hy + r * 1.05)} Q${n(r * 1.3)},${n(hy + r * 0.9)} ${n(r * 1.12)},${n(hy - r * 0.1)} Z" fill="${c}"/>`;
  if (style === 'pigtails') return `<circle cx="${n(-r * 1.22)}" cy="${n(hy + r * 0.28)}" r="${n(r * 0.42)}" fill="${c}"/><circle cx="${n(r * 1.22)}" cy="${n(hy + r * 0.28)}" r="${n(r * 0.42)}" fill="${c}"/>`;
  if (style === 'bun') return `<circle cx="0" cy="${n(hy - r * 1.12)}" r="${n(r * 0.4)}" fill="${c}"/>`;
  return '';
}
function hairFront(style, r, hy, c) {
  const top = hy - r * 1.06;
  // かぶさる かみ（頭の 上 半分）＋ まえがみの 形。
  const cap = (fringe) => `<path d="M${n(-r * 1.04)},${n(hy + r * 0.05)} C${n(-r * 1.2)},${n(hy - r * 1.5)} ${n(r * 1.2)},${n(hy - r * 1.5)} ${n(r * 1.04)},${n(hy + r * 0.05)} ${fringe} Z" fill="${c}"/>`;
  if (style === 'short') return cap(`Q${n(r * 0.9)},${n(hy - r * 0.62)} ${n(r * 0.3)},${n(hy - r * 0.6)} Q${n(-r * 0.3)},${n(hy - r * 0.36)} ${n(-r * 0.86)},${n(hy - r * 0.5)}`);
  if (style === 'bowl') return cap(`Q${n(r * 0.96)},${n(hy - r * 0.34)} ${n(r * 0.5)},${n(hy - r * 0.36)} L${n(-r * 0.5)},${n(hy - r * 0.36)} Q${n(-r * 0.96)},${n(hy - r * 0.34)} ${n(-r * 1.04)},${n(hy + r * 0.05)}`);
  if (style === 'pigtails') return `${cap(`Q${n(r * 0.92)},${n(hy - r * 0.5)} ${n(r * 0.1)},${n(hy - r * 0.62)} Q${n(-r * 0.5)},${n(hy - r * 0.3)} ${n(-r * 0.96)},${n(hy - r * 0.28)}`)}<circle cx="${n(-r * 0.98)}" cy="${n(hy + r * 0.08)}" r="${n(r * 0.14)}" fill="#ff6f91"/><circle cx="${n(r * 0.98)}" cy="${n(hy + r * 0.08)}" r="${n(r * 0.14)}" fill="#ff6f91"/>`;
  if (style === 'long' || style === 'bob') return cap(`Q${n(r * 0.98)},${n(hy - r * 0.4)} ${n(r * 0.2)},${n(hy - r * 0.7)} Q${n(-r * 0.6)},${n(hy - r * 0.36)} ${n(-r * 0.98)},${n(hy - r * 0.2)}`);
  if (style === 'bun') return cap(`Q${n(r * 0.9)},${n(hy - r * 0.6)} 0,${n(hy - r * 0.66)} Q${n(-r * 0.9)},${n(hy - r * 0.6)} ${n(-r * 1.04)},${n(hy + r * 0.05)}`);
  if (style === 'sides') return `<path d="M${n(-r * 1.04)},${n(hy + r * 0.2)} Q${n(-r * 1.2)},${n(hy - r * 0.5)} ${n(-r * 0.7)},${n(hy - r * 0.72)} Q${n(-r * 0.86)},${n(hy - r * 0.2)} ${n(-r * 0.92)},${n(hy + r * 0.2)} Z M${n(r * 1.04)},${n(hy + r * 0.2)} Q${n(r * 1.2)},${n(hy - r * 0.5)} ${n(r * 0.7)},${n(hy - r * 0.72)} Q${n(r * 0.86)},${n(hy - r * 0.2)} ${n(r * 0.92)},${n(hy + r * 0.2)} Z" fill="${c}"/>`;
  if (style === 'curl') return `<path d="M0,${n(top)} q${n(r * 0.3)},${n(-r * 0.3)} 0,${n(-r * 0.36)} q${n(-r * 0.26)},${n(r * 0.04)} ${n(-r * 0.1)},${n(r * 0.2)}" stroke="${c}" stroke-width="${n(r * 0.14)}" fill="none" stroke-linecap="round"/>`;
  return '';
}
function hat(kind, r, hy, role) {
  const top = hy - r;
  if (kind === 'crown') return `<path d="M${n(-r * 0.7)},${n(top + r * 0.2)} L${n(-r * 0.8)},${n(top - r * 0.5)} L${n(-r * 0.35)},${n(top - r * 0.12)} L0,${n(top - r * 0.64)} L${n(r * 0.35)},${n(top - r * 0.12)} L${n(r * 0.8)},${n(top - r * 0.5)} L${n(r * 0.7)},${n(top + r * 0.2)} Z" fill="#ffd24a" stroke="#e0a526" stroke-width="2"/><circle cx="0" cy="${n(top - r * 0.04)}" r="${n(r * 0.1)}" fill="#e2574c"/>`;
  if (kind === 'straw') return `<ellipse cx="0" cy="${n(top + r * 0.3)}" rx="${n(r * 1.6)}" ry="${n(r * 0.3)}" fill="#e8c170"/><path d="M${n(-r * 0.86)},${n(top + r * 0.3)} Q${n(-r * 0.8)},${n(top - r * 0.5)} 0,${n(top - r * 0.5)} Q${n(r * 0.8)},${n(top - r * 0.5)} ${n(r * 0.86)},${n(top + r * 0.3)} Z" fill="#f3d48a"/><path d="M${n(-r * 0.86)},${n(top + r * 0.24)} Q0,${n(top + r * 0.46)} ${n(r * 0.86)},${n(top + r * 0.24)}" stroke="#d9663a" stroke-width="${n(r * 0.14)}" fill="none"/>`;
  if (kind === 'hard') return `<path d="M${n(-r * 1.02)},${n(top + r * 0.42)} Q${n(-r * 1.02)},${n(top - r * 0.5)} 0,${n(top - r * 0.5)} Q${n(r * 1.02)},${n(top - r * 0.5)} ${n(r * 1.02)},${n(top + r * 0.42)} Z" fill="#ffd24a"/><rect x="${n(-r * 1.2)}" y="${n(top + r * 0.34)}" width="${n(r * 2.4)}" height="${n(r * 0.18)}" rx="${n(r * 0.09)}" fill="#f0b43c"/><rect x="${n(-r * 0.1)}" y="${n(top - r * 0.5)}" width="${n(r * 0.2)}" height="${n(r * 0.86)}" fill="#f0b43c"/>`;
  if (kind === 'chef') return `<rect x="${n(-r * 0.74)}" y="${n(top - r * 0.2)}" width="${n(r * 1.48)}" height="${n(r * 0.56)}" fill="#fff" stroke="#d8d8d8" stroke-width="2"/><circle cx="${n(-r * 0.5)}" cy="${n(top - r * 0.44)}" r="${n(r * 0.44)}" fill="#fff"/><circle cx="${n(r * 0.5)}" cy="${n(top - r * 0.44)}" r="${n(r * 0.44)}" fill="#fff"/><circle cx="0" cy="${n(top - r * 0.66)}" r="${n(r * 0.5)}" fill="#fff"/>`;
  if (kind === 'cap') return `<path d="M${n(-r * 0.98)},${n(top + r * 0.4)} Q${n(-r * 1.1)},${n(top - r * 0.44)} 0,${n(top - r * 0.42)} Q${n(r * 1.1)},${n(top - r * 0.44)} ${n(r * 0.98)},${n(top + r * 0.4)} Z" fill="${role.coat || '#2f3f6f'}"/><rect x="${n(-r * 1.08)}" y="${n(top + r * 0.3)}" width="${n(r * 2.16)}" height="${n(r * 0.2)}" rx="${n(r * 0.1)}" fill="#1f2a44"/><circle cx="0" cy="${n(top + r * 0.02)}" r="${n(r * 0.14)}" fill="#ffd24a"/>`;
  if (kind === 'fedora') return `<ellipse cx="0" cy="${n(top + r * 0.34)}" rx="${n(r * 1.4)}" ry="${n(r * 0.22)}" fill="#7a5a3b"/><path d="M${n(-r * 0.8)},${n(top + r * 0.3)} L${n(-r * 0.64)},${n(top - r * 0.46)} Q0,${n(top - r * 0.26)} ${n(r * 0.64)},${n(top - r * 0.46)} L${n(r * 0.8)},${n(top + r * 0.3)} Z" fill="#8a6a45"/><rect x="${n(-r * 0.78)}" y="${n(top + r * 0.1)}" width="${n(r * 1.56)}" height="${n(r * 0.18)}" fill="#3b2a20"/>`;
  return '';
}

function face(mood, r, hy, glasses) {
  const ex = r * 0.38; const ey = hy + r * 0.06; const er = r * 0.115; const my = hy + r * 0.5; const ink = '#3b2a20';
  let eyes = `<circle cx="${n(-ex)}" cy="${n(ey)}" r="${n(er)}" fill="${ink}"/><circle cx="${n(ex)}" cy="${n(ey)}" r="${n(er)}" fill="${ink}"/><circle cx="${n(-ex + er * 0.35)}" cy="${n(ey - er * 0.4)}" r="${n(er * 0.34)}" fill="#fff"/><circle cx="${n(ex + er * 0.35)}" cy="${n(ey - er * 0.4)}" r="${n(er * 0.34)}" fill="#fff"/>`;
  let brows = ''; let mouth = `<path d="M${n(-r * 0.24)},${n(my)} Q0,${n(my + r * 0.22)} ${n(r * 0.24)},${n(my)}" stroke="${ink}" stroke-width="${n(r * 0.075)}" fill="none" stroke-linecap="round"/>`;
  let extra = '';
  const brow = (dir) => `<path d="M${n(-ex - r * 0.16)},${n(ey - r * 0.3 - dir * r * 0.08)} L${n(-ex + r * 0.16)},${n(ey - r * 0.3 + dir * r * 0.08)} M${n(ex - r * 0.16)},${n(ey - r * 0.3 + dir * r * 0.08)} L${n(ex + r * 0.16)},${n(ey - r * 0.3 - dir * r * 0.08)}" stroke="${ink}" stroke-width="${n(r * 0.07)}" stroke-linecap="round"/>`;
  if (mood === 'happy') { eyes = `<path d="M${n(-ex - er * 1.3)},${n(ey + er * 0.4)} Q${n(-ex)},${n(ey - er * 1.6)} ${n(-ex + er * 1.3)},${n(ey + er * 0.4)} M${n(ex - er * 1.3)},${n(ey + er * 0.4)} Q${n(ex)},${n(ey - er * 1.6)} ${n(ex + er * 1.3)},${n(ey + er * 0.4)}" stroke="${ink}" stroke-width="${n(r * 0.08)}" fill="none" stroke-linecap="round"/>`; mouth = `<path d="M${n(-r * 0.28)},${n(my - r * 0.06)} Q0,${n(my + r * 0.4)} ${n(r * 0.28)},${n(my - r * 0.06)} Z" fill="#8a2f3a"/><path d="M${n(-r * 0.14)},${n(my + r * 0.12)} Q0,${n(my + r * 0.04)} ${n(r * 0.14)},${n(my + r * 0.12)} Q0,${n(my + r * 0.26)} ${n(-r * 0.14)},${n(my + r * 0.12)}" fill="#ff8f9a"/>`; }
  if (mood === 'sad' || mood === 'cry') { brows = brow(-1); mouth = `<path d="M${n(-r * 0.2)},${n(my + r * 0.12)} Q0,${n(my - r * 0.08)} ${n(r * 0.2)},${n(my + r * 0.12)}" stroke="${ink}" stroke-width="${n(r * 0.075)}" fill="none" stroke-linecap="round"/>`; }
  if (mood === 'cry') extra = `<path d="M${n(-ex)},${n(ey + er * 1.6)} q${n(-r * 0.09)},${n(r * 0.18)} 0,${n(r * 0.26)} q${n(r * 0.09)},${n(-r * 0.08)} 0,${n(-r * 0.26)}" fill="#6fc3ff"/><path d="M${n(ex)},${n(ey + er * 1.6)} q${n(-r * 0.09)},${n(r * 0.18)} 0,${n(r * 0.26)} q${n(r * 0.09)},${n(-r * 0.08)} 0,${n(-r * 0.26)}" fill="#6fc3ff"/>`;
  if (mood === 'scared') { brows = brow(-1); eyes = `<circle cx="${n(-ex)}" cy="${n(ey)}" r="${n(er * 1.5)}" fill="#fff" stroke="${ink}" stroke-width="2"/><circle cx="${n(ex)}" cy="${n(ey)}" r="${n(er * 1.5)}" fill="#fff" stroke="${ink}" stroke-width="2"/><circle cx="${n(-ex)}" cy="${n(ey)}" r="${n(er * 0.6)}" fill="${ink}"/><circle cx="${n(ex)}" cy="${n(ey)}" r="${n(er * 0.6)}" fill="${ink}"/>`; mouth = `<path d="M${n(-r * 0.22)},${n(my + r * 0.06)} q${n(r * 0.055)},${n(-r * 0.1)} ${n(r * 0.11)},0 t${n(r * 0.11)},0 t${n(r * 0.11)},0 t${n(r * 0.11)},0" stroke="${ink}" stroke-width="${n(r * 0.07)}" fill="none" stroke-linecap="round"/>`; extra = `<path d="M${n(r * 0.72)},${n(hy - r * 0.5)} q${n(-r * 0.1)},${n(r * 0.2)} 0,${n(r * 0.28)} q${n(r * 0.1)},${n(-r * 0.08)} 0,${n(-r * 0.28)}" fill="#6fc3ff"/>`; }
  if (mood === 'wow') { brows = `<path d="M${n(-ex - r * 0.15)},${n(ey - r * 0.36)} q${n(r * 0.15)},${n(-r * 0.1)} ${n(r * 0.3)},0 M${n(ex - r * 0.15)},${n(ey - r * 0.36)} q${n(r * 0.15)},${n(-r * 0.1)} ${n(r * 0.3)},0" stroke="${ink}" stroke-width="${n(r * 0.06)}" fill="none" stroke-linecap="round"/>`; eyes = `<circle cx="${n(-ex)}" cy="${n(ey)}" r="${n(er * 1.25)}" fill="${ink}"/><circle cx="${n(ex)}" cy="${n(ey)}" r="${n(er * 1.25)}" fill="${ink}"/><circle cx="${n(-ex + er * 0.4)}" cy="${n(ey - er * 0.5)}" r="${n(er * 0.45)}" fill="#fff"/><circle cx="${n(ex + er * 0.4)}" cy="${n(ey - er * 0.5)}" r="${n(er * 0.45)}" fill="#fff"/>`; mouth = `<ellipse cx="0" cy="${n(my + r * 0.06)}" rx="${n(r * 0.14)}" ry="${n(r * 0.18)}" fill="#8a2f3a"/>`; }
  if (mood === 'sleep') { eyes = `<path d="M${n(-ex - er * 1.3)},${n(ey)} Q${n(-ex)},${n(ey + er * 1.5)} ${n(-ex + er * 1.3)},${n(ey)} M${n(ex - er * 1.3)},${n(ey)} Q${n(ex)},${n(ey + er * 1.5)} ${n(ex + er * 1.3)},${n(ey)}" stroke="${ink}" stroke-width="${n(r * 0.07)}" fill="none" stroke-linecap="round"/>`; mouth = `<ellipse cx="0" cy="${n(my + r * 0.04)}" rx="${n(r * 0.09)}" ry="${n(r * 0.11)}" fill="#8a2f3a"/>`; }
  if (mood === 'angry') { brows = brow(1); mouth = `<path d="M${n(-r * 0.2)},${n(my + r * 0.1)} Q0,${n(my - r * 0.04)} ${n(r * 0.2)},${n(my + r * 0.1)}" stroke="${ink}" stroke-width="${n(r * 0.08)}" fill="none" stroke-linecap="round"/>`; }
  if (mood === 'think') { brows = `<path d="M${n(-ex - r * 0.15)},${n(ey - r * 0.28)} l${n(r * 0.3)},0 M${n(ex - r * 0.15)},${n(ey - r * 0.4)} q${n(r * 0.15)},${n(-r * 0.08)} ${n(r * 0.3)},0" stroke="${ink}" stroke-width="${n(r * 0.06)}" fill="none" stroke-linecap="round"/>`; mouth = `<path d="M${n(-r * 0.04)},${n(my + r * 0.06)} q${n(r * 0.12)},${n(-r * 0.08)} ${n(r * 0.24)},0" stroke="${ink}" stroke-width="${n(r * 0.075)}" fill="none" stroke-linecap="round"/>`; }
  const cheeks = `<ellipse cx="${n(-r * 0.62)}" cy="${n(hy + r * 0.36)}" rx="${n(r * 0.17)}" ry="${n(r * 0.11)}" fill="#ff8f9a" opacity=".5"/><ellipse cx="${n(r * 0.62)}" cy="${n(hy + r * 0.36)}" rx="${n(r * 0.17)}" ry="${n(r * 0.11)}" fill="#ff8f9a" opacity=".5"/>`;
  const gl = glasses ? `<g fill="#fff" fill-opacity=".35" stroke="#4a4a55" stroke-width="${n(r * 0.06)}"><circle cx="${n(-ex)}" cy="${n(ey)}" r="${n(r * 0.24)}"/><circle cx="${n(ex)}" cy="${n(ey)}" r="${n(r * 0.24)}"/><path d="M${n(-ex + r * 0.24)},${n(ey)} L${n(ex - r * 0.24)},${n(ey)}" fill="none"/></g>` : '';
  return `${cheeks}${brows}${eyes}${gl}${mouth}${extra}`;
}

// 1 人 かく。opts: { emoji, seed（本の id など）, mood, pose: 'stand'|'wave'|'cheer'|'droop' }。返す：{ svg, height, width }。
export function person({ emoji, seed = '', mood = 'smile', pose = 'stand' }) {
  const role = ROLES[emoji]; if (!role) return null;
  const h = hash(`${seed}|${emoji}`);
  const tone = h % SKIN.length; const skin = SKIN[tone]; const shade = SKIN_SHADE[tone];
  const hairC = role.gray ? (role.hair === 'sides' ? '#d9d9de' : '#c9c9d2') : HAIR[(h >>> 3) % HAIR.length];
  const shirt = role.coat || SHIRTS[(h >>> 6) % SHIRTS.length];
  const pants = role.pants || role.overalls || PANTS[(h >>> 10) % PANTS.length];
  const kid = !!role.kid; const baby = !!role.baby;
  // からだの 寸法。
  const R = baby ? 44 : kid ? 46 : 38;                       // 頭の 半径
  const leg = baby ? 22 : kid ? 46 : 88; const torso = baby ? 52 : kid ? 64 : 86; const sh = baby ? 28 : kid ? 31 : 37; // かたはば（半分）
  const hipY = -leg; const shY = hipY - torso; const hy = shY - R * 0.86; const top = hy - R;
  const legW = kid ? 19 : 21; const gap = kid ? 5 : 6; const lw = kid ? 15 : 17; // うでの 太さ
  const shoe = '#4a3a34';
  let s = '';
  s += `<ellipse cx="0" cy="2" rx="${sh + 26}" ry="9" fill="#000" opacity=".16"/>`;
  if (role.cape) s += `<path d="M${-sh},${shY + 8} Q${-sh - 26},${hipY + 10} ${-sh - 10},${hipY + 34} L${sh + 10},${hipY + 34} Q${sh + 26},${hipY + 10} ${sh},${shY + 8} Z" fill="${role.cape}"/>`;
  s += hairBack(role.hair, R, hy, hairC);
  // あし と くつ
  for (const sx of [-1, 1]) {
    const x = sx * (gap + legW / 2);
    s += `<rect x="${n(x - legW / 2)}" y="${hipY - 6}" width="${legW}" height="${leg + 2}" rx="${legW / 2.4}" fill="${role.skirt ? skin : pants}"/>`;
    s += `<path d="M${n(x - legW / 2 - 2)},0 q0,-13 ${n(legW / 2 + 2)},-13 q${n(legW / 2 + 8 * 1)},0 ${n(legW / 2 + 9)},13 Z" fill="${shoe}" transform="${sx < 0 ? `translate(${n(2 * x)},0) scale(-1,1)` : ''}"/>`;
    if (role.skirt) s += `<rect x="${n(x - legW / 2)}" y="-22" width="${legW}" height="12" fill="#fff"/>`;
  }
  // うで（うしろ側＝おろした うで）
  const armDown = (sx, droop = 0) => { const x0 = sx * (sh - 4); const y0 = shY + 12; const x1 = sx * (sh + 12 - droop * 6); const y1 = shY + torso * 0.78; return `<path d="M${x0},${y0} L${n(x1)},${n(y1)}" stroke="${shirt}" stroke-width="${lw}" stroke-linecap="round"/><circle cx="${n(x1 + sx * 1)}" cy="${n(y1 + 7)}" r="${n(lw * 0.56)}" fill="${skin}"/>`; };
  const armUp = (sx, high = 1) => { const x0 = sx * (sh - 4); const y0 = shY + 12; const x1 = sx * (sh + 26); const y1 = shY - 30 * high; return `<path d="M${x0},${y0} L${n(x1)},${n(y1)}" stroke="${shirt}" stroke-width="${lw}" stroke-linecap="round"/><circle cx="${n(x1 + sx * 4)}" cy="${n(y1 - 7)}" r="${n(lw * 0.6)}" fill="${skin}"/>`; };
  const arms = pose === 'cheer' ? armUp(-1) + armUp(1) : pose === 'wave' ? armDown(-1) + armUp(1, 1.1) : pose === 'droop' ? armDown(-1, 1) + armDown(1, 1) : armDown(-1) + armDown(1);
  s += arms;
  // どう（シャツ／ワンピース）
  const hem = role.skirt ? hipY + 26 : hipY + 8; const hemW = role.skirt ? sh + 16 : sh + 1;
  s += `<path d="M${-sh},${shY + 12} Q${-sh},${shY} ${-sh + 12},${shY} L${sh - 12},${shY} Q${sh},${shY} ${sh},${shY + 12} L${hemW},${hem} Q0,${hem + (role.skirt ? 10 : 6)} ${-hemW},${hem} Z" fill="${shirt}"/>`;
  s += `<path d="M${sh * 0.3},${shY + 6} L${hemW * 0.9},${hem - 2} L${hemW * 0.4},${hem + 2} Z" fill="#000" opacity=".06"/>`;
  if (role.overalls) s += `<path d="M${-sh + 8},${shY + 34} L${sh - 8},${shY + 34} L${sh + 1},${hem} Q0,${hem + 6} ${-sh - 1},${hem} Z" fill="${role.overalls}"/><rect x="${-sh + 10}" y="${shY + 2}" width="9" height="36" fill="${role.overalls}"/><rect x="${sh - 19}" y="${shY + 2}" width="9" height="36" fill="${role.overalls}"/><circle cx="${-sh + 14}" cy="${shY + 38}" r="4" fill="#ffd24a"/><circle cx="${sh - 14}" cy="${shY + 38}" r="4" fill="#ffd24a"/>`;
  if (role.stripe) s += `<rect x="${-sh + 2}" y="${shY + 40}" width="${sh * 2 - 4}" height="10" fill="${role.stripe}"/>`;
  if (role.tie) s += `<path d="M-10,${shY} L0,${shY + 16} L10,${shY} Z" fill="#fff"/><path d="M-5,${shY + 12} L5,${shY + 12} L8,${shY + 46} L0,${shY + 56} L-8,${shY + 46} Z" fill="${role.tie}"/>`;
  if (role.collar) s += `<path d="M-14,${shY} L0,${shY + 22} L14,${shY} Z" fill="#fff"/>`;
  if (role.badge) s += `<circle cx="${-sh + 16}" cy="${shY + 30}" r="7" fill="${role.badge}"/>`;
  if (!role.coat && kid && !role.skirt) s += `<rect x="${-sh + 1}" y="${n(shY + torso * 0.42)}" width="${sh * 2 - 2}" height="9" fill="#fff" opacity=".55"/><rect x="${-sh}" y="${n(shY + torso * 0.66)}" width="${sh * 2}" height="9" fill="#fff" opacity=".55"/>`;
  if (role.skirt && kid) s += `<path d="M-9,${shY + 2} L0,${shY + 12} L9,${shY + 2} Z" fill="#fff"/>`;
  // くび と あたま
  s += `<rect x="-9" y="${n(hy + R * 0.7)}" width="18" height="${n(R * 0.36)}" fill="${shade}"/>`;
  s += `<circle cx="${-R * 0.98}" cy="${n(hy + R * 0.12)}" r="${n(R * 0.2)}" fill="${skin}"/><circle cx="${R * 0.98}" cy="${n(hy + R * 0.12)}" r="${n(R * 0.2)}" fill="${skin}"/>`;
  s += `<ellipse cx="0" cy="${n(hy)}" rx="${R}" ry="${n(R * 0.98)}" fill="${skin}"/>`;
  if (role.hat === 'helmet') {
    s += face(mood, R, hy, role.glasses) + hairFront(role.hair, R, hy, hairC);
    s += `<circle cx="0" cy="${n(hy)}" r="${n(R * 1.3)}" fill="#bfe6ff" fill-opacity=".28" stroke="#e8ecf2" stroke-width="9"/><path d="M${n(-R * 0.8)},${n(hy - R * 0.7)} q${n(R * 0.3)},${n(-R * 0.36)} ${n(R * 0.8)},${n(-R * 0.4)}" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".7"/><rect x="${-sh - 2}" y="${shY - 6}" width="${sh * 2 + 4}" height="14" rx="7" fill="#c9d0dc"/>`;
    return { svg: s, height: n(-top + R * 0.3), width: (sh + 40) * 2 };
  }
  s += face(mood, R, hy, role.glasses);
  if (role.beard) s += `<path d="M${n(-R * 0.86)},${n(hy + R * 0.2)} Q${n(-R * 0.8)},${n(hy + R * 1.2)} 0,${n(hy + R * 1.16)} Q${n(R * 0.8)},${n(hy + R * 1.2)} ${n(R * 0.86)},${n(hy + R * 0.2)} Q${n(R * 0.5)},${n(hy + R * 0.34)} ${n(R * 0.3)},${n(hy + R * 0.34)} Q0,${n(hy + R * 0.8)} ${n(-R * 0.3)},${n(hy + R * 0.34)} Q${n(-R * 0.5)},${n(hy + R * 0.34)} ${n(-R * 0.86)},${n(hy + R * 0.2)} Z" fill="${hairC}"/>`;
  if (role.mustache) s += `<path d="M${n(-R * 0.36)},${n(hy + R * 0.42)} Q${n(-R * 0.16)},${n(hy + R * 0.26)} 0,${n(hy + R * 0.38)} Q${n(R * 0.16)},${n(hy + R * 0.26)} ${n(R * 0.36)},${n(hy + R * 0.42)} Q0,${n(hy + R * 0.48)} ${n(-R * 0.36)},${n(hy + R * 0.42)} Z" fill="#fff"/>`;
  s += hairFront(role.hair, R, hy, hairC);
  if (role.hat) s += hat(role.hat, R, hy, role);
  const extraTop = role.hat === 'chef' ? R * 1.1 : role.hat ? R * 0.6 : role.hair === 'bun' ? R * 0.5 : 0;
  return { svg: s, height: n(-top + extraTop), width: (sh + 40) * 2 };
}
