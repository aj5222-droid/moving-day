/*
 * sim.js: the game's brain. No drawing in here.
 *
 * An array has a capacity (rooms) and a size (boxes inside). Appending a box
 * costs $1. If the array is full first, it must move into a bigger building:
 * every box is copied over, $1 per box, before the new box can go in.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var MD = (root.MD = root.MD || {});

  // Grow by a factor, but always by at least one room so tiny arrays still grow.
  function growBy(f) {
    return function (c) { return Math.max(c + 1, Math.ceil(c * f - 1e-9)); };
  }

  var STRATS = {
    plus1:  { id: 'plus1',  tag: '+1',   title: 'Add 1 room',        color: '#2F5BD3', next: function (c) { return c + 1; } },
    plus10: { id: 'plus10', tag: '+10',  title: 'Add 10 rooms',      color: '#E9A215', next: function (c) { return c + 10; } },
    plus25: { id: 'plus25', tag: '+25',  title: 'Add 25 rooms',      color: '#B4468C', next: function (c) { return c + 25; } },
    x15:    { id: 'x15',    tag: '×1.5', title: 'Grow by half', color: '#1B9AAA', next: growBy(1.5) },
    double: { id: 'double', tag: '×2',   title: 'Double the rooms', color: '#1E9E6A', next: function (c) { return c * 2; } },
    triple: { id: 'triple', tag: '×3',   title: 'Triple the rooms', color: '#6C5BD4', next: function (c) { return c * 3; } }
  };

  // How bad does the average get, and how empty does the new building start?
  // Judged over a long run so a lucky final move can't flatter a strategy.
  function longRun(next, N, from) {
    var s = createSim(next);
    var worst = 0;
    for (var i = 1; i <= N; i++) {
      var ev = s.append();
      if (i >= from && ev.avg > worst) worst = ev.avg;
    }
    return { worstAvg: worst, peakVac: s.peakVac };
  }

  function createSim(next, startCap) {
    var s = { next: next, cap: startCap || 1, size: 0, n: 0, total: 0, moves: 0, copies: 0, peakVac: 0 };
    s.append = function () {
      var ev = { n: s.n + 1, moved: false, from: s.cap, to: s.cap, copies: 0, sizeBefore: s.size, vacancy: 0 };
      if (s.size === s.cap) {
        var to = s.next(s.cap);
        ev.moved = true;
        ev.to = to;
        ev.copies = s.size;
        s.cap = to;
        s.moves++;
        s.copies += ev.copies;
      }
      s.size++;
      s.n++;
      ev.cost = 1 + ev.copies;
      s.total += ev.cost;
      ev.total = s.total;
      ev.size = s.size;
      ev.cap = s.cap;
      if (ev.moved) {
        ev.vacancy = (s.cap - s.size) / s.cap;
        if (ev.vacancy > s.peakVac) s.peakVac = ev.vacancy;
      }
      ev.avg = s.total / s.n;
      ev.moves = s.moves;
      return ev;
    };
    return s;
  }

  // Run a whole game at once. Used for the race and for previews.
  function timeline(next, N) {
    var s = createSim(next);
    var events = [];
    for (var i = 0; i < N; i++) events.push(s.append());
    return { events: events, sim: s };
  }

  // Run until N boxes are stored or the budget runs out, whichever is first.
  function runBudget(next, N, budget) {
    var s = createSim(next);
    var events = [];
    var ok = true;
    for (var i = 0; i < N; i++) {
      var ev = s.append();
      events.push(ev);
      if (ev.total > budget) { ok = false; break; }
    }
    return { ok: ok, events: events, sim: s, stored: ok ? N : events.length - 1 };
  }

  // A staircase of capacities, used to draw the little growth glyph on each strategy tile.
  function capSequence(next, count) {
    var out = [1];
    while (out.length < count) out.push(next(out[out.length - 1]));
    return out;
  }

  MD.STRATS = STRATS;
  MD.growBy = growBy;
  MD.createSim = createSim;
  MD.timeline = timeline;
  MD.runBudget = runBudget;
  MD.capSequence = capSequence;
  MD.longRun = longRun;

  // Node-only test hook (not used in the browser).
  if (typeof module !== 'undefined' && module.exports) module.exports = MD;
})();
