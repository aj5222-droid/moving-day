/*
 * main.js: the game. Three modes share one 3D stage.
 *
 *   Play       one building, you add boxes and watch the receipt
 *   Race       three plans store the same boxes; cost is time
 *   Challenge  stay under a budget (levels 1 and 2), or tune the growth factor (level 3)
 *
 * The cost model itself lives in sim.js. This file only decides what to show.
 */
(function () {
  'use strict';
  var MD = window.MD;
  function $(id) { return document.getElementById(id); }
  function money(v) { return '$' + Math.round(v).toLocaleString('en-US'); }
  function money2(v) { return '$' + v.toFixed(2); }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  var ORDER = ['plus1', 'plus10', 'plus25', 'x15', 'double', 'triple'];
  var MAX_BOXES = 256;

  var stage = new MD.Stage($('gl'), $('tags'), $('safe'));
  if (!stage.ok) {
    $('fallback').hidden = false;
    $('intro').classList.add('gone');
    return;
  }

  var mode = 'play';
  var introOpen = true;

  /* ---------------------------------------------------------------- caption */
  var capTimer = 0;
  function say(text, ms) {
    var el = $('caption');
    el.textContent = text || '';
    el.classList.toggle('on', !!text);
    clearTimeout(capTimer);
    if (text && ms !== 0) capTimer = setTimeout(function () { el.classList.remove('on'); }, ms || 4200);
  }

  function sr(text) { $('sr').textContent = text; }

  /* ------------------------------------------------------------------ sound */
  var snd = { on: false, ctx: null, last: 0 };
  function blip(freq, dur, type, gain) {
    if (!snd.on) return;
    try {
      if (!snd.ctx) snd.ctx = new (window.AudioContext || window.webkitAudioContext)();
      var c = snd.ctx, t = c.currentTime;
      if (dur < 0.1 && t - snd.last < 0.035) return;
      snd.last = t;
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(gain || 0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur);
    } catch (e) { /* sound is optional */ }
  }
  $('soundBtn').addEventListener('click', function () {
    snd.on = !snd.on;
    this.setAttribute('aria-pressed', snd.on);
    this.textContent = snd.on ? 'Sound on' : 'Sound off';
    blip(660, 0.12, 'sine', 0.06);
  });

  /* ------------------------------------------------------------ plan tiles */
  function seqText(s) { return MD.capSequence(s.next, 4).join(' → ') + ' …'; }

  function buildTiles(el, ids, onPick) {
    el.innerHTML = '';
    ids.forEach(function (id) {
      var s = MD.STRATS[id];
      var b = document.createElement('button');
      b.className = 'tile';
      b.dataset.id = id;
      b.setAttribute('aria-pressed', 'false');
      b.style.setProperty('--c', s.color);
      b.innerHTML = '<b>' + s.tag + '</b><span>' + s.title + '</span><em>' + seqText(s) + '</em>';
      b.addEventListener('click', function () { onPick(id); });
      el.appendChild(b);
    });
    return function (id) {
      Array.prototype.forEach.call(el.children, function (b) { b.setAttribute('aria-pressed', b.dataset.id === id); });
    };
  }

  /* ================================================================== PLAY */
  var P = {
    strat: MD.STRATS.double, sim: null, lane: null,
    costs: [], avgs: [], ledger: [], d: { total: 0, copies: 0, size: 0, cap: 1 },
    moves: 0, lastEv: null, auto: false, speed: 'watch', wait: 0, started: false
  };
  var SPEEDS = { watch: 1, fast: 2.4, skip: 6 };
  var setPlayTile = buildTiles($('tiles'), ORDER, function (id) { playInit(MD.STRATS[id]); });

  function slotWorld(lane, cap, i) {
    var L = MD.layout(cap), row = Math.floor(i / L.W), col = i % L.W;
    return [lane.cx - L.W / 2 + col + 0.37, row + 0.95, 0.4];
  }

  function playInit(strat) {
    MD.aspect = 2;
    P.strat = strat;
    P.sim = MD.createSim(strat.next);
    P.costs = []; P.avgs = []; P.ledger = [];
    P.d = { total: 0, copies: 0, size: 0, cap: 1 };
    P.moves = 0; P.lastEv = null;
    var lane = stage.setLanes([{ id: 'p', tag: strat.tag, color: strat.color, cx: 0, style: 'hop' }])[0];
    P.lane = lane;
    lane.on.moveStart = function (ev) {
      say('Full at ' + ev.sizeBefore + ' boxes. Every box moves into a ' + ev.to + '-room building.');
      blip(120, 0.3, 'triangle', 0.07);
    };
    lane.on.copy = function (k) {
      P.d.copies += k; P.d.total += k;
      renderReceipt();
      blip(190 + Math.min(P.d.copies, 80) * 3, 0.05, 'triangle', 0.04);
    };
    lane.on.moveEnd = function (ev) { P.d.cap = ev.to; renderReceipt(); };
    lane.on.land = function (ev) {
      P.d.total += 1; P.d.size = ev.size; P.d.cap = ev.cap;
      P.costs.push(ev.cost); P.avgs.push(ev.avg);
      P.ledger.push({ n: ev.size, moved: ev.moved, copies: ev.copies, cost: ev.cost });
      if (ev.moved) P.moves++;
      P.lastEv = ev;
      var w = slotWorld(lane, ev.cap, ev.size - 1);
      if (ev.moved || P.speed === 'watch') stage.pop(ev.moved ? money(ev.cost) : '+$1', ev.moved ? 'big' : '', w[0], w[1], w[2]);
      blip(ev.moved ? 392 : 520 + (ev.size % 5) * 40, 0.09, 'sine', 0.05);
      renderReceipt(); renderChart(); renderInsight();
    };
    setPlayTile(strat.id);
    $('addBtn').disabled = false; $('add10Btn').disabled = false;
    $('chartTitle').textContent = 'Cost of each add';
    $('legend').innerHTML = '<span><i style="--c:' + strat.color + '"></i>cost of one add</span><span><i class="ln" style="--c:#E4501A"></i>running average</span>';
    renderReceipt(); renderChart(); renderInsight();
    say(introOpen ? '' : 'New ' + strat.tag + ' building. Add a box to begin.');
  }

  function playAdd(n) {
    for (var i = 0; i < n; i++) {
      if (P.sim.n >= MAX_BOXES) break;
      if (P.lane.queue.length > 60) break;
      P.lane.enqueue(P.sim.append());
    }
    if (P.sim.n >= MAX_BOXES) { $('addBtn').disabled = true; $('add10Btn').disabled = true; }
  }

  function renderReceipt() {
    var d = P.d, ul = $('rcLines');
    var rows = P.ledger.slice(-9);
    var html = '';
    if (!rows.length) html = '<li class="empty"><span>no charges yet</span></li>';
    rows.forEach(function (r) {
      var label = r.moved ? '#' + r.n + ' move ' + r.copies + ' + add' : '#' + r.n + ' add a box';
      html += '<li class="' + (r.moved ? 'big' : '') + '"><span>' + label + '</span><span>' + money(r.cost) + '</span></li>';
    });
    if (ul.dataset.sig !== html) { ul.dataset.sig = html; ul.innerHTML = html; }
    $('rcBoxes').textContent = d.size;
    $('rcMoved').textContent = d.copies;
    $('rcTotal').textContent = money(d.total);
    $('rcAvg').textContent = d.size ? money2(d.total / Math.max(d.size, 1)) : '$0.00';
    var empty = Math.max(0, d.cap - d.size);
    $('rcVac').textContent = empty + ' of ' + d.cap;
    $('rcVacBar').style.width = (d.cap ? (empty / d.cap) * 100 : 0) + '%';
    sr('Building with ' + d.cap + ' rooms and ' + d.size + ' boxes stored. ' + P.strat.title + '. Total paid ' + money(d.total) + ', average ' + (d.size ? money2(d.total / d.size) : '$0.00') + ' per add.');
  }

  function renderChart() {
    if (mode !== 'play') return;
    MD.charts.cost($('chart'), P.costs, P.avgs, P.strat.color);
  }

  function renderInsight() {
    var el = $('insight'), s = P.strat, n = P.d.size, avg = n ? P.d.total / n : 0;
    var vac = P.d.cap ? (P.d.cap - n) / P.d.cap : 0;
    var h, t;
    if (!n) {
      h = 'The rules'; t = 'Placing a box costs $1. Moving a box to a new building also costs $1.';
    } else if (!P.moves) {
      h = 'So far so cheap'; t = 'Every add has cost $1. Keep going until the building fills up.';
    } else if (P.lastEv && P.lastEv.moved && P.moves === 1) {
      h = 'That was a move'; t = 'The building was full, so this add cost ' + money(P.lastEv.cost) + ': ' + P.lastEv.copies + ' to move the boxes and $1 to place the new one.';
    } else if (s.id === 'plus1' && n >= 8) {
      h = 'Always moving'; t = 'With +1 the building is full again after every add, so every add copies every box. The average is ' + money2(avg) + ' and keeps climbing.';
    } else if ((s.id === 'plus10' || s.id === 'plus25') && n >= 30) {
      h = 'Rarer, but never cheaper'; t = 'Rooms come in fixed chunks, so the moves are spaced out. But each one is bigger than the last, so the average still climbs: ' + money2(avg) + '.';
    } else if (vac > 0.6 && n >= 8) {
      h = 'Wasted memory'; t = 'Over half the rooms are empty right now. Fewer moves means more empty space. In a real program that is memory you are holding but not using.';
    } else if (n >= 16 && s.id !== 'plus1' && s.id !== 'plus10' && s.id !== 'plus25') {
      h = 'Spikes get rarer'; t = 'Each move costs more than the last, but they come further apart. Spread across all ' + n + ' adds, the average is only ' + money2(avg) + '. The Why it works tab shows the proof.';
    } else {
      h = 'Keep adding'; t = 'Watch the orange line on the chart. Does it flatten out or keep rising?';
    }
    var h3 = el.querySelector('h3'), p = el.querySelector('p');
    if (h3.textContent !== h) h3.textContent = h;
    if (p.textContent !== t) p.textContent = t;
  }

  $('addBtn').addEventListener('click', function () { playAdd(1); });
  $('add10Btn').addEventListener('click', function () { playAdd(10); });
  $('resetBtn').addEventListener('click', function () { P.auto = false; syncAuto(); playInit(P.strat); });
  $('autoBtn').addEventListener('click', function () { P.auto = !P.auto; syncAuto(); });
  function syncAuto() { $('autoBtn').setAttribute('aria-pressed', P.auto); $('autoBtn').textContent = P.auto ? 'Auto: on' : 'Auto'; }
  Array.prototype.forEach.call($('speedSeg').children, function (b) {
    b.addEventListener('click', function () {
      P.speed = b.dataset.speed;
      Array.prototype.forEach.call($('speedSeg').children, function (x) { x.setAttribute('aria-pressed', x === b); });
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space' && mode === 'play' && !introOpen && (e.target === document.body)) { e.preventDefault(); playAdd(1); }
  });

  function playTick(dt) {
    stage.tempo = SPEEDS[P.speed];
    if (!P.auto || introOpen) return;
    if (P.sim.n >= MAX_BOXES) { P.auto = false; syncAuto(); say('Reached ' + MAX_BOXES + ' boxes. Total paid ' + money(P.d.total) + '.'); return; }
    P.wait += dt;
    var q = P.lane.queue.length + (P.lane.cur ? 1 : 0);
    var lim = P.speed === 'watch' ? 1 : P.speed === 'fast' ? 3 : 6;
    if (q < lim && P.wait > (P.speed === 'watch' ? 0.3 : 0)) { P.wait = 0; playAdd(1); }
  }

  /* ================================================================== RACE */
  var R = {
    picks: ['plus1', 'plus10', 'double'], N: 64, tl: [], clock: 0, max: 1, rate: 1,
    playing: false, speed: 1, ks: [0, 0, 0], lanes: [], dirty: true, finished: false
  };

  function buildChips() {
    var el = $('raceChips');
    el.innerHTML = '';
    ORDER.forEach(function (id) {
      var s = MD.STRATS[id], b = document.createElement('button');
      b.className = 'chip'; b.dataset.id = id;
      b.style.setProperty('--c', s.color);
      b.innerHTML = '<i></i>' + s.tag;
      b.addEventListener('click', function () {
        var i = R.picks.indexOf(id);
        if (i >= 0) { if (R.picks.length > 2) R.picks.splice(i, 1); else return; }
        else { R.picks.push(id); if (R.picks.length > 3) R.picks.shift(); }
        raceInit();
      });
      el.appendChild(b);
    });
  }
  function syncChips() {
    Array.prototype.forEach.call($('raceChips').children, function (b) { b.setAttribute('aria-pressed', R.picks.indexOf(b.dataset.id) >= 0); });
  }

  function raceInit() {
    MD.aspect = 1;
    R.tl = R.picks.map(function (id) {
      var s = MD.STRATS[id], t = MD.timeline(s.next, R.N).events;
      return { s: s, ev: t, totals: t.map(function (e) { return e.total; }), avgs: t.map(function (e) { return e.avg; }) };
    });
    R.max = Math.max.apply(null, R.tl.map(function (t) { return t.totals[R.N - 1]; }));
    R.rate = 16;
    R.minTotal = Math.min.apply(null, R.tl.map(function (t) { return t.totals[R.N - 1]; }));
    R.boost = Math.max(6, (R.max - R.minTotal) / (12 * R.rate));
    R.ffNoted = false;
    R.clock = 0; R.playing = false; R.finished = false;
    R.ks = R.tl.map(function () { return 0; });
    var maxCap = Math.max.apply(null, R.tl.map(function (t) { return t.ev[R.N - 1].cap; }));
    var span = MD.layout(maxCap).W + 3.4;
    var n = R.tl.length;
    R.lanes = stage.setLanes(R.tl.map(function (t, i) {
      var W = MD.layout(t.ev[R.N - 1].cap).W;
      return { id: 'r' + i, tag: t.s.tag, color: t.s.color, cx: (i - (n - 1) / 2) * span, style: 'swap', fixedHalf: W / 2 + 0.8 };
    }));
    R.lanes.forEach(function (l) { l.cap = 1; l.size = 0; });
    stage.tempo = 1;
    syncChips();
    $('scrub').value = 0;
    $('racePlay').textContent = 'Start race';
    $('raceResult').innerHTML = '';
    buildRaceRows();
    $('chartTitle').textContent = 'Average cost per add, as each plan works through ' + R.N + ' boxes';
    $('legend').innerHTML = R.tl.map(function (t) { return '<span><i class="ln" style="--c:' + t.s.color + '"></i>' + t.s.tag + '</span>'; }).join('');
    R.dirty = true;
    say(mode === 'race' ? 'Same ' + R.N + ' boxes, three plans. The one that spends less finishes first.' : '');
  }

  function buildRaceRows() {
    $('raceRows').innerHTML = R.tl.map(function (t, i) {
      return '<div class="rrow" id="rr' + i + '" style="--c:' + t.s.color + '"><header><b>' + t.s.tag + '</b><span>' + t.s.title + '</span></header>' +
        '<div class="big" id="rt' + i + '">$0</div>' +
        '<dl><div><dt>boxes</dt><dd id="rb' + i + '">0</dd></div><div><dt>moved</dt><dd id="rm' + i + '">0</dd></div><div><dt>avg</dt><dd id="ra' + i + '">$0.00</dd></div></dl></div>';
    }).join('');
  }

  function raceSync(scrubbing) {
    R.tl.forEach(function (t, i) {
      var k = 0, lo = 0, hi = R.N;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (t.totals[mid] <= R.clock) lo = mid + 1; else hi = mid; }
      k = lo;
      if (k === R.ks[i]) return;
      var lane = R.lanes[i], prev = R.ks[i];
      if (!scrubbing && k > prev && k - prev <= 3 && lane.queue.length < 6) {
        for (var j = prev; j < k; j++) lane.enqueue(t.ev[j]);
      } else if (k === 0) {
        lane.jump(1, 0, false);
      } else {
        var e = t.ev[k - 1];
        lane.jump(e.cap, e.size, true);
      }
      R.ks[i] = k;
      R.dirty = true;
    });
  }

  function raceRender() {
    R.tl.forEach(function (t, i) {
      var k = R.ks[i], e = k ? t.ev[k - 1] : null;
      $('rt' + i).textContent = money(e ? e.total : 0);
      $('rb' + i).textContent = k;
      $('rm' + i).textContent = e ? e.total - k : 0;
      $('ra' + i).textContent = e ? money2(e.avg) : '$0.00';
    });
    sr('Race: ' + R.tl.map(function (t, i) { var e = R.ks[i] ? t.ev[R.ks[i] - 1] : null; return t.s.tag + ' has stored ' + R.ks[i] + ' boxes and paid ' + money(e ? e.total : 0); }).join('; ') + '.');
    var ymax = Math.max.apply(null, R.tl.map(function (t) { return Math.max.apply(null, t.avgs); }));
    MD.charts.lines($('chart'), R.tl.map(function (t, i) { return { tag: t.s.tag, color: t.s.color, avgs: t.avgs, upTo: R.ks[i] }; }), R.N, ymax);
    $('scrub').value = Math.round((R.clock / R.max) * 1000);
  }

  function raceFinish() {
    R.finished = true;
    var order = R.tl.map(function (t, i) { return { i: i, total: t.totals[R.N - 1] }; }).sort(function (a, b) { return a.total - b.total; });
    var best = order[0], worst = order[order.length - 1];
    var wb = R.tl[best.i].s, ww = R.tl[worst.i].s;
    Array.prototype.forEach.call(document.querySelectorAll('.rrow'), function (r) { r.classList.remove('win'); });
    $('rr' + best.i).classList.add('win');
    var ratio = worst.total / best.total;
    $('raceResult').innerHTML = '<b>' + wb.tag + ' wins.</b> It spent ' + money(best.total) + '. ' + ww.tag + ' spent ' + money(worst.total) +
      (ratio >= 1.5 ? ', about ' + (ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)) + ' times as much.' : '.');
    say(wb.tag + ' finished first. Try 128 boxes and watch the gap grow.');
    if (R.N >= 16) { /* result stays on the receipt */ }
    blip(523, 0.12, 'sine', 0.06); setTimeout(function () { blip(784, 0.2, 'sine', 0.06); }, 110);
    $('racePlay').textContent = 'Race again';
  }

  function raceTick(dt) {
    stage.tempo = 3;
    if (R.playing) {
      var ff = R.clock >= R.minTotal && R.minTotal < R.max;
      if (ff && !R.ffNoted) { R.ffNoted = true; say('The cheapest plan is done. Fast-forwarding the rest.'); }
      R.clock = Math.min(R.max, R.clock + dt * R.rate * R.speed * (ff ? R.boost : 1));
      raceSync(false);
      if (R.clock >= R.max) { R.playing = false; raceFinish(); }
    }
    if (R.dirty) { R.dirty = false; raceRender(); }
  }

  $('racePlay').addEventListener('click', function () {
    if (R.finished || R.clock >= R.max) { var c = R.playing; raceInit(); }
    R.playing = !R.playing;
    $('racePlay').textContent = R.playing ? 'Pause' : 'Resume';
    if (R.playing && R.clock === 0) { R.lanes.forEach(function (l) { l.jump(1, 0, false); }); }
  });
  $('raceRestart').addEventListener('click', function () { raceInit(); });
  $('nRange').addEventListener('input', function () { R.N = +this.value; $('nVal').textContent = R.N; raceInit(); });
  Array.prototype.forEach.call($('raceSpeed').children, function (b) {
    b.addEventListener('click', function () {
      R.speed = +b.dataset.speed;
      Array.prototype.forEach.call($('raceSpeed').children, function (x) { x.setAttribute('aria-pressed', x === b); });
    });
  });
  $('scrub').addEventListener('input', function () {
    R.playing = false; R.finished = false;
    $('racePlay').textContent = 'Resume';
    R.clock = (+this.value / 1000) * R.max;
    raceSync(true);
    if (R.clock >= R.max) raceFinish();
    else { $('raceResult').innerHTML = ''; Array.prototype.forEach.call(document.querySelectorAll('.rrow'), function (r) { r.classList.remove('win'); }); }
    R.dirty = true;
  });

  /* ============================================================= CHALLENGE */
  var LEVELS = [
    { n: 1, title: 'Small move', N: 100, budget: 300, opts: ['plus1', 'plus10', 'double'],
      brief: 'Store 100 boxes without spending more than $300. Pick how the building grows, then run it.' },
    { n: 2, title: 'Big move', N: 240, budget: 520, opts: ['plus10', 'plus25', 'x15', 'double', 'triple'],
      brief: 'Now 240 boxes on a $520 budget. Earn a second star by never leaving more than half the rooms empty.' },
    { n: 3, title: 'Dial it in', dial: true,
      brief: 'Every factor above x1 is amortized O(1), so this is a tradeoff, not a trick. Pick one that keeps the worst average cost under $3.30 and never leaves more than 55% of the rooms empty. Those limits are this level\'s rules, not a law of nature.' }
  ];
  var C = { lv: 0, pick: null, running: false, sim: null, lane: null, totals: [], d: { total: 0, size: 0 }, done: false, f: 1.5 };
  var progress = {};
  try { progress = JSON.parse(localStorage.getItem('movingday.progress') || '{}'); } catch (e) { progress = {}; }
  function saveProgress() { try { localStorage.setItem('movingday.progress', JSON.stringify(progress)); } catch (e) { /* ignore */ } }

  function buildLevelTabs() {
    var el = $('lvTabs'); el.innerHTML = '';
    LEVELS.forEach(function (L, i) {
      var b = document.createElement('button');
      b.className = 'lv' + (progress[L.n] ? ' done' : '');
      b.textContent = L.n + (progress[L.n] ? ' ' + '\u2605'.repeat(progress[L.n]) : '');
      b.setAttribute('aria-label', 'Level ' + L.n + (progress[L.n] ? ', completed with ' + progress[L.n] + (progress[L.n] === 1 ? ' star' : ' stars') : ''));
      b.setAttribute('aria-pressed', i === C.lv);
      b.addEventListener('click', function () { challengeInit(i); });
      el.appendChild(b);
    });
  }

  var setChTile = function () {};
  function challengeInit(i) {
    MD.aspect = 2;
    C.lv = i; C.running = false; C.done = false; C.pick = null; C.totals = []; C.d = { total: 0, size: 0 };
    var L = LEVELS[i];
    buildLevelTabs();
    $('lvTitle').textContent = 'Level ' + L.n + ': ' + L.title;
    $('lvBrief').textContent = L.brief + (L.n > 1 && !progress[L.n - 1] ? ' Tip: level ' + (L.n - 1) + ' first, it sets this one up.' : '');
    $('dial').classList.toggle('on', !!L.dial);
    $('lvOptions').style.display = L.dial ? 'none' : '';
    $('chStamp').className = 'stamp'; $('chStamp').innerHTML = '';
    $('chWhy').textContent = '';
    $('skipBtn').style.display = 'none';
    $('fTrack').classList.remove('reveal');
    if (L.dial) {
      $('runBtn').textContent = 'Lock it in';
      $('runBtn').disabled = false;
      $('chHead').textContent = 'limits';
      var strat = dialStrat();
      var lane = stage.setLanes([{ id: 'c', tag: '×' + C.f.toFixed(2).replace(/0$/, ''), color: '#1E9E6A', cx: 0, style: 'swap' }])[0];
      C.lane = lane; lane.cap = 1; lane.size = 0;
      $('chartTitle').textContent = 'Running average cost for this growth factor';
      $('legend').innerHTML = '<span><i class="ln" style="--c:#1E9E6A"></i>average</span><span><i class="ln" style="--c:#E4501A"></i>limit</span>';
      $('chLabel').textContent = 'Worst'; $('chSpent').textContent = '--'; $('chOf').textContent = ''; $('chBar').style.width = '0';
      $('chBoxes').textContent = 'Slide the factor, then lock it in.';
      dialUpdate();
    } else {
      $('chLabel').textContent = 'Spent';
      $('runBtn').textContent = 'Run it';
      $('runBtn').disabled = true;
      setChTile = buildTiles($('lvOptions'), L.opts, function (id) { if (C.running) return; C.pick = id; setChTile(id); $('runBtn').disabled = false; challengeReset(); });
      $('chHead').textContent = 'budget';
      challengeReset();
      $('chartTitle').textContent = 'Total paid so far';
      $('legend').innerHTML = '<span><i class="ln" style="--c:#1B2631"></i>total</span><span><i class="ln" style="--c:#E4501A"></i>budget</span>';
    }
    say('');
  }

  function challengeReset() {
    var L = LEVELS[C.lv];
    if (L.dial) return;
    C.totals = []; C.d = { total: 0, size: 0 }; C.done = false; C.running = false;
    var s = C.pick ? MD.STRATS[C.pick] : MD.STRATS.double;
    var lane = stage.setLanes([{ id: 'c', tag: C.pick ? s.tag : '?', color: C.pick ? s.color : '#8A9AA8', cx: 0, style: 'swap' }])[0];
    C.lane = lane; lane.cap = 1; lane.size = 0;
    $('chStamp').className = 'stamp'; $('chStamp').innerHTML = '';
    $('chWhy').textContent = C.pick ? '' : 'Pick a plan to see what it would cost.';
    $('skipBtn').style.display = 'none';
    challengeMeters();
    challengeChart();
  }

  function challengeMeters() {
    var L = LEVELS[C.lv]; if (L.dial) return;
    $('chSpent').textContent = money(C.d.total);
    $('chOf').textContent = 'of ' + money(L.budget);
    var over = C.d.total > L.budget;
    $('chBar').style.width = Math.min(100, (C.d.total / L.budget) * 100) + '%';
    $('chBar').parentNode.classList.toggle('over', over);
    $('chBoxes').textContent = C.d.size + ' of ' + L.N + ' boxes stored';
    sr('Challenge level ' + L.n + ': ' + C.d.size + ' of ' + L.N + ' boxes stored, spent ' + money(C.d.total) + ' of ' + money(L.budget) + '.');
  }
  function challengeChart() {
    var L = LEVELS[C.lv]; if (L.dial) return;
    MD.charts.budget($('chart'), C.totals, L.budget, L.N, C.pick ? MD.STRATS[C.pick].color : '#1B2631', C.done && C.d.total > L.budget);
  }

  function challengeRun(instant) {
    var L = LEVELS[C.lv];
    if (L.dial) return dialLock();
    if (!C.pick || C.running) return;
    challengeReset();
    var s = MD.STRATS[C.pick];
    C.sim = MD.createSim(s.next);
    C.running = true;
    $('runBtn').disabled = true;
    $('skipBtn').style.display = '';
    var lane = C.lane;
    lane.on.copy = function (k) { C.d.total += k; blip(190, 0.04, 'triangle', 0.03); checkOver(); challengeMeters(); };
    lane.on.land = function (ev) {
      C.d.total += 1; C.d.size = ev.size; C.totals.push(ev.total);
      challengeMeters(); challengeChart();
      checkOver();
      if (!C.done && ev.size >= L.N) finishChallenge();
    };
    for (var i = 0; i < L.N; i++) lane.enqueue(C.sim.append());
    stage.tempo = 8;
    if (instant) skipRun();
  }
  function checkOver() {
    var L = LEVELS[C.lv];
    if (C.done || !C.running || C.d.total <= L.budget) return;
    C.lane.queue.length = 0;
    C.done = true; C.running = false;
    var s = MD.STRATS[C.pick];
    $('chStamp').className = 'stamp fail'; $('chStamp').innerHTML = '<span>Over budget</span>';
    $('chWhy').textContent = failWhy(s, L);
    say('Out of money at box ' + C.d.size + ' of ' + L.N + '.');
    blip(150, 0.4, 'sawtooth', 0.05);
    endRun();
  }
  function failWhy(s, L) {
    var full = MD.runBudget(s.next, L.N, 1e9);
    var total = full.sim.total, moves = full.events.filter(function (e) { return e.moved; }).length;
    var base = 'The full job would cost ' + money(total) + ' with ' + moves + ' moves. ';
    if (s.id === 'plus1') return base + 'Growing by one room means every single add copies every box.';
    if (s.id === 'plus10' || s.id === 'plus25') return base + 'Fixed-size steps make the moves regular, but each one copies everything stored so far. The cost grows with the square of the boxes.';
    return base + 'The building grows too slowly, so you move too often. Try a bigger factor.';
  }
  function finishChallenge() {
    var L = LEVELS[C.lv];
    C.done = true; C.running = false;
    var s = MD.STRATS[C.pick];
    var ok = C.d.total <= L.budget;
    var stars = 0, why;
    if (ok) {
      stars = 1;
      var pv = C.sim.peakVac;
      if (L.n === 2 && pv <= 0.5) stars = 2;
      $('chStamp').className = 'stamp pass'; $('chStamp').innerHTML = '<span>Paid in full</span>';
      why = 'You paid ' + money(C.d.total) + ' of ' + money(L.budget) + '.';
      if (L.n === 1) why += ' Doubling keeps the moves rare enough that the cost per add stays almost flat.';
      if (L.n === 2) why += stars === 2 ? ' Two stars: the building was never more than half empty.' : ' At its emptiest, ' + pct(pv) + ' of the rooms were empty. Fewer moves, but a lot of wasted memory. Can you do it with less empty space?';
      progress[L.n] = Math.max(progress[L.n] || 0, stars); saveProgress(); buildLevelTabs();
      blip(523, 0.12, 'sine', 0.06); setTimeout(function () { blip(659, 0.12, 'sine', 0.06); }, 110); setTimeout(function () { blip(784, 0.22, 'sine', 0.06); }, 220);
      say('Level ' + L.n + ' complete.');
    } else {
      $('chStamp').className = 'stamp fail'; $('chStamp').innerHTML = '<span>Over budget</span>';
      why = failWhy(s, L);
    }
    $('chWhy').textContent = why;
    endRun();
  }
  function endRun() { $('runBtn').disabled = false; $('runBtn').textContent = 'Try again'; $('skipBtn').style.display = 'none'; stage.tempo = 1; challengeMeters(); challengeChart(); }

  function skipRun() {
    var L = LEVELS[C.lv];
    if (!C.running) return;
    var s = MD.STRATS[C.pick];
    var r = MD.runBudget(s.next, L.N, L.budget);
    C.lane.queue.length = 0; C.lane.cur = null;
    var last = r.events[r.events.length - 1];
    C.totals = r.events.map(function (e) { return e.total; });
    C.d = { total: last.total, size: last.size };
    C.lane.jump(last.cap, last.size, true);
    if (!r.ok) {
      C.running = true; C.done = false;
      // make sure the failure path runs even though the callbacks were skipped
      C.d.total = last.total;
      checkOver();
    } else {
      C.sim = MD.createSim(s.next); for (var i = 0; i < L.N; i++) C.sim.append();
      C.d.total = last.total; finishChallenge();
    }
  }

  /* ---- level 3: dial the growth factor ---- */
  var LIM_AVG = 3.3, LIM_VAC = 0.55;
  function dialStrat() { return { next: MD.growBy(C.f) }; }
  function dialMetrics(f) { return MD.longRun(MD.growBy(f), 2000, 30); }
  function dialUpdate() {
    var m = dialMetrics(C.f);
    $('fVal').textContent = '×' + C.f.toFixed(2);
    var ga = $('gAvg'), gv = $('gVac');
    ga.querySelector('b').textContent = money2(m.worstAvg);
    gv.querySelector('b').textContent = pct(m.peakVac);
    ga.querySelector('i').style.width = Math.min(100, (m.worstAvg / (LIM_AVG * 1.5)) * 100) + '%';
    gv.querySelector('i').style.width = Math.min(100, (m.peakVac / (LIM_VAC * 1.5)) * 100) + '%';
    ga.querySelector('u').style.left = (100 / 1.5) + '%';
    gv.querySelector('u').style.left = (100 / 1.5) + '%';
    ga.classList.toggle('bad', m.worstAvg > LIM_AVG);
    gv.classList.toggle('bad', m.peakVac > LIM_VAC);
    // chart of the running average for this factor
    var tl = MD.timeline(MD.growBy(C.f), 300).events;
    var avgs = tl.map(function (e) { return e.avg; });
    if (mode === 'challenge' && LEVELS[C.lv].dial) {
      MD.charts.lines($('chart'), [{ tag: '×' + C.f.toFixed(2), color: '#1E9E6A', avgs: avgs, upTo: 300 }], 300, Math.max.apply(null, avgs), LIM_AVG);
    }
    return m;
  }
  function dialWindow() {
    var lo = null, hi = null;
    for (var f = 1.1; f <= 4.0001; f += 0.05) {
      var m = dialMetrics(f);
      if (m.worstAvg <= LIM_AVG && m.peakVac <= LIM_VAC) { if (lo === null) lo = f; hi = f; }
    }
    return { lo: lo, hi: hi };
  }
  function dialLock() {
    var m = dialMetrics(C.f);
    var okAvg = m.worstAvg <= LIM_AVG, okVac = m.peakVac <= LIM_VAC;
    var w = dialWindow();
    // show the building at this factor
    var lane = stage.setLanes([{ id: 'c', tag: '×' + C.f.toFixed(2), color: '#1E9E6A', cx: 0, style: 'swap' }])[0];
    C.lane = lane; lane.cap = 1; lane.size = 0;
    var sim = MD.createSim(MD.growBy(C.f));
    for (var i = 0; i < 110; i++) lane.enqueue(sim.append());
    stage.tempo = 6;
    var tr = $('fTrack'), bar = tr.querySelector('i');
    var span = 4 - 1.1;
    bar.style.left = ((w.lo - 1.1) / span * 100) + '%';
    bar.style.width = (((w.hi - w.lo) + 0.05) / span * 100) + '%';
    tr.classList.add('reveal');
    var ok = okAvg && okVac, why;
    if (ok) {
      $('chStamp').className = 'stamp pass'; $('chStamp').innerHTML = '<span>In the window</span>';
      why = 'Any factor from ×' + w.lo.toFixed(2) + ' to ×' + w.hi.toFixed(2) + ' works. Grow faster and you pay for empty rooms. Grow slower and you pay for extra moves. Doubling sits in the middle. Change the limits and the window moves; every factor in it is still O(1).';
      progress[3] = 1; saveProgress(); buildLevelTabs();
      say('Level 3 complete.');
      blip(523, 0.12, 'sine', 0.06); setTimeout(function () { blip(784, 0.2, 'sine', 0.06); }, 120);
    } else if (!okAvg) {
      $('chStamp').className = 'stamp fail'; $('chStamp').innerHTML = '<span>Too many moves</span>';
      why = 'The average cost reached ' + money2(m.worstAvg) + ', over the $3.30 limit. The building grows too slowly, so you keep moving house. Raise the factor. The green band on the slider shows what works.';
    } else {
      $('chStamp').className = 'stamp fail'; $('chStamp').innerHTML = '<span>Too much empty space</span>';
      why = 'Up to ' + pct(m.peakVac) + ' of the rooms sat empty, over the 55% limit. Lower the factor. The green band on the slider shows what works.';
    }
    $('chWhy').textContent = why;
    $('chSpent').textContent = money2(m.worstAvg);
    $('chOf').textContent = 'worst average';
    $('chBar').style.width = Math.min(100, (m.worstAvg / (LIM_AVG * 1.5)) * 100) + '%';
    $('chBar').parentNode.classList.toggle('over', !okAvg);
    $('chBoxes').textContent = 'Most rooms empty: ' + pct(m.peakVac);
    $('runBtn').textContent = 'Lock it in';
  }
  $('fRange').addEventListener('input', function () {
    C.f = +this.value;
    $('chStamp').className = 'stamp'; $('chStamp').innerHTML = ''; $('chWhy').textContent = '';
    dialUpdate();
  });
  $('runBtn').addEventListener('click', function () { challengeRun(false); });
  $('skipBtn').addEventListener('click', skipRun);

  /* ================================================================== modes */
  function setMode(m) {
    mode = m;
    document.body.setAttribute('data-mode', m);
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) { b.setAttribute('aria-selected', b.dataset.mode === m); });
    P.auto = false; syncAuto(); R.playing = false; stage.tempo = 1;
    if (m === 'play') playInit(P.strat);
    else if (m === 'race') { raceInit(); }
    else if (m === 'challenge') challengeInit(C.lv);
    else requestAnimationFrame(function () { MD.why.show(MD.why.current()); });
    stage.sb = null;
    window.scrollTo(0, 0);
  }
  Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
    b.addEventListener('click', function () { if (b.dataset.mode !== mode) setMode(b.dataset.mode); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b, i, all) {
    b.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      var t = all[(i + d + all.length) % all.length]; t.focus(); t.click();
    });
  });

  $('gl').addEventListener('keydown', function (e) {
    var k = e.key, used = true;
    if (k === 'ArrowLeft') stage.nudge(-0.08, 0, 0);
    else if (k === 'ArrowRight') stage.nudge(0.08, 0, 0);
    else if (k === 'ArrowUp') stage.nudge(0, -0.06, 0);
    else if (k === 'ArrowDown') stage.nudge(0, 0.06, 0);
    else if (k === '+' || k === '=') stage.nudge(0, 0, -0.1);
    else if (k === '-') stage.nudge(0, 0, 0.1);
    else used = false;
    if (used) e.preventDefault();
  });

  /* ================================================================== intro */
  function closeIntro(first) {
    introOpen = false;
    $('intro').classList.add('gone');
    if (first && !P.started) { P.started = true; setTimeout(function () { if (mode === 'play') playAdd(1); }, 450); }
    setTimeout(function () { $('addBtn').focus({ preventScroll: true }); }, 50);
  }
  $('startBtn').addEventListener('click', function () { closeIntro(true); });
  $('helpBtn').addEventListener('click', function () { introOpen = true; $('intro').classList.remove('gone'); $('startBtn').textContent = 'Back to the game'; $('startBtn').focus(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && introOpen) closeIntro(false); });

  /* ================================================================== loop */
  var last = performance.now();
  function loop(now) {
    var dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (mode === 'play') playTick(dt);
    else if (mode === 'race') raceTick(dt);
    if (mode !== 'why') stage.frame(dt);
    requestAnimationFrame(loop);
  }

  var resizeT = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (mode === 'why') MD.why.refresh();
      else if (mode === 'play') renderChart(); else if (mode === 'race') R.dirty = true;
      else if (LEVELS[C.lv].dial) dialUpdate(); else challengeChart();
    }, 80);
  });

  buildChips();
  playInit(P.strat);
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });

  // hooks for automated checks
  window.__md = { P: P, R: R, C: C, stage: stage, setMode: setMode, playAdd: playAdd, closeIntro: closeIntro, challengeInit: challengeInit };
})();
