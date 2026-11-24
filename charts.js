/*
 * charts.js: three small canvas charts, drawn by hand (no chart library).
 *
 *  cost    one bar per append, plus the running average as a line
 *  lines   running average per strategy, for the race
 *  budget  cumulative spend against a budget line, for the challenge
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var MD = (root.MD = root.MD || {});

  var INK = '#1B2631', MUTED = '#6B7580', GRID = 'rgba(27,38,49,0.11)', ORANGE = '#E4501A';
  var MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

  function setup(canvas) {
    var r = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function niceMax(v) {
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var m = v / p;
    var n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
    return n * p;
  }

  function fmt(v) {
    if (v >= 10000) return (v / 1000).toFixed(0) + 'k';
    if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(Math.round(v));
  }

  function frame(S, pad, ymax, xmax, yLabel) {
    var ctx = S.ctx;
    var x0 = pad.l, x1 = S.w - pad.r, y0 = S.h - pad.b, y1 = pad.t;
    ctx.font = '10.5px ' + MONO;
    ctx.fillStyle = MUTED;
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    var ticks = [0, 0.5, 1];
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ticks.forEach(function (t) {
      var y = Math.round(y0 + (y1 - y0) * t) + 0.5;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.fillText((yLabel || '$') + fmt(ymax * t), x0 - 6, y);
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('1', x0, y0 + 5);
    ctx.textAlign = 'right';
    ctx.fillText(String(xmax), x1, y0 + 5);
    return { x0: x0, x1: x1, y0: y0, y1: y1 };
  }

  /* ---- Play: cost of each append ---- */
  function cost(canvas, costs, avgs, color) {
    var S = setup(canvas), ctx = S.ctx;
    var n = costs.length;
    var xmax = Math.max(16, n);
    var ymax = niceMax(Math.max.apply(null, costs.concat([4])));
    var f = frame(S, { l: 40, r: 12, t: 10, b: 20 }, ymax, xmax);
    var bw = (f.x1 - f.x0) / xmax;
    var gap = bw > 5 ? 1 : 0;
    ctx.fillStyle = color;
    for (var i = 0; i < n; i++) {
      var h = (costs[i] / ymax) * (f.y0 - f.y1);
      var big = costs[i] > 1;
      ctx.globalAlpha = big ? 1 : 0.55;
      ctx.fillRect(f.x0 + i * bw, f.y0 - Math.max(h, 1), Math.max(bw - gap, 1), Math.max(h, 1));
    }
    ctx.globalAlpha = 1;
    if (n > 0) {
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (var j = 0; j < n; j++) {
        var x = f.x0 + (j + 0.5) * bw, y = f.y0 - (avgs[j] / ymax) * (f.y0 - f.y1);
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      var lx = f.x0 + (n - 0.5) * bw, ly = f.y0 - (avgs[n - 1] / ymax) * (f.y0 - f.y1);
      ctx.fillStyle = ORANGE;
      ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, 6.2832); ctx.fill();
    }
  }

  /* ---- Race: running average per strategy ---- */
  function lines(canvas, series, N, ymaxHint, limit) {
    var S = setup(canvas), ctx = S.ctx;
    var ymax = niceMax(Math.max(ymaxHint || 4, limit ? limit * 1.4 : 0));
    var f = frame(S, { l: 40, r: 44, t: 10, b: 20 }, ymax, N);
    if (limit) {
      var ly0 = f.y0 - (limit / ymax) * (f.y0 - f.y1);
      ctx.setLineDash([5, 4]); ctx.strokeStyle = ORANGE; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(f.x0, ly0); ctx.lineTo(f.x1, ly0); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ORANGE; ctx.font = '600 10.5px ' + MONO; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText('limit $' + limit.toFixed(2), f.x1, ly0 - 3);
    }
    var labels = [];
    series.forEach(function (s) {
      var k = s.upTo;
      if (k < 1) return;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (var i = 0; i < k; i++) {
        var x = f.x0 + ((i + 0.5) / N) * (f.x1 - f.x0);
        var y = f.y0 - Math.min(s.avgs[i] / ymax, 1) * (f.y0 - f.y1);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      var ex = f.x0 + ((k - 0.5) / N) * (f.x1 - f.x0);
      var ey = f.y0 - Math.min(s.avgs[k - 1] / ymax, 1) * (f.y0 - f.y1);
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(ex, ey, 3.5, 0, 6.2832); ctx.fill();
      labels.push({ tag: s.tag, color: s.color, x: Math.min(ex + 7, S.w - 40), y: Math.max(ey, f.y1 + 6) });
    });
    labels.sort(function (a, b) { return a.y - b.y; });
    for (var q = 1; q < labels.length; q++) if (labels[q].y - labels[q - 1].y < 13) labels[q].y = labels[q - 1].y + 13;
    ctx.font = '600 11px ' + MONO;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    labels.forEach(function (l) { ctx.fillStyle = l.color; ctx.fillText(l.tag, l.x, l.y); });
  }

  /* ---- Challenge: running total against the budget ---- */
  function budget(canvas, totals, budgetValue, N, color, failedAt) {
    var S = setup(canvas), ctx = S.ctx;
    var top = Math.max(budgetValue * 1.35, totals.length ? totals[totals.length - 1] * 1.05 : 0);
    var ymax = niceMax(top);
    var f = frame(S, { l: 44, r: 12, t: 10, b: 20 }, ymax, N);
    var by = f.y0 - (budgetValue / ymax) * (f.y0 - f.y1);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = ORANGE;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(f.x0, by); ctx.lineTo(f.x1, by); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ORANGE;
    ctx.font = '600 10.5px ' + MONO;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('budget $' + budgetValue, f.x1, by - 3);
    if (!totals.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var i = 0; i < totals.length; i++) {
      var x = f.x0 + ((i + 1) / N) * (f.x1 - f.x0);
      var y = f.y0 - Math.min(totals[i] / ymax, 1) * (f.y0 - f.y1);
      if (i === 0) ctx.moveTo(f.x0, f.y0);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    var lx = f.x0 + (totals.length / N) * (f.x1 - f.x0);
    var ly = f.y0 - Math.min(totals[totals.length - 1] / ymax, 1) * (f.y0 - f.y1);
    ctx.fillStyle = failedAt ? ORANGE : color;
    ctx.beginPath(); ctx.arc(lx, ly, 4, 0, 6.2832); ctx.fill();
  }

  MD.charts = { cost: cost, lines: lines, budget: budget, setup: setup, niceMax: niceMax };
})();
