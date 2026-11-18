// 絵本の 背景 20 まい（800×600 の SVG）。空・とおく・なか・手前の 4 そうで おくゆきを 出す。
// どれも 図形だけ（画像ファイル・フォントを 使わない）。地面は 上から 6 わり くらいから 下（登場人物の 足が のる）。
const W = 800; const H = 600;
const n = (v) => Math.round(v * 10) / 10;

let uid = 0;
const grad = (stops, { x2 = 0, y2 = 1 } = {}) => {
  const id = `bg${uid += 1}`;
  return { id, def: `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('')}</linearGradient>` };
};
const radial = (stops, cx = 0.5, cy = 0.5, r = 0.5) => {
  const id = `bg${uid += 1}`;
  return { id, def: `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('')}</radialGradient>` };
};

// きまった 乱数（同じ 背景は いつも 同じ 絵）。
const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

class Art {
  constructor(bare = false) { this.defs = []; this.out = []; this.bare = bare; } // bare：太陽・月を かかない（場面の ほうに ある とき）
  g(stops, o) { const x = grad(stops, o); this.defs.push(x.def); return `url(#${x.id})`; }
  r(stops, cx, cy, rr) { const x = radial(stops, cx, cy, rr); this.defs.push(x.def); return `url(#${x.id})`; }
  add(s) { this.out.push(s); return this; }
  sky(c1, c2, c3) { return this.add(`<rect width="${W}" height="${H}" fill="${this.g(c3 ? [[0, c1], [0.55, c2], [1, c3]] : [[0, c1], [1, c2]])}"/>`); }
  sun(x, y, r, c = '#ffd86b') {
    if (this.bare) return this;
    return this.add(`<circle cx="${x}" cy="${y}" r="${r * 2.6}" fill="${this.r([[0, c, 0.55], [1, c, 0]])}"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x - r * 0.25}" cy="${y - r * 0.25}" r="${r * 0.55}" fill="#fff" opacity=".25"/>`);
  }
  moon(x, y, r) { if (this.bare) return this; return this.add(`<circle cx="${x}" cy="${y}" r="${r * 2.4}" fill="${this.r([[0, '#fff6c9', 0.35], [1, '#fff6c9', 0]])}"/><circle cx="${x}" cy="${y}" r="${r}" fill="#fff3bf"/><circle cx="${x + r * 0.42}" cy="${y - r * 0.2}" r="${r * 0.86}" fill="#243a66" opacity=".0"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.2}" r="${r * 0.16}" fill="#e8d894"/><circle cx="${x + r * 0.25}" cy="${y + r * 0.3}" r="${r * 0.22}" fill="#e8d894"/><circle cx="${x + r * 0.2}" cy="${y - r * 0.45}" r="${r * 0.1}" fill="#e8d894"/>`); }
  stars(count, seed, yMax = 330, c = '#fff') {
    const R = rng(seed); let s = '';
    for (let i = 0; i < count; i += 1) { const x = n(R() * W); const y = n(R() * yMax); const r = n(0.8 + R() * 2.2); s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity="${n(0.45 + R() * 0.55)}"/>`; }
    return this.add(s);
  }
  cloud(x, y, s = 1, c = '#fff', o = 0.95) {
    const p = [[0, 0, 34], [38, -16, 40], [84, -6, 36], [118, 4, 26], [-36, 6, 24]];
    return this.add(`<g opacity="${o}" fill="${c}">${p.map(([dx, dy, r]) => `<circle cx="${n(x + dx * s)}" cy="${n(y + dy * s)}" r="${n(r * s)}"/>`).join('')}<rect x="${n(x - 44 * s)}" y="${n(y)}" width="${n(176 * s)}" height="${n(30 * s)}" rx="${n(15 * s)}"/></g>`);
  }
  // なだらかな 丘：yBase を 中心に amp で うねる。下まで ぬる。
  hill(yBase, amp, fill, seed, { steps = 4, bottom = H } = {}) {
    const R = rng(seed); const pts = [];
    for (let i = 0; i <= steps; i += 1) pts.push([n((W / steps) * i), n(yBase + (R() - 0.5) * 2 * amp)]);
    let d = `M0,${bottom} L${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i += 1) { const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i]; const mx = n((x0 + x1) / 2); d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`; }
    return this.add(`<path d="${d} L${W},${bottom} Z" fill="${fill}"/>`);
  }
  // とがった 山なみ。
  peaks(yBase, amp, fill, seed, { count = 5, snow = '' } = {}) {
    const R = rng(seed); let d = `M0,${H} L0,${yBase}`; const tips = [];
    for (let i = 0; i < count; i += 1) { const x = n((W / count) * (i + 0.5) + (R() - 0.5) * 50); const y = n(yBase - amp * (0.55 + R() * 0.45)); tips.push([x, y]); d += ` L${x},${y} L${n((W / count) * (i + 1))},${n(yBase - amp * 0.12 * R())}`; }
    let s = `<path d="${d} L${W},${H} Z" fill="${fill}"/>`;
    if (snow) for (const [x, y] of tips) s += `<path d="M${x},${y} l22,34 l-12,-7 l-10,11 l-9,-12 l-13,8 Z" fill="${snow}"/>`;
    return this.add(s);
  }
  ground(y, c1, c2) { return this.add(`<rect y="${y}" width="${W}" height="${H - y}" fill="${this.g([[0, c1], [1, c2]])}"/>`); }
  tree(x, y, s = 1, leaf = '#4f9d5d', leaf2 = '#3f8a52', trunk = '#8a5a3b') {
    return this.add(`<g transform="translate(${x},${y}) scale(${s})"><ellipse cx="0" cy="4" rx="46" ry="9" fill="#000" opacity=".12"/><path d="M-9,0 L-6,-70 L6,-70 L9,0 Z" fill="${trunk}"/><circle cx="0" cy="-104" r="52" fill="${leaf2}"/><circle cx="-34" cy="-84" r="34" fill="${leaf2}"/><circle cx="36" cy="-82" r="36" fill="${leaf2}"/><circle cx="-8" cy="-112" r="44" fill="${leaf}"/><circle cx="26" cy="-96" r="30" fill="${leaf}"/><circle cx="-22" cy="-124" r="14" fill="#fff" opacity=".14"/></g>`);
  }
  pine(x, y, s = 1, c = '#2f7a52', c2 = '#27684a') {
    return this.add(`<g transform="translate(${x},${y}) scale(${s})"><ellipse cx="0" cy="3" rx="34" ry="7" fill="#000" opacity=".12"/><rect x="-6" y="-26" width="12" height="28" fill="#7a4f33"/><path d="M0,-150 L38,-84 L-38,-84 Z" fill="${c}"/><path d="M0,-116 L48,-48 L-48,-48 Z" fill="${c2}"/><path d="M0,-82 L58,-16 L-58,-16 Z" fill="${c}"/></g>`);
  }
  bush(x, y, s = 1, c = '#5aa862', c2 = '#4a9455') {
    return this.add(`<g transform="translate(${x},${y}) scale(${s})"><circle cx="-26" cy="-14" r="22" fill="${c2}"/><circle cx="24" cy="-16" r="24" fill="${c2}"/><circle cx="0" cy="-24" r="28" fill="${c}"/><rect x="-46" y="-14" width="94" height="16" rx="8" fill="${c2}"/></g>`);
  }
  flower(x, y, s = 1, c = '#ff8fab', mid = '#ffd24a') {
    let p = '';
    for (let i = 0; i < 5; i += 1) { const a = (Math.PI * 2 * i) / 5 - Math.PI / 2; p += `<circle cx="${n(Math.cos(a) * 8)}" cy="${n(-26 + Math.sin(a) * 8)}" r="6.5" fill="${c}"/>`; }
    return this.add(`<g transform="translate(${x},${y}) scale(${s})"><path d="M0,0 Q-3,-12 0,-24" stroke="#3f8a52" stroke-width="3" fill="none"/><path d="M0,-8 q10,-8 13,0 q-8,4 -13,0" fill="#4f9d5d"/>${p}<circle cx="0" cy="-26" r="5" fill="${mid}"/></g>`);
  }
  flowers(count, seed, y0, y1, colors = ['#ff8fab', '#ffd24a', '#fff', '#c79bff']) {
    const R = rng(seed);
    for (let i = 0; i < count; i += 1) { const y = y0 + R() * (y1 - y0); this.flower(n(R() * W), n(y), n(0.55 + ((y - y0) / (y1 - y0 || 1)) * 0.6), colors[Math.floor(R() * colors.length)], colors[0] === '#ffd24a' ? '#fff' : '#ffd24a'); }
    return this;
  }
  tufts(count, seed, y0, y1, c = '#3f8a52') {
    const R = rng(seed); let s = '';
    for (let i = 0; i < count; i += 1) { const x = n(R() * W); const y = n(y0 + R() * (y1 - y0)); const k = n(0.6 + R() * 0.8); s += `<path d="M${x},${y} q${n(-4 * k)},${n(-10 * k)} ${n(-7 * k)},${n(-14 * k)} M${x},${y} q0,${n(-12 * k)} ${n(1 * k)},${n(-17 * k)} M${x},${y} q${n(4 * k)},${n(-10 * k)} ${n(8 * k)},${n(-13 * k)}" stroke="${c}" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".7"/>`; }
    return this.add(s);
  }
  house(x, y, s = 1, wall = '#ffe9c4', roof = '#d9663a') {
    return this.add(`<g transform="translate(${x},${y}) scale(${s})"><rect x="-50" y="-70" width="100" height="70" fill="${wall}"/><path d="M-62,-68 L0,-118 L62,-68 Z" fill="${roof}"/><rect x="-12" y="-38" width="24" height="38" rx="3" fill="#a56a43"/><rect x="-40" y="-52" width="20" height="20" rx="2" fill="#bfe6ff"/><rect x="22" y="-52" width="20" height="20" rx="2" fill="#bfe6ff"/></g>`);
  }
  building(x, yBase, w, h, c, win = '#ffe9a6', seed = 1) {
    const R = rng(seed); let s = `<rect x="${x}" y="${yBase - h}" width="${w}" height="${h}" fill="${c}"/>`;
    const cols = Math.max(2, Math.floor(w / 26)); const rows = Math.max(2, Math.floor(h / 34));
    const gx = w / cols; const gy = h / rows;
    for (let i = 0; i < cols; i += 1) for (let j = 0; j < rows; j += 1) if (R() > 0.22) s += `<rect x="${n(x + gx * i + gx * 0.25)}" y="${n(yBase - h + gy * j + gy * 0.25)}" width="${n(gx * 0.5)}" height="${n(gy * 0.45)}" rx="2" fill="${win}" opacity="${n(0.55 + R() * 0.45)}"/>`;
    return this.add(s);
  }
  waves(y, c, o = 0.6, amp = 7, len = 80) {
    let d = `M0,${y}`;
    for (let x = 0; x < W; x += len) d += ` q${len / 4},${-amp} ${len / 2},0 t${len / 2},0`;
    return this.add(`<path d="${d}" stroke="${c}" stroke-width="3.5" stroke-linecap="round" fill="none" opacity="${o}"/>`);
  }
  vignette() { return this.add(`<rect width="${W}" height="${H}" fill="${this.r([[0.62, '#000', 0], [1, '#3a2410', 0.16]], 0.5, 0.5, 0.75)}"/>`); }
  svg() { return { defs: this.defs.join(''), body: this.out.join('') }; }
}

const SCENES = {
  meadow(a) {
    a.sky('#8fd3ff', '#d9f2ff', '#fff6dc').sun(650, 110, 44).cloud(140, 110, 1).cloud(470, 70, 0.7, '#fff', 0.85);
    a.hill(330, 30, '#a9dba0', 11).hill(372, 22, '#86c97d', 12).ground(400, '#7cc473', '#5aa862').hill(430, 16, '#6fbb66', 13);
    a.tree(92, 396, 0.9).tree(724, 388, 0.72, '#58a865', '#479257').flowers(16, 14, 440, 580).tufts(26, 15, 420, 590);
  },
  park(a) {
    a.sky('#8fd3ff', '#dff4ff', '#fff6dc').sun(110, 96, 40).cloud(520, 90, 0.9).cloud(270, 150, 0.55, '#fff', 0.8);
    a.hill(340, 22, '#a9dba0', 21).tree(120, 380, 1).tree(690, 372, 0.9, '#58a865', '#479257').tree(560, 352, 0.55, '#6bb873', '#58a865');
    a.ground(380, '#8fd183', '#62b06a');
    a.add('<path d="M330,600 C350,500 390,430 420,380 L470,380 C470,430 500,500 560,600 Z" fill="#f1dcae"/><path d="M330,600 C350,500 390,430 420,380" stroke="#dcc28c" stroke-width="4" fill="none"/>');
    a.add('<g transform="translate(250,388)"><rect x="-44" y="-30" width="88" height="9" rx="4" fill="#b0764a"/><rect x="-44" y="-46" width="88" height="8" rx="4" fill="#c58a5a"/><rect x="-36" y="-22" width="7" height="22" fill="#8a5a3b"/><rect x="29" y="-22" width="7" height="22" fill="#8a5a3b"/></g>');
    a.bush(40, 420, 1.1).bush(770, 430, 1.2).flowers(10, 24, 450, 585).tufts(18, 25, 420, 590);
  },
  garden(a) {
    a.sky('#a5ddff', '#e4f6ff', '#fff3d6').sun(680, 96, 38).cloud(180, 96, 0.85);
    a.hill(330, 20, '#b4e0a8', 31);
    let fence = '';
    for (let x = -10; x < W; x += 44) fence += `<path d="M${x},372 L${x},300 L${x + 13},286 L${x + 26},300 L${x + 26},372 Z" fill="#fff8ea" stroke="#e6d6b8" stroke-width="2"/>`;
    a.add(`${fence}<rect x="0" y="318" width="${W}" height="9" fill="#fff8ea" stroke="#e6d6b8" stroke-width="2"/><rect x="0" y="348" width="${W}" height="9" fill="#fff8ea" stroke="#e6d6b8" stroke-width="2"/>`);
    a.ground(370, '#8fd183', '#5fae68');
    a.add('<path d="M0,470 Q400,430 800,470 L800,600 L0,600 Z" fill="#9a6a45"/><path d="M0,470 Q400,430 800,470" stroke="#7d5334" stroke-width="5" fill="none" opacity=".5"/>');
    const R = rng(33); let rows = '';
    for (let i = 0; i < 9; i += 1) rows += `<ellipse cx="${n(40 + i * 92 + R() * 20)}" cy="${n(500 + R() * 70)}" rx="26" ry="7" fill="#7d5334" opacity=".45"/>`;
    a.add(rows).bush(60, 392, 1).bush(740, 396, 1.1, '#6bb873', '#58a865').flowers(12, 34, 384, 450, ['#ff8fab', '#ffd24a', '#ff9f5a', '#fff']).tufts(12, 35, 380, 450);
  },
  forest(a) {
    a.sky('#bfe8d0', '#e6f6dc', '#fbf6d8');
    a.add(`<circle cx="400" cy="120" r="260" fill="${a.r([[0, '#fffbe0', 0.9], [1, '#fffbe0', 0]])}"/>`);
    for (const [x, s] of [[60, 0.9], [170, 0.75], [300, 0.85], [430, 0.7], [560, 0.85], [690, 0.78], [780, 0.9]]) a.pine(x, 372, s, '#7fbf95', '#6fb088');
    a.hill(370, 12, '#6fb97a', 41);
    for (const [x, s] of [[20, 1.5], [150, 1.25], [650, 1.3], [790, 1.55]]) a.pine(x, 430, s);
    a.ground(410, '#5aa862', '#3f8a52').hill(450, 14, '#4f9d5d', 42);
    a.add('<g opacity=".55" fill="#fffbe0"><path d="M300,0 L380,0 L300,420 L200,420 Z" opacity=".16"/><path d="M480,0 L530,0 L560,420 L490,420 Z" opacity=".14"/></g>');
    a.bush(250, 440, 0.8, '#4a9455', '#3f8a52').bush(560, 446, 0.9, '#4a9455', '#3f8a52');
    a.add('<g transform="translate(120,520)"><ellipse cx="0" cy="-6" rx="13" ry="12" fill="#e2574c"/><circle cx="-5" cy="-9" r="2.6" fill="#fff"/><circle cx="5" cy="-5" r="2" fill="#fff"/><rect x="-4" y="-2" width="8" height="12" rx="3" fill="#fff3dc"/></g>').tufts(22, 43, 440, 590, '#2f7a52');
  },
  sea(a) {
    a.sky('#8fd3ff', '#cdeeff', '#fff3d6').sun(640, 120, 46).cloud(130, 100, 0.95).cloud(420, 150, 0.5, '#fff', 0.8);
    a.add(`<rect y="300" width="${W}" height="300" fill="${a.g([[0, '#4fb7dc'], [0.5, '#2f95c8'], [1, '#1f6fa8']])}"/>`);
    a.add(`<path d="M610,300 L670,300 L720,600 L560,600 Z" fill="${a.g([[0, '#fff', 0.5], [1, '#fff', 0]])}"/>`);
    a.add('<path d="M40,300 q40,-26 96,-12 q30,-22 70,0 Z" fill="#7fbf95" opacity=".85"/>');
    a.waves(330, '#fff', 0.5, 5, 70).waves(380, '#bfeaff', 0.5, 7, 100).waves(440, '#fff', 0.35, 8, 120).waves(510, '#bfeaff', 0.4, 9, 140).waves(570, '#fff', 0.3, 10, 160);
  },
  beach(a) {
    a.sky('#8fd3ff', '#cdeeff', '#fff0cc').sun(120, 100, 44).cloud(500, 90, 0.9).cloud(690, 150, 0.5, '#fff', 0.8);
    a.add(`<rect y="290" width="${W}" height="140" fill="${a.g([[0, '#4fb7dc'], [1, '#7fd3e6']])}"/>`).waves(320, '#fff', 0.5, 5, 80).waves(360, '#fff', 0.4, 6, 110);
    a.add(`<path d="M0,420 Q200,380 400,404 T800,392 L800,600 L0,600 Z" fill="${a.g([[0, '#ffe9b3'], [1, '#f3cf86']])}"/><path d="M0,420 Q200,380 400,404 T800,392" stroke="#fff" stroke-width="10" fill="none" opacity=".8"/>`);
    a.add('<g transform="translate(700,430)"><path d="M0,0 Q-14,-90 8,-170" stroke="#8a5a3b" stroke-width="13" fill="none" stroke-linecap="round"/><g fill="#3f9a5a"><path d="M8,-170 q-70,-30 -110,14 q60,-22 110,-14"/><path d="M8,-170 q70,-34 112,6 q-62,-18 -112,-6"/><path d="M8,-170 q-30,-62 -86,-56 q54,10 86,56"/><path d="M8,-170 q34,-62 88,-50 q-56,8 -88,50"/></g><circle cx="4" cy="-162" r="8" fill="#7a4f33"/><circle cx="16" cy="-158" r="8" fill="#7a4f33"/></g>');
    const R = rng(51); let dots = '';
    for (let i = 0; i < 40; i += 1) dots += `<circle cx="${n(R() * W)}" cy="${n(440 + R() * 150)}" r="${n(1 + R() * 2)}" fill="#d9b06a" opacity=".5"/>`;
    a.add(`${dots}<g transform="translate(110,540)"><path d="M0,0 l8,-18 l8,18 Z M-6,-6 l28,0 l-22,16 l8,-26 l8,26 Z" fill="#ff9f8a"/></g><ellipse cx="560" cy="555" rx="16" ry="11" fill="#fff" stroke="#f1b9c8" stroke-width="3"/>`);
  },
  sky(a) {
    a.sky('#5fb3f0', '#a9dcff', '#eaf8ff').sun(660, 110, 50);
    a.cloud(120, 140, 1.2).cloud(520, 220, 0.9, '#fff', 0.9).cloud(300, 330, 1.4).cloud(660, 420, 1.1, '#fff', 0.92).cloud(60, 470, 1, '#fff', 0.9).cloud(420, 540, 1.6);
    a.add('<g stroke="#fff" stroke-width="3" fill="none" opacity=".7" stroke-linecap="round"><path d="M200,70 q8,-9 16,0 q8,-9 16,0"/><path d="M250,96 q6,-7 12,0 q6,-7 12,0"/></g>');
  },
  night(a) {
    a.sky('#14204a', '#2b3f7a', '#56609c').stars(70, 61, 360).moon(640, 110, 46);
    a.cloud(160, 150, 0.8, '#8f9bd0', 0.5).cloud(480, 230, 0.6, '#8f9bd0', 0.4);
    a.hill(360, 26, '#2f4a6a', 62).add('<g transform="translate(150,392)"><rect x="-50" y="-70" width="100" height="70" fill="#3d4f7c"/><path d="M-62,-68 L0,-118 L62,-68 Z" fill="#2b3a61"/><rect x="-12" y="-38" width="24" height="38" rx="3" fill="#2b3a61"/><rect x="-40" y="-52" width="20" height="20" rx="2" fill="#ffe08a"/><rect x="22" y="-52" width="20" height="20" rx="2" fill="#ffe08a"/></g>');
    a.pine(660, 396, 0.9, '#22405a', '#1c364e').pine(740, 404, 1.1, '#22405a', '#1c364e').ground(396, '#345a6a', '#22405a').hill(440, 14, '#2c5062', 63).tufts(18, 64, 430, 590, '#1c364e');
  },
  // よるの はまべ（night の 場面に 海の ものが ある とき）。
  nightsea(a) {
    a.sky('#14204a', '#2b3f7a', '#56609c').stars(60, 66, 300).moon(640, 100, 44).cloud(160, 140, 0.8, '#8f9bd0', 0.5);
    a.add(`<rect y="290" width="${W}" height="150" fill="${a.g([[0, '#2f5f96'], [1, '#3f7fb0']])}"/>`);
    if (!a.bare) a.add(`<path d="M612,290 L668,290 L700,440 L580,440 Z" fill="${a.g([[0, '#fff6c9', 0.45], [1, '#fff6c9', 0]])}"/>`);
    a.waves(318, '#bcd8f5', 0.45, 5, 80).waves(356, '#bcd8f5', 0.35, 6, 110);
    a.add(`<path d="M0,424 Q200,384 400,408 T800,396 L800,600 L0,600 Z" fill="${a.g([[0, '#8f8aa0'], [1, '#6f6a86']])}"/><path d="M0,424 Q200,384 400,408 T800,396" stroke="#dfe8ff" stroke-width="9" fill="none" opacity=".55"/>`);
    const R = rng(67); let dots = '';
    for (let i = 0; i < 30; i += 1) dots += `<circle cx="${n(R() * W)}" cy="${n(444 + R() * 150)}" r="${n(1 + R() * 2)}" fill="#55506e" opacity=".6"/>`;
    a.add(dots);
  },
  room(a) {
    a.add(`<rect width="${W}" height="${H}" fill="${a.g([[0, '#ffe7c2'], [1, '#ffdcae']])}"/>`);
    let stripes = '';
    for (let x = 20; x < W; x += 80) stripes += `<rect x="${x}" y="0" width="34" height="410" fill="#fff" opacity=".2"/>`;
    a.add(stripes);
    // まど（そとの 空と 丘）
    a.add(`<g transform="translate(560,70)"><rect x="-10" y="-10" width="200" height="170" rx="10" fill="#fff8ea"/><rect width="180" height="150" rx="4" fill="${a.g([[0, '#9bd8ff'], [1, '#e2f6ff']])}"/><path d="M0,150 L0,112 Q50,84 100,108 T180,96 L180,150 Z" fill="#8fd183"/><circle cx="136" cy="40" r="17" fill="#ffd86b"/><rect x="86" y="0" width="8" height="150" fill="#fff8ea"/><rect x="0" y="71" width="180" height="8" fill="#fff8ea"/><path d="M-22,-16 Q-4,70 -26,168 L8,168 Q24,60 8,-16 Z" fill="#ff9f8a"/><path d="M202,-16 Q184,70 206,168 L172,168 Q156,60 172,-16 Z" fill="#ff9f8a"/><rect x="-30" y="-24" width="240" height="12" rx="6" fill="#b0764a"/></g>`);
    // がく
    a.add('<g transform="translate(110,96)"><rect width="112" height="88" rx="6" fill="#b0764a"/><rect x="9" y="9" width="94" height="70" fill="#cfeeff"/><path d="M9,79 L9,58 L38,36 L62,56 L80,44 L103,62 L103,79 Z" fill="#7cc473"/><circle cx="82" cy="27" r="9" fill="#ffd86b"/></g>');
    a.add('<rect y="398" width="800" height="14" fill="#fff8ea"/>');
    a.add(`<rect y="410" width="${W}" height="190" fill="${a.g([[0, '#d9a56f'], [1, '#c08a55']])}"/>`);
    let planks = '';
    for (let y = 446; y < H; y += 40) planks += `<rect y="${y}" width="${W}" height="2.5" fill="#a6723f" opacity=".5"/>`;
    for (const [x, y] of [[120, 410], [520, 410], [300, 446], [700, 446], [60, 486], [440, 486], [220, 526], [620, 526], [380, 566]]) planks += `<rect x="${x}" y="${y}" width="2.5" height="40" fill="#a6723f" opacity=".5"/>`;
    a.add(planks);
    a.add(`<ellipse cx="400" cy="520" rx="270" ry="56" fill="#e2725b"/><ellipse cx="400" cy="520" rx="236" ry="44" fill="#f08a6e"/><ellipse cx="400" cy="520" rx="150" ry="24" fill="#ffd9a8" opacity=".55"/>`);
    // たな と はちうえ
    a.add('<g transform="translate(330,250)"><rect x="-70" y="0" width="140" height="10" rx="3" fill="#b0764a"/><rect x="-56" y="-44" width="14" height="44" fill="#e2574c"/><rect x="-40" y="-52" width="12" height="52" fill="#4f86d9"/><rect x="-26" y="-40" width="16" height="40" fill="#f0b43c"/><rect x="-8" y="-48" width="11" height="48" fill="#5aae78"/><path d="M34,0 L30,-26 L58,-26 L54,0 Z" fill="#d9763a"/><path d="M44,-26 q-18,-30 -4,-44 q4,22 4,44 M44,-26 q20,-26 8,-46 q-8,20 -8,46" fill="#4f9d5d"/></g>');
  },
  kitchen(a) {
    a.add(`<rect width="${W}" height="${H}" fill="${a.g([[0, '#fff4d6'], [1, '#ffe7b8']])}"/>`);
    let tiles = '';
    for (let x = 0; x < W; x += 50) for (let y = 190; y < 330; y += 46) tiles += `<rect x="${x + 3}" y="${y + 3}" width="44" height="40" rx="5" fill="${(x / 50 + (y - 190) / 46) % 2 ? '#d8f0ea' : '#eaf8f4'}"/>`;
    a.add(tiles);
    a.add('<g><rect x="30" y="40" width="250" height="118" rx="8" fill="#f0a35c"/><rect x="42" y="52" width="108" height="94" rx="5" fill="#f7b877"/><rect x="160" y="52" width="108" height="94" rx="5" fill="#f7b877"/><circle cx="140" cy="100" r="5" fill="#b0764a"/><circle cx="170" cy="100" r="5" fill="#b0764a"/></g>');
    a.add(`<g transform="translate(520,44)"><rect x="-8" y="-8" width="216" height="136" rx="8" fill="#fff8ea"/><rect width="200" height="120" fill="${a.g([[0, '#9bd8ff'], [1, '#e2f6ff']])}"/><path d="M0,120 L0,92 Q60,66 110,88 T200,78 L200,120 Z" fill="#8fd183"/><rect x="96" y="0" width="8" height="120" fill="#fff8ea"/></g>`);
    a.add(`<rect y="330" width="${W}" height="24" fill="#f7e2bd"/><rect y="350" width="${W}" height="130" fill="${a.g([[0, '#f0a35c'], [1, '#e08f47']])}"/>`);
    let doors = '';
    for (let x = 14; x < W; x += 132) doors += `<rect x="${x}" y="366" width="118" height="100" rx="6" fill="#f7b877"/><circle cx="${x + 100}" cy="416" r="5" fill="#b0764a"/>`;
    a.add(doors);
    a.add('<g transform="translate(380,330)"><rect x="-60" y="-12" width="120" height="12" rx="4" fill="#555"/><circle cx="-28" cy="-12" r="18" fill="#333" opacity=".35"/><circle cx="28" cy="-12" r="18" fill="#333" opacity=".35"/><path d="M-50,-14 L-46,-50 L-8,-50 L-4,-14 Z" fill="#8fa3b8"/><rect x="-58" y="-56" width="62" height="8" rx="4" fill="#6e8296"/></g>');
    a.add(`<rect y="476" width="${W}" height="124" fill="${a.g([[0, '#ead9c0'], [1, '#d9c3a2']])}"/>`);
    let fl = '';
    for (let x = 0; x < W; x += 100) for (let y = 476; y < H; y += 62) if (((x / 100) + ((y - 476) / 62)) % 2) fl += `<rect x="${x}" y="${y}" width="100" height="62" fill="#fff" opacity=".28"/>`;
    a.add(fl);
  },
  school(a) {
    a.add(`<rect width="${W}" height="${H}" fill="${a.g([[0, '#e9f4e4'], [1, '#d6ecd2']])}"/>`);
    a.add('<g transform="translate(150,70)"><rect x="-12" y="-12" width="524" height="244" rx="10" fill="#b0764a"/><rect width="500" height="220" rx="4" fill="#2f6a52"/><rect width="500" height="220" rx="4" fill="#fff" opacity=".04"/><g stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".85"><path d="M40,60 l22,-34 l22,34 M48,48 l28,0"/><path d="M110,26 l0,34 q22,4 22,-9 q0,-10 -22,-8 q18,0 18,-9 q0,-10 -18,-8"/><path d="M186,34 q-26,-14 -26,10 q0,22 26,10"/></g><path d="M300,60 q40,-30 80,0 t80,0" stroke="#ffe08a" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/><circle cx="400" cy="150" r="26" stroke="#ff9f8a" stroke-width="5" fill="none" opacity=".8"/><rect x="0" y="220" width="500" height="14" fill="#c58a5a"/><rect x="40" y="212" width="34" height="8" rx="3" fill="#fff"/><rect x="90" y="212" width="26" height="8" rx="3" fill="#ffd24a"/></g>');
    a.add('<g transform="translate(60,90)"><circle r="34" fill="#fff" stroke="#4f86d9" stroke-width="7"/><path d="M0,0 L0,-20 M0,0 L14,8" stroke="#333" stroke-width="5" stroke-linecap="round"/></g>');
    a.add(`<rect y="396" width="${W}" height="12" fill="#fff8ea"/><rect y="406" width="${W}" height="194" fill="${a.g([[0, '#e2b77f'], [1, '#c99a60']])}"/>`);
    let planks = '';
    for (let y = 440; y < H; y += 38) planks += `<rect y="${y}" width="${W}" height="2.5" fill="#a6723f" opacity=".45"/>`;
    a.add(planks);
    for (const x of [130, 670]) a.add(`<g transform="translate(${x},520)"><rect x="-70" y="-64" width="140" height="14" rx="5" fill="#d9a56f"/><rect x="-62" y="-50" width="8" height="52" fill="#8a8f98"/><rect x="54" y="-50" width="8" height="52" fill="#8a8f98"/><rect x="-66" y="-52" width="132" height="22" fill="#c08a55" opacity=".6"/></g>`);
  },
  shop(a) {
    a.add(`<rect width="${W}" height="${H}" fill="${a.g([[0, '#fff1d6'], [1, '#ffe2b4']])}"/>`);
    let aw = '';
    for (let x = 0; x < W; x += 80) aw += `<path d="M${x},0 L${x + 80},0 L${x + 80},64 Q${x + 40},92 ${x},64 Z" fill="${(x / 80) % 2 ? '#fff8ea' : '#e2574c'}"/>`;
    a.add(aw);
    const colors = ['#e2574c', '#f0b43c', '#5aae78', '#4f86d9', '#b06fc4', '#ff9f5a'];
    const R = rng(71); let shelves = '';
    for (const y of [190, 280, 370]) {
      shelves += `<rect x="40" y="${y}" width="720" height="12" rx="4" fill="#b0764a"/><rect x="40" y="${y + 12}" width="720" height="5" fill="#8a5a3b" opacity=".4"/>`;
      for (let x = 60; x < 740; x += 46) {
        const c = colors[Math.floor(R() * colors.length)]; const k = R();
        shelves += k < 0.34 ? `<rect x="${x}" y="${y - 44}" width="30" height="44" rx="5" fill="${c}"/><rect x="${x + 5}" y="${y - 34}" width="20" height="14" rx="2" fill="#fff" opacity=".7"/>`
          : k < 0.67 ? `<path d="M${x + 4},${y} L${x + 4},${y - 34} Q${x + 15},${y - 52} ${x + 26},${y - 34} L${x + 26},${y} Z" fill="${c}"/><rect x="${x + 9}" y="${y - 56}" width="12" height="9" rx="2" fill="#8a5a3b"/>`
            : `<circle cx="${x + 15}" cy="${y - 17}" r="17" fill="${c}"/><circle cx="${x + 9}" cy="${y - 23}" r="5" fill="#fff" opacity=".35"/>`;
      }
    }
    a.add(shelves);
    a.add(`<rect y="424" width="${W}" height="176" fill="${a.g([[0, '#ead9c0'], [1, '#d6bf9c']])}"/>`);
    let fl = '';
    for (let x = 0; x < W; x += 100) for (let y = 424; y < H; y += 60) if (((x / 100) + ((y - 424) / 60)) % 2) fl += `<rect x="${x}" y="${y}" width="100" height="60" fill="#fff" opacity=".3"/>`;
    a.add(fl);
  },
  city(a) {
    a.sky('#9ad4ff', '#d6efff', '#ffeeda').sun(110, 90, 36).cloud(420, 80, 0.8).cloud(660, 140, 0.5, '#fff', 0.8);
    const far = [[0, 90, 190], [80, 70, 250], [160, 110, 170], [290, 80, 280], [380, 100, 210], [500, 70, 260], [580, 120, 180], [710, 90, 240]];
    for (const [x, w, h] of far) a.add(`<rect x="${x}" y="${392 - h}" width="${w}" height="${h}" fill="#b9cfe6"/>`);
    const near = [[-20, 150, 200, '#f4a98a'], [140, 120, 150, '#8ec5e8'], [270, 150, 230, '#f7d08a'], [430, 110, 170, '#b7a3e0'], [550, 140, 210, '#8fd3b0'], [700, 130, 160, '#f4a98a']];
    near.forEach(([x, w, h, c], i) => a.building(x, 400, w, h, c, '#fff8d8', 80 + i));
    a.add('<path d="M270,170 l75,-34 l75,34 Z" fill="#e0b060"/><rect x="560" y="176" width="120" height="14" fill="#6fb893"/>');
    a.add(`<rect y="396" width="${W}" height="40" fill="#d8d2c8"/><rect y="432" width="${W}" height="168" fill="${a.g([[0, '#77808c'], [1, '#5c6470']])}"/><rect y="432" width="${W}" height="6" fill="#b9b2a6"/>`);
    let lane = '';
    for (let x = 20; x < W; x += 130) lane += `<rect x="${x}" y="508" width="76" height="10" rx="5" fill="#fff" opacity=".8"/>`;
    a.add(lane);
    a.add('<g transform="translate(96,396)"><rect x="-4" y="-150" width="8" height="150" fill="#5c6470"/><path d="M0,-150 q0,-22 30,-22" stroke="#5c6470" stroke-width="8" fill="none"/><ellipse cx="38" cy="-170" rx="14" ry="8" fill="#ffe9a6"/></g>');
    a.tree(736, 400, 0.6, '#6bb873', '#58a865');
  },
  snow(a) {
    a.sky('#bfdcf5', '#e4f1fb', '#ffffff');
    a.peaks(360, 190, '#a9c4e0', 91, { count: 4, snow: '#fff' }).hill(360, 22, '#e3eef9', 92);
    for (const [x, s] of [[80, 0.9], [200, 0.7], [640, 0.8], [750, 1]]) { a.pine(x, 400, s, '#3f8a6a', '#347a5c'); a.add(`<g transform="translate(${x},400) scale(${s})" fill="#fff"><path d="M0,-150 L20,-116 L-20,-116 Z"/><path d="M-30,-84 q30,-16 60,0 Z"/><path d="M-40,-48 q40,-18 80,0 Z"/></g>`); }
    a.ground(396, '#ffffff', '#dbe9f6').hill(440, 16, '#f2f8fd', 93);
    a.add('<g transform="translate(560,470)" opacity=".5" fill="#c9dcee"><ellipse cx="0" cy="0" rx="60" ry="10"/><ellipse cx="-360" cy="60" rx="90" ry="12"/></g>');
    const R = rng(94); let fl = '';
    for (let i = 0; i < 60; i += 1) fl += `<circle cx="${n(R() * W)}" cy="${n(R() * H)}" r="${n(1.6 + R() * 3)}" fill="#fff" opacity="${n(0.6 + R() * 0.4)}"/>`;
    a.add(fl);
  },
  farm(a) {
    a.sky('#8fd3ff', '#dff4ff', '#fff3d0').sun(660, 100, 42).cloud(160, 96, 0.9).cloud(420, 150, 0.5, '#fff', 0.8);
    a.hill(330, 24, '#b9dc8c', 101).hill(366, 16, '#a4cf78', 102);
    a.add('<g transform="translate(150,392)"><rect x="-80" y="-104" width="160" height="104" fill="#d9534a"/><path d="M-92,-100 L-56,-150 L56,-150 L92,-100 Z" fill="#8a3a34"/><rect x="-28" y="-64" width="56" height="64" fill="#fff8ea"/><path d="M-28,-64 L28,0 M28,-64 L-28,0" stroke="#d9534a" stroke-width="6"/><rect x="-18" y="-130" width="36" height="24" rx="3" fill="#fff8ea"/></g>');
    a.add('<g transform="translate(286,392)"><rect x="-24" y="-130" width="48" height="130" fill="#e8e2d6"/><path d="M-26,-130 q26,-34 52,0 Z" fill="#b9b2a6"/></g>');
    a.ground(390, '#9cd177', '#6fb35c');
    let rows = '';
    for (let i = 0; i < 7; i += 1) rows += `<path d="M${400 + i * 20},420 Q${430 + i * 60},500 ${420 + i * 110},600" stroke="#5a9e4c" stroke-width="${6 + i}" fill="none" opacity=".5"/>`;
    a.add(rows);
    let fence = '';
    for (let x = 0; x < W; x += 70) fence += `<rect x="${x + 8}" y="398" width="9" height="40" rx="3" fill="#c58a5a"/>`;
    a.add(`${fence}<rect y="406" width="${W}" height="7" fill="#c58a5a"/><rect y="424" width="${W}" height="7" fill="#c58a5a"/>`).tufts(20, 103, 450, 590).flowers(6, 104, 460, 580, ['#ffd24a', '#fff']);
  },
  mountain(a) {
    a.sky('#9ad4ff', '#dff1ff', '#fff3dc').sun(130, 110, 40).cloud(540, 100, 0.9).cloud(320, 60, 0.5, '#fff', 0.8);
    a.peaks(380, 260, '#9fb6d4', 111, { count: 3, snow: '#fff' }).peaks(400, 170, '#7f9cc0', 112, { count: 4, snow: '#f4f9ff' });
    a.hill(380, 18, '#7fbf8a', 113);
    for (const [x, s] of [[60, 0.7], [140, 0.55], [690, 0.65], [760, 0.8]]) a.pine(x, 404, s);
    a.ground(400, '#7cc473', '#5aa862');
    a.add('<path d="M360,600 C380,520 440,470 400,404 L430,404 C500,470 470,520 520,600 Z" fill="#e6d2a4"/>');
    a.add('<g fill="#9aa3ad"><ellipse cx="220" cy="470" rx="34" ry="20"/><ellipse cx="250" cy="480" rx="20" ry="12" fill="#b3bbc4"/><ellipse cx="640" cy="520" rx="44" ry="24"/></g>').tufts(18, 114, 430, 590).flowers(6, 115, 450, 580);
  },
  river(a) {
    a.sky('#9ad4ff', '#dff4ff', '#fff6dc').sun(650, 96, 40).cloud(180, 100, 0.9);
    a.hill(330, 26, '#a9dba0', 121).tree(90, 384, 0.85).tree(720, 380, 0.75, '#58a865', '#479257').tree(600, 360, 0.5, '#6bb873', '#58a865');
    a.ground(380, '#86c97d', '#5aa862');
    a.add(`<path d="M430,380 C380,430 560,470 470,520 C420,548 300,560 240,600 L640,600 C660,560 720,540 700,500 C680,450 520,440 500,380 Z" fill="${a.g([[0, '#7fd3e6'], [1, '#3fa3d0']])}"/>`);
    a.add('<g stroke="#fff" stroke-width="3.5" stroke-linecap="round" fill="none" opacity=".6"><path d="M470,410 q14,-6 28,0"/><path d="M520,470 q16,-7 32,0"/><path d="M430,540 q18,-7 36,0"/><path d="M560,560 q18,-7 36,0"/><path d="M360,580 q16,-6 32,0"/></g>');
    a.add('<g fill="#9aa3ad"><ellipse cx="420" cy="500" rx="24" ry="13"/><ellipse cx="690" cy="556" rx="30" ry="15"/><ellipse cx="300" cy="566" rx="20" ry="11" fill="#b3bbc4"/></g>').bush(60, 430, 1).tufts(16, 122, 420, 590).flowers(7, 123, 430, 560);
  },
  desert(a) {
    a.sky('#ffc97a', '#ffe2a8', '#fff1cf').sun(620, 130, 56, '#fff0a8');
    a.peaks(360, 120, '#e0a070', 131, { count: 3 }).hill(370, 30, '#f0c078', 132).ground(400, '#f6d08a', '#e6b060').hill(450, 26, '#f1c478', 133).hill(520, 22, '#ecb866', 134);
    for (const [x, y, s] of [[110, 440, 1], [700, 470, 1.25]]) a.add(`<g transform="translate(${x},${y}) scale(${s})"><ellipse cx="0" cy="2" rx="30" ry="6" fill="#000" opacity=".12"/><rect x="-11" y="-96" width="22" height="98" rx="11" fill="#4f9d5d"/><path d="M-11,-44 h-16 q-12,0 -12,-12 v-18" stroke="#4f9d5d" stroke-width="15" fill="none" stroke-linecap="round"/><path d="M11,-56 h14 q12,0 12,-12 v-12" stroke="#4f9d5d" stroke-width="15" fill="none" stroke-linecap="round"/><path d="M0,-90 v84" stroke="#3f8a52" stroke-width="2.5" opacity=".6"/></g>`);
    a.add('<g stroke="#d99f52" stroke-width="3" fill="none" opacity=".55" stroke-linecap="round"><path d="M200,520 q40,-12 80,0 t80,0"/><path d="M460,560 q40,-12 80,0 t80,0"/></g>');
  },
  space(a) {
    a.add(`<rect width="${W}" height="${H}" fill="${a.g([[0, '#0b1030'], [0.6, '#1a1850'], [1, '#3a2068']])}"/>`);
    a.add(`<ellipse cx="240" cy="200" rx="330" ry="120" fill="${a.r([[0, '#7a5cc8', 0.4], [1, '#7a5cc8', 0]])}" transform="rotate(-18 240 200)"/><ellipse cx="620" cy="360" rx="280" ry="100" fill="${a.r([[0, '#3baacb', 0.3], [1, '#3baacb', 0]])}" transform="rotate(14 620 360)"/>`);
    a.stars(120, 141, 600);
    a.add(`<g transform="translate(650,120)"><ellipse cx="0" cy="0" rx="92" ry="20" fill="none" stroke="#ffd9a0" stroke-width="7" transform="rotate(-18)" opacity=".85"/><circle r="50" fill="${a.g([[0, '#ffb86b'], [1, '#e2725b']])}"/><path d="M-46,-16 q46,14 92,-4 M-48,10 q48,14 94,-6" stroke="#fff" stroke-width="5" fill="none" opacity=".25"/><path d="M-90,28 a92,20 -18 0 0 180,-58" fill="none" stroke="#ffd9a0" stroke-width="7" opacity=".0"/></g>`);
    a.add(`<circle cx="110" cy="100" r="26" fill="${a.g([[0, '#8fd3ff'], [1, '#4f86d9']])}"/><path d="M92,92 q10,-10 22,-4 q-4,12 -22,4 M108,112 q12,-6 20,2 q-12,8 -20,-2" fill="#7cc473"/>`);
    a.add(`<path d="M0,600 L0,480 Q200,430 400,470 T800,450 L800,600 Z" fill="${a.g([[0, '#9aa0c8'], [1, '#6a70a0']])}"/><g fill="#5c628e" opacity=".7"><ellipse cx="160" cy="520" rx="44" ry="13"/><ellipse cx="460" cy="548" rx="60" ry="15"/><ellipse cx="690" cy="506" rx="34" ry="10"/><ellipse cx="300" cy="580" rx="26" ry="8"/></g>`);
  },
  cave(a) {
    a.add(`<rect width="${W}" height="${H}" fill="${a.g([[0, '#3a2f4a'], [1, '#55445f']])}"/>`);
    a.add(`<ellipse cx="400" cy="300" rx="360" ry="250" fill="${a.r([[0, '#ffd9a0', 0.6], [0.6, '#b98a8a', 0.25], [1, '#55445f', 0]])}"/>`);
    a.add('<path d="M0,0 L800,0 L800,90 L740,150 L700,80 L650,190 L590,90 L540,130 L480,70 L420,170 L360,80 L300,140 L240,70 L180,200 L120,90 L60,150 L0,80 Z" fill="#2b2238"/>');
    a.add('<path d="M0,0 L70,0 Q110,200 60,420 L0,440 Z M800,0 L730,0 Q690,200 740,420 L800,440 Z" fill="#2b2238"/>');
    a.add(`<path d="M0,420 Q200,390 400,410 T800,400 L800,600 L0,600 Z" fill="${a.g([[0, '#7a6680'], [1, '#55445f']])}"/>`);
    a.add('<g fill="#2b2238"><path d="M150,430 l22,-90 l22,90 Z"/><path d="M620,440 l26,-120 l26,120 Z"/><path d="M700,450 l16,-60 l16,60 Z"/></g>');
    a.add('<g><path d="M250,480 l14,-36 l14,36 Z" fill="#8fe3ff"/><path d="M270,484 l10,-24 l10,24 Z" fill="#c79bff"/><path d="M540,520 l16,-40 l16,40 Z" fill="#c79bff"/><path d="M522,524 l10,-22 l10,22 Z" fill="#8fe3ff"/></g><g fill="#fff" opacity=".8"><circle cx="264" cy="440" r="2.5"/><circle cx="556" cy="476" r="2.5"/><circle cx="330" cy="330" r="2"/><circle cx="470" cy="290" r="2"/></g>');
  },
};

const cache = new Map();
// 背景 1 まい：{ defs, body }。知らない 名前は のはら。
export function background(name, { bare = false } = {}) {
  const scene = SCENES[name] ? name : 'meadow'; const key = `${scene}|${bare ? 1 : 0}`;
  if (!cache.has(key)) { const a = new Art(bare); SCENES[scene](a); a.vignette(); cache.set(key, a.svg()); }
  return cache.get(key);
}
export const BACKGROUND_NAMES = Object.keys(SCENES).filter((k) => k !== 'nightsea');
// 空の 背景（うかぶ ものは 影を つけない）と、暗い 背景。
export const AIRY = new Set(['sky', 'space']);
export const DARK = new Set(['night', 'nightsea', 'space', 'cave']);
// 地面が はじまる 高さ（%）。足は これより 下に おく。
export const HORIZON = { nightsea: 68, sky: 100, space: 80, sea: 50, beach: 66, room: 68, kitchen: 79, school: 68, shop: 71, city: 68, cave: 68 };
