// 読みこみ画面（#loading）の 部品を 並べる。three.js より 先に 動く ふつうの script（module ではない）。
// 島の 箱・ワープの 星・トンネルの 輪・英字の 立方体を 作り、指や マウスで 画面を 傾ける。
// game.js の 準備が おわると #loading ごと 消えるので、ここは 後かたづけ（リスナーを 外す）だけ 持つ。
(function () {
  var root = document.getElementById('loading');
  if (!root) return;
  // 重い 端末では 軽い 版（ld-lite）。
  try { if ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3 || matchMedia('(prefers-reduced-motion: reduce)').matches) root.classList.add('ld-lite'); } catch (e) { /* そのまま */ }
  var $ = function (sel) { return root.querySelector(sel); };
  var html = function (el, parts) { if (el) el.insertAdjacentHTML('beforeend', parts.join('')); };

  // 島：草と すなはまの 5×5、土の 2 だん、木・家・光る ランプ・下に たれる 結晶。
  var cubes = [];
  function cube(x, y, z, t, f, r, k) {
    cubes.push('<div class="ld-c' + (k ? ' ' + k : '') + '" style="--x:' + x + ';--y:' + y + ';--z:' + z + ';--t:' + t + ';--f:' + f + ';--r:' + r + '">' +
      '<i class="t"></i><i class="f"></i><i class="r"></i><i class="l"></i></div>');
  }
  var G = ['#7cf08a', '#5ee07a', '#9bff9e'], S = '#7a5a3a', R = '#5e4430';
  for (var x = -2; x <= 2; x++) for (var z = -2; z <= 2; z++) {
    if (Math.abs(x) === 2 && Math.abs(z) === 2) continue;
    var edge = Math.abs(x) === 2 || Math.abs(z) === 2;
    cube(x, 0, z, edge ? '#ffe7a8' : G[(x * 7 + z * 3 + 9) % 3], edge ? '#e2c27a' : '#4fae55', edge ? '#c9a862' : '#3e8e45');
    if (Math.abs(x) + Math.abs(z) < 4) cube(x, -1, z, S, S, R);
  }
  cube(0, -2, 0, S, S, R); cube(0, -2, 1, S, S, R); cube(1, -2, 0, S, S, R); cube(-1, -2, 0, S, S, R);
  cube(0, -3, 0, '#a8fff0', '#a8fff0', '#a8fff0', 'crystal');
  var trunk = ['#9b6b3f', '#8a5d35', '#6f4a2a'], leaf = ['#4fe08a', '#38c070', '#2a9a58'];
  cube(-1, 1, -1, trunk[0], trunk[1], trunk[2]); cube(-1, 2, -1, trunk[0], trunk[1], trunk[2]);
  [[-1, 3, -1], [-2, 3, -1], [0, 3, -1], [-1, 3, 0], [-1, 3, -2], [-1, 4, -1]].forEach(function (p) { cube(p[0], p[1], p[2], leaf[0], leaf[1], leaf[2]); });
  var wall = ['#fff4dc', '#f3e3c0', '#dcc79e'], roof = ['#ff8a3d', '#e26a22', '#b8521a'];
  cube(1, 1, 0, wall[0], wall[1], wall[2]); cube(1, 1, 1, wall[0], wall[1], wall[2]);
  cube(1, 2, 0, roof[0], roof[1], roof[2]); cube(1, 2, 1, roof[0], roof[1], roof[2]);
  cube(0, 1, 1, '#ffe27a', '#ffd246', '#f2b830', 'glow');
  cube(1, 1, -1, '#7affef', '#4fe0d0', '#2fc0b0', 'glow');
  html($('#ld-world'), cubes);

  // ワープの 星（色は 3 つ）。
  var stars = [], COL = ['#ffffff', '#8affef', '#ff9be8', '#b9a4ff'];
  for (var i = 0; i < 28; i++) {
    var a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 520;
    stars.push('<i style="--x:' + (Math.cos(a) * d).toFixed(0) + 'px;--y:' + (Math.sin(a) * d).toFixed(0) + 'px;--c:' + COL[i % 4] +
      ';--d:' + (1.6 + Math.random() * 2.4).toFixed(2) + 's;--w:' + (-Math.random() * 4).toFixed(2) + 's"></i>');
  }
  html($('.ld-warp'), stars);

  // 奥へ つづく 輪。
  var rings = [];
  for (var k = 0; k < 5; k++) rings.push('<div class="ld-ring" style="--i:' + k + '"></div>');
  html($('#ld-tunnel'), rings);

  // 島を まわる 英字（HELLO と WORLD）。
  function letters(word, el, r, h, c1, c2) {
    var out = [];
    for (var j = 0; j < word.length; j++) {
      var face = '<b>' + word[j] + '</b>';
      // 横の 4 面だけ（上下は ほとんど 見えない）。
      out.push('<div class="ld-letter" style="--a:' + (j * 360 / word.length) + 'deg;--r:' + r + ';--h:' + h + ';--c1:' + c1 + ';--c2:' + c2 + '"><span>' +
        face + face + face + face + '</span></div>');
    }
    html(el, out);
  }
  letters('HELLO', $('.ld-orbit.o1'), 5.2, -1.6, '#ff4fd8', '#8a5bff');
  // WORLD の 輪は やめた（重い）。

  // 傾き：マウス・指で 画面ぜんたいを すこし 回す。
  function tilt(cx, cy) {
    var w = innerWidth || 1, h = innerHeight || 1;
    root.style.setProperty('--tx', ((cx / w - 0.5) * 28).toFixed(1) + 'deg');
    root.style.setProperty('--ty', ((0.5 - cy / h) * 18).toFixed(1) + 'deg');
  }
  function onMove(e) { var p = e.touches ? e.touches[0] : e; if (p) { root.dataset.touched = '1'; tilt(p.clientX, p.clientY); } }
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('touchmove', onMove, { passive: true });
  // 何も さわらない 間も ゆっくり 首を ふる。
  var t0 = Date.now(), idle = setInterval(function () {
    if (!root.isConnected) { clearInterval(idle); removeEventListener('pointermove', onMove); removeEventListener('touchmove', onMove); return; }
    if (Date.now() - t0 > 400 && !root.dataset.touched) {
      var s = (Date.now() - t0) / 1000;
      root.style.setProperty('--tx', (Math.sin(s * 0.6) * 12).toFixed(1) + 'deg');
      root.style.setProperty('--ty', (Math.sin(s * 0.45) * 5).toFixed(1) + 'deg');
    }
  }, 250);
})();
