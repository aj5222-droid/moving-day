/*
 * why.js: the "Why it works" mode. Three interactive steps that turn the game into a proof.
 *
 *   1  the moves cost 1 + 2 + 4 + ... so together they stay under 2n
 *   2  a flat fee per add keeps a jar of savings; does it ever go negative?
 *   3  what real languages pick, measured in this game's simplified model
 */
(function () {
  'use strict';
  var MD = window.MD;
  function $(id) { return document.getElementById(id); }
  function money2(v) { return '$' + v.toFixed(2); }

  var INK = '#1B2631', MUTED = '#5A6672', GRID = 'rgba(27,38,49,0.12)', ORANGE = '#E4501A', RED = '#C8321C', OK = '#1E9E6A';
  var MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
  var SANS = '"Bricolage Grotesque", "Avenir Next", "Segoe UI", system-ui, sans-serif';

  var OPTS = [
    { id: 'plus10', tag: '+10', color: '#E9A215', next: MD.STRATS.plus10.next },
    { id: 'x1125', tag: '×1.125', color: '#7D6B9E', next: MD.growBy(1.125) },
    { id: 'x15', tag: '×1.5', color: '#1B9AAA', next: MD.growBy(1.5) },
    { id: 'double', tag: '×2', color: '#1E9E6A', next: MD.growBy(2) },
    { id: 'triple', tag: '×3', color: '#6C5BD4', next: MD.growBy(3) }
  ];
  function opt(id) { return OPTS.filter(function (o) { return o.id === id; })[0]; }

  var step = 1;
  var W2 = { opt: 'double', fee: 3, N: 200 };

  /* ------------------------------------------------------------ step 1 */
  function draw1() {
    var n = +$('w1range').value;
    $('w1n').textContent = n;
    var ev = MD.timeline(MD.growBy(2), n).events;
    var moves = [], sum = 0;
    ev.forEach(function (e) { if (e.moved) { moves.push({ at: e.size, c: e.copies }); sum += e.copies; } });
    var S = MD.charts.setup($('w1')), ctx = S.ctx, w = S.w, h = S.h;
    var padL = 14, padR = 14;
    var topH = Math.round(h * 0.52);

    // top: bar for each move
    var maxC = Math.max.apply(null, moves.map(function (m) { return m.c; }).concat([1]));
    var plotW = w - padL - padR;
    ctx.font = '11px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.strokeStyle = GRID; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, topH + 0.5); ctx.lineTo(w - padR, topH + 0.5); ctx.stroke();
    var bw = Math.max(3, Math.min(34, plotW / n));
    moves.forEach(function (m, i) {
      var x = padL + ((m.at - 0.5) / n) * plotW;
      var bh = Math.max(3, (m.c / maxC) * (topH - 26));
      ctx.fillStyle = i % 2 ? '#1E9E6A' : '#2BB57D';
      ctx.fillRect(x - bw / 2, topH - bh, bw, bh);
      ctx.fillStyle = INK; ctx.fillText(String(m.c), x, topH - bh - 3);
    });
    ctx.fillStyle = MUTED; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('cost of each move, at the add that triggered it', padL, 2);
    ctx.textAlign = 'left'; ctx.fillText('1', padL, topH + 5);
    ctx.textAlign = 'right'; ctx.fillText('add ' + n, w - padR, topH + 5);

    // bottom: one bar that must fit under 3n
    var y0 = topH + 40, bh2 = 34;
    var unit = plotW / (3 * n);
    ctx.fillStyle = MUTED; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = '11px ' + MONO;
    ctx.fillText('the whole bill, laid end to end', padL, y0 - 18);
    ctx.fillStyle = '#B9C4CE';
    ctx.fillRect(padL, y0, n * unit, bh2);
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 12px ' + MONO;
    if (n * unit > 70) ctx.fillText('n placements', padL + (n * unit) / 2, y0 + bh2 / 2);
    var x = padL + n * unit;
    moves.forEach(function (m, i) {
      var segW = m.c * unit;
      ctx.fillStyle = i % 2 ? '#1E9E6A' : '#2BB57D';
      ctx.fillRect(x, y0, Math.max(segW - 1, 1), bh2);
      if (segW > 22) { ctx.fillStyle = '#fff'; ctx.font = '600 11px ' + MONO; ctx.fillText(String(m.c), x + segW / 2, y0 + bh2 / 2); }
      x += segW;
    });
    // 3n marker
    var xe = padL + 3 * n * unit;
    ctx.setLineDash([5, 4]); ctx.strokeStyle = ORANGE; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(xe - 0.5, y0 - 10); ctx.lineTo(xe - 0.5, y0 + bh2 + 10); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = ORANGE; ctx.font = '600 12px ' + MONO; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('3n = ' + 3 * n, xe - 6, y0 + bh2 + 10);
    // n marker
    ctx.strokeStyle = MUTED; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL + n * unit + 0.5, y0 + bh2); ctx.lineTo(padL + n * unit + 0.5, y0 + bh2 + 8); ctx.stroke();
    ctx.fillStyle = MUTED; ctx.font = '11px ' + MONO; ctx.textAlign = 'center';
    ctx.fillText('n', padL + n * unit, y0 + bh2 + 10);

    var total = n + sum;
    $('w1read').innerHTML = 'Placing ' + n + ' boxes costs <b>' + n + '</b>. The moves copied <b>' + sum + '</b> boxes in total, which is under 2n = ' + 2 * n + '. Bill: <b>' + total + '</b> = ' + money2(total / n) + ' per add, under the $3 line.';
  }

  /* ------------------------------------------------------------ step 2 */
  function series(o, N) {
    var ev = MD.timeline(o.next, N).events;
    return ev.map(function (e) { return e.total; });
  }
  function needFee(totals, N) {
    var m = 0;
    for (var k = 1; k <= N; k++) m = Math.max(m, totals[k - 1] / k);
    return m;
  }

  function buildChips() {
    var el = $('w2chips'); el.innerHTML = '';
    OPTS.forEach(function (o) {
      var b = document.createElement('button');
      b.className = 'chip'; b.dataset.id = o.id; b.style.setProperty('--c', o.color);
      b.innerHTML = '<i></i>' + o.tag;
      b.addEventListener('click', function () { W2.opt = o.id; draw2(); });
      el.appendChild(b);
    });
  }

  function draw2() {
    var o = opt(W2.opt), N = W2.N, fee = W2.fee;
    Array.prototype.forEach.call($('w2chips').children, function (b) { b.setAttribute('aria-pressed', b.dataset.id === W2.opt); });
    $('w2feeV').textContent = money2(fee);
    $('w2nV').textContent = N;
    var tot = series(o, 400);
    var bal = [], broke = -1, minB = 0, maxB = 0;
    for (var k = 1; k <= N; k++) {
      var b = fee * k - tot[k - 1];
      bal.push(b);
      if (b < -1e-9 && broke < 0) broke = k;
      minB = Math.min(minB, b); maxB = Math.max(maxB, b);
    }
    var S = MD.charts.setup($('w2')), ctx = S.ctx, w = S.w, h = S.h;
    var x0 = 58, x1 = w - 14, y1 = 26, y0 = h - 24;
    var lo = Math.min(minB * 1.1, -2), hi = Math.max(maxB * 1.1, 6, -lo * 0.15);
    function X(k) { return x0 + ((k - 0.5) / N) * (x1 - x0); }
    function Y(v) { return y1 + (hi - v) / (hi - lo) * (y0 - y1); }
    ctx.font = '10.5px ' + MONO; ctx.fillStyle = MUTED; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [lo, 0, hi].forEach(function (v, ti) {
      if (ti === 2 && (hi - 0) / (hi - lo) < 0.1) return;
      if (ti === 0 && (0 - lo) / (hi - lo) < 0.1) return;
      var y = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = v === 0 ? INK : GRID; ctx.lineWidth = v === 0 ? 1.4 : 1;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.fillText((v < 0 ? '-$' : '$') + Math.abs(Math.round(v)), x0 - 6, y);
    });
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('1', x0, y0 + 6);
    ctx.textAlign = 'right'; ctx.fillText('add ' + N, x1, y0 + 6);
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = MUTED; ctx.fillText('money in the jar', x0, y1 - 6);
    // fill + line, split by sign
    var zy = Y(0);
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y1, x1 - x0, zy - y1); ctx.clip();
    ctx.fillStyle = 'rgba(30,158,106,0.18)'; fillArea(ctx, bal, X, Y, zy);
    ctx.strokeStyle = o.color; ctx.lineWidth = 2.2; strokeLine(ctx, bal, X, Y);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, zy, x1 - x0, y0 - zy + 6); ctx.clip();
    ctx.fillStyle = 'rgba(200,50,28,0.22)'; fillArea(ctx, bal, X, Y, zy);
    ctx.strokeStyle = RED; ctx.lineWidth = 2.2; strokeLine(ctx, bal, X, Y);
    ctx.restore();
    if (broke > 0) {
      ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(X(broke), Y(bal[broke - 1]), 4.5, 0, 6.2832); ctx.fill();
      ctx.font = '600 12px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.textBaseline = 'top'; ctx.fillText('broke at add ' + broke, Math.min(X(broke) + 8, x1 - 130), Y(bal[broke - 1]) + 8);
    }

    var need = needFee(tot, N);
    var needRound = Math.ceil(need * 100) / 100;
    var a = needFee(tot, 100), b2 = needFee(tot, 200), c = needFee(tot, 400);
    var verdict = broke > 0
      ? '<b class="bad">The jar runs dry at add ' + broke + '.</b> A flat fee of ' + money2(fee) + ' is too low.'
      : '<b class="good">The jar never goes below $0.</b> A flat fee of ' + money2(fee) + ' covers all ' + N + ' adds.';
    $('w2read').innerHTML = verdict + ' The smallest flat fee that works for ' + N + ' adds is ' + money2(needRound) + '. Needed at 100, 200 and 400 adds: ' + money2(a) + ', ' + money2(b2) + ', ' + money2(c) + '.';
    var grows = c / a > 1.4;
    $('w2note').textContent = grows
      ? 'The fee you need keeps climbing as the number of adds grows. No flat fee works for every n, so each add costs O(n) on average. Growing by a fixed number of rooms is not amortized O(1).'
      : 'The fee you need levels off near ' + money2(c) + '. A constant fee that covers any number of adds is exactly amortized O(1). Try the other factors: a bigger factor needs a smaller fee but leaves more rooms empty.';
  }
  function strokeLine(ctx, bal, X, Y) {
    ctx.lineJoin = 'round'; ctx.beginPath();
    bal.forEach(function (v, i) { if (i === 0) ctx.moveTo(X(i + 1), Y(v)); else ctx.lineTo(X(i + 1), Y(v)); });
    ctx.stroke();
  }
  function fillArea(ctx, bal, X, Y, zy) {
    ctx.beginPath(); ctx.moveTo(X(1), zy);
    bal.forEach(function (v, i) { ctx.lineTo(X(i + 1), Y(v)); });
    ctx.lineTo(X(bal.length), zy); ctx.closePath(); ctx.fill();
  }

  /* ------------------------------------------------------------ step 3 */
  var LANGS = [
    { name: 'Rust Vec, C++ std::vector (GCC, Clang)', f: 2, label: '×2', id: 'double' },
    { name: 'Java ArrayList, C++ std::vector (MSVC), JavaScript (V8)', f: 1.5, label: '×1.5', id: 'x15' },
    { name: 'Python list (about)', f: 1.125, label: '×1.125', id: 'x1125' }
  ];
  function buildLang() {
    var body = $('langTable').querySelector('tbody');
    body.innerHTML = '';
    LANGS.forEach(function (L) {
      var m = MD.longRun(MD.growBy(L.f), 1000, 1);
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + L.name + '</td><td><b>' + L.label + '</b></td><td>' + money2(m.worstAvg) + '</td><td>' + Math.round(m.peakVac * 100) + '%</td><td><button class="ghost" data-id="' + L.id + '">See the jar</button></td>';
      tr.querySelector('button').addEventListener('click', function () { W2.opt = L.id; W2.fee = Math.ceil(m.worstAvg * 4) / 4; $('w2fee').value = Math.min(12, W2.fee); W2.fee = +$('w2fee').value; show(2); });
      body.appendChild(tr);
    });
  }

  /* ------------------------------------------------------------ wiring */
  function show(s) {
    step = s;
    Array.prototype.forEach.call($('whySteps').children, function (b) { b.setAttribute('aria-selected', +b.dataset.s === s); });
    Array.prototype.forEach.call(document.querySelectorAll('.wpane'), function (p) { p.classList.toggle('on', +p.dataset.s === s); });
    refresh();
  }
  function refresh() {
    if (step === 1) draw1(); else if (step === 2) draw2();
  }

  Array.prototype.forEach.call($('whySteps').children, function (b) { b.addEventListener('click', function () { show(+b.dataset.s); }); });
  $('w1range').addEventListener('input', draw1);
  $('w2fee').addEventListener('input', function () { W2.fee = +this.value; draw2(); });
  $('w2n').addEventListener('input', function () { W2.N = +this.value; draw2(); });
  buildChips(); buildLang();

  MD.why = { show: show, refresh: refresh, current: function () { return step; } };
})();
