/*
 * stage.js: the 3D world.
 *
 * A Lane is one apartment building plus the things that happen to it:
 * boxes being tossed in, the building filling up, a new building rising
 * beside it, every box hopping across, and the old one folding away.
 * The Stage owns the camera and draws all lanes.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var MD = (root.MD = root.MD || {});
  var K = MD.KIND, M4 = MD.M4;

  var D = 0.74;         // room depth
  var SLAB = 0.14;      // floor thickness
  var DIV = 0.12;       // wall thickness between rooms
  var GAP = 2.6;        // space between old and new building
  var GY = -0.4;        // top of the ground; the plinth sits on it

  var C = {
    frame:  [0.962, 0.947, 0.915],
    plinth: [0.925, 0.918, 0.895],
    ground: [0.56, 0.68, 0.76],
    shadow: [0.10, 0.17, 0.26],
    fog:    [0.62, 0.74, 0.81],
    cards:  [[0.77, 0.59, 0.35], [0.72, 0.54, 0.31], [0.82, 0.64, 0.40], [0.69, 0.52, 0.32], [0.80, 0.61, 0.37]]
  };

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function ease(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function easeOut(p) { p = clamp(p, 0, 1); return 1 - (1 - p) * (1 - p); }
  function easeInOutCubic(p) { p = clamp(p, 0, 1); return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  // Rooms are arranged in a wide block, filled left to right, bottom to top.
  function layout(cap) {
    var H = cap <= 4 ? 1 : Math.ceil(Math.sqrt(cap / (MD.aspect || 2)));
    var W = Math.ceil(cap / H);
    return { W: W, H: H, last: cap - (H - 1) * W };
  }
  MD.layout = layout;

  function cellCenter(spec, i) {
    var L = spec.L || (spec.L = layout(spec.cap));
    var row = Math.floor(i / L.W), col = i % L.W;
    return [spec.x + col + 0.5 - 0.13, (row + SLAB / 2 + 0.22), spec.z + 0.40];
  }

  /* ---------- drawing one building ---------- */
  function drawBuilding(R, s) {
    if (s.rise <= 0.003) return;
    var L = s.L || (s.L = layout(s.cap));
    var W = L.W, H = L.H, rs = s.rise, I = R.opaque;
    var k, i, c;
    var roof = s.flash > 0 ? MD.mixc(s.color, [1, 1, 1], 0.38 * s.flash) : s.color;

    // floors (the top one is the coloured roof)
    for (k = 0; k <= H; k++) {
      var width = k === 0 ? (H === 1 ? L.last : W) : (k - 1 < H - 1 ? W : L.last);
      if (k === H) {
        I.push(s.x + width / 2, (H + 0.03) * rs, s.z + D / 2, width + 0.34, 0.2 * rs, D + 0.34, roof, K.MATTE, 0, 0, 0);
      } else {
        I.push(s.x + width / 2, k * rs, s.z + D / 2, width + DIV, SLAB * rs, D, C.frame, K.MATTE, 0, 0, 0);
      }
    }
    // walls between rooms
    for (c = 0; c <= W; c++) {
      var rows = c <= L.last ? H : H - 1;
      if (rows <= 0) continue;
      I.push(s.x + c, (rows * rs) / 2, s.z + D / 2, DIV, rows * rs + SLAB * rs, D, C.frame, K.MATTE, 0, 0, 0);
    }
    // rooms
    var flash = s.flash || 0;
    for (i = 0; i < s.cap; i++) {
      var row = Math.floor(i / W), col = i % W;
      var cx = s.x + col + 0.5;
      var present = i >= s.from && i < s.to;
      I.push(cx, (row + 0.5) * rs, s.z + 0.03, 1 - DIV, (1 - SLAB) * rs, 0.06, s.wall, K.WALL, 0, 0, 0);
      I.push(cx + 0.21, (row + 0.40) * rs, s.z + 0.075, 0.3, 0.30 * rs, 0.03, C.frame, K.WINDOW, 0, 0, present ? 1 : 0);
      if (present) {
        var sq = 1, sx = 1;
        if (s.squash && s.squash.i === i) {
          var q = Math.sin(clamp(s.squash.t / 0.26, 0, 1) * Math.PI);
          sq = 1 - 0.2 * q; sx = 1 + 0.08 * q;
        }
        var tint = C.cards[(i * 7 + 3) % 5];
        I.push(cx - 0.13, (row + SLAB / 2 + 0.22 * sq) * rs, s.z + 0.40, 0.46 * sx, 0.44 * sq * rs, 0.5 * sx, tint, K.BOX, (hash(i) - 0.5) * 0.4, 0, 0);
      }
    }
  }

  function drawBuildingShadows(R, s, plinthY) {
    if (s.rise <= 0.02) return;
    var L = s.L || (s.L = layout(s.cap));
    var h = L.H * s.rise, S = R.soft;
    S.push(s.x + L.W / 2 + 0.2 * h, plinthY + 0.012, s.z + D / 2 - 0.14 * h, L.W + 0.3 * h + 1.4, 0.004, D + 0.34 * h + 1.4, C.shadow, K.SHADOW, 0, 0.5 + 0.05 * h, 0.17);
    S.push(s.x + L.W / 2, plinthY + 0.014, s.z + D / 2, L.W + 0.7, 0.004, D + 0.7, C.shadow, K.SHADOW, 0, 0.2, 0.16);
  }

  /* ---------- a lane ---------- */
  function Lane(stage, cfg) {
    this.stage = stage;
    this.id = cfg.id;
    this.cx = cfg.cx || 0;
    this.z = 0;
    this.tag = cfg.tag;
    this.hex = cfg.color;
    this.color = MD.hex(cfg.color);
    this.wall = MD.mixc(this.color, [0.98, 0.96, 0.92], 0.62);
    this.style = cfg.style || 'hop';
    this.fixedHalf = cfg.fixedHalf || 0;
    this.cap = cfg.cap || 1;
    this.size = cfg.size || 0;
    this.queue = [];
    this.cur = null;
    this.slide = 0;
    this.flash = 0;
    this.squash = null;
    this.plinth = null;
    this.on = {};
    this.tagText = '';
    this.el = document.createElement('div');
    this.el.className = 'lane-tag';
    this.el.style.setProperty('--c', this.hex);
    this.moveEl = document.createElement('div');
    this.moveEl.className = 'move-tag';
    this.moveEl.style.setProperty('--c', this.hex);
    stage.tags.appendChild(this.el);
    stage.tags.appendChild(this.moveEl);
  }

  Lane.prototype.destroy = function () {
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
    if (this.moveEl.parentNode) this.moveEl.parentNode.removeChild(this.moveEl);
  };

  Lane.prototype._style = function () { return this.stage.reduced ? 'swap' : this.style; };

  Lane.prototype.busy = function () { return !!this.cur || this.queue.length > 0; };

  Lane.prototype.enqueue = function (ev) {
    this.queue.push(ev);
    if (!this.cur) this._next();
  };

  // Set the state instantly (used by the race and the challenge).
  Lane.prototype.jump = function (cap, size, flash) {
    this.queue.length = 0;
    this.cur = null;
    this.slide = 0;
    this.cap = cap;
    this.size = size;
    this.flash = flash ? 1 : 0;
    this.squash = size > 0 && flash ? { i: size - 1, t: 0 } : null;
  };

  Lane.prototype._next = function () {
    var ev = this.queue.shift();
    if (!ev) { this.cur = null; return; }
    var c = { ev: ev, t: 0, pi: 0, phases: null, landed: 0, departed: 0, oldRise: 1, newRise: 0 };
    if (!ev.moved) {
      c.phases = [['place', 0.5]];
    } else if (this._style() === 'hop') {
      var n = ev.sizeBefore;
      var win = Math.min(1.7, 0.25 + n * 0.035);
      c.stagger = n > 1 ? win / (n - 1) : 0;
      c.flight = 0.62 + Math.min(0.5, n * 0.004);
      c.phases = [['full', 0.5], ['rise', 0.65], ['hop', win + c.flight], ['fold', 0.7], ['place', 0.55]];
      var Lo = layout(ev.from), Ln = layout(ev.to);
      c.slideTarget = -(Lo.W / 2 + GAP + Ln.W / 2);
    } else {
      c.phases = [['swap', 0.5], ['place', 0.4]];
    }
    this.cur = c;
    this._enter(c, c.phases[0][0]);
  };

  Lane.prototype._enter = function (c, name) {
    if (name === 'full' || name === 'swap') {
      if (this.on.moveStart) this.on.moveStart(c.ev, this);
      if (name === 'swap' && this.on.copy) this.on.copy(c.ev.copies, this);
    }
  };

  Lane.prototype.update = function (dt, tempo) {
    this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.squash) { this.squash.t += dt; if (this.squash.t > 0.3) this.squash = null; }
    var c = this.cur;
    if (!c) return;
    var T = dt * tempo;
    var guard = 0;
    while (T > 0 && this.cur === c && guard++ < 8) {
      var ph = c.phases[c.pi], dur = ph[1], name = ph[0];
      var step = Math.min(T, dur - c.t);
      c.t += step;
      T -= step;
      var p = c.t / dur;
      var ev = c.ev;
      if (name === 'rise') c.newRise = ease(p);
      else if (name === 'swap') { c.oldRise = 1 - ease(p); c.newRise = ease(p); }
      else if (name === 'hop') {
        c.newRise = 1;
        var n = ev.sizeBefore;
        while (c.departed < n && c.t >= c.departed * c.stagger) c.departed++;
        var before = c.landed;
        while (c.landed < n && c.t >= c.landed * c.stagger + c.flight) c.landed++;
        if (c.landed > before && this.on.copy) this.on.copy(c.landed - before, this);
      } else if (name === 'fold') {
        c.oldRise = 1 - ease(p);
        this.slide = ease(p) * c.slideTarget;
      }
      if (c.t >= dur - 1e-6) {
        // phase finished
        if (name === 'hop') { c.landed = ev.sizeBefore; c.departed = ev.sizeBefore; }
        if (name === 'fold' || name === 'swap') {
          this.cap = ev.to;
          this.size = ev.sizeBefore;
          this.slide = 0;
          c.oldRise = 0;
          c.newRise = 1;
          if (this.on.moveEnd) this.on.moveEnd(ev, this);
        }
        if (name === 'place') {
          this.cap = ev.cap;
          this.size = ev.size;
          this.flash = 1;
          this.squash = { i: ev.size - 1, t: 0 };
          this.cur = null;
          if (this.on.land) this.on.land(ev, this);
          if (this.on.done) this.on.done(ev, this);
          this._next();
          return;
        }
        c.pi++;
        c.t = 0;
        if (c.pi >= c.phases.length) { this.cur = null; this._next(); return; }
        this._enter(c, c.phases[c.pi][0]);
      }
    }
  };

  // The buildings to draw this frame, plus any boxes in the air.
  Lane.prototype.scene = function () {
    var out = { buildings: [], flights: [] };
    var c = this.cur, ev = c && c.ev;
    var phase = c ? c.phases[c.pi][0] : null;
    var z = this.z;
    var flash = this.flash;

    if (c && ev.moved && phase !== 'place' && this._style() === 'hop') {
      var Lo = layout(ev.from), Ln = layout(ev.to);
      var xo = this.cx - Lo.W / 2 + this.slide;
      var xn = this.cx - Lo.W / 2 + Lo.W + GAP + this.slide;
      var oldB = { cap: ev.from, x: xo, z: z, rise: c.oldRise, from: c.departed, to: ev.sizeBefore, color: this.color, wall: this.wall, flash: 0, L: Lo };
      var newB = { cap: ev.to, x: xn, z: z, rise: c.newRise, from: 0, to: c.landed, color: this.color, wall: this.wall, flash: 0, L: Ln };
      out.buildings.push(oldB, newB);
      out.old = oldB; out.neu = newB;
      if (phase === 'hop') {
        var n = ev.sizeBefore, t = c.t;
        for (var i = c.landed; i < c.departed; i++) {
          var p = (t - i * c.stagger) / c.flight;
          if (p <= 0 || p >= 1) continue;
          var a = cellCenter(oldB, i), b = cellCenter(newB, i);
          var e = easeInOutCubic(p), dir = i % 2 ? 1 : -1;
          var dx = b[0] - a[0];
          var arc = 1.6 + 0.16 * Math.abs(dx);
          out.flights.push({
            x: a[0] + dx * e,
            y: a[1] + (b[1] - a[1]) * e + Math.sin(Math.PI * p) * arc,
            z: a[2] + Math.sin(Math.PI * p) * 1.3,
            yaw: p * 3.2 * dir, tilt: Math.sin(Math.PI * p) * 0.55 * dir, i: i
          });
        }
      }
    } else if (c && ev.moved && phase === 'swap') {
      var Lo2 = layout(ev.from), Ln2 = layout(ev.to);
      out.buildings.push(
        { cap: ev.from, x: this.cx - Lo2.W / 2, z: z, rise: c.oldRise, from: 0, to: ev.sizeBefore, color: this.color, wall: this.wall, flash: 0, L: Lo2 },
        { cap: ev.to, x: this.cx - Ln2.W / 2, z: z, rise: c.newRise, from: 0, to: ev.sizeBefore, color: this.color, wall: this.wall, flash: 0, L: Ln2 }
      );
    } else {
      var L = layout(this.cap);
      var rise = 1;
      var main = { cap: this.cap, x: this.cx - L.W / 2 + this.slide, z: z, rise: rise, from: 0, to: this.size, color: this.color, wall: this.wall, flash: flash, L: L, squash: this.squash };
      out.buildings.push(main);
      if (c && phase === 'place') {
        var p2 = c.t / c.phases[c.pi][1];
        var idx = ev.sizeBefore;
        var cc = cellCenter(main, idx);
        var e2 = easeOut(p2);
        var sy = cc[1] + 3.0, sz = main.z + D + 4.6;
        out.flights.push({
          x: cc[0] - (1 - e2) * 0.8,
          y: cc[1] + (sy - cc[1]) * (1 - e2) + Math.sin(Math.PI * p2) * 1.2,
          z: cc[2] + (sz - cc[2]) * (1 - e2),
          yaw: (1 - e2) * 1.6, tilt: (1 - e2) * -0.5, i: idx, toss: true
        });
        out.tossing = idx;
      }
    }
    return out;
  };

  /* ---------- the stage ---------- */
  function Stage(canvas, tagsEl, safeEl) {
    this.canvas = canvas;
    this.tags = tagsEl;
    this.safeEl = safeEl;
    this.R = new MD.Renderer(canvas);
    this.ok = this.R.ok;
    this.lanes = [];
    this.pops = [];
    this.tempo = 1;
    this.time = 0;
    this.cam = { yaw: 0.30, pitch: 0.50, zoom: 1 };
    this.camT = { yaw: 0.30, pitch: 0.50 };
    this.idle = 0;
    this.dragging = false;
    this.view = null;
    this.reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._bindPointer();
  }

  Stage.prototype._bindPointer = function () {
    var self = this, cv = this.canvas, last = null;
    cv.addEventListener('pointerdown', function (e) {
      self.dragging = true; last = [e.clientX, e.clientY]; self.idle = 0;
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      cv.classList.add('grabbing');
    });
    cv.addEventListener('pointermove', function (e) {
      if (!self.dragging) return;
      var dx = e.clientX - last[0], dy = e.clientY - last[1];
      last = [e.clientX, e.clientY];
      self.camT.yaw = clamp(self.camT.yaw - dx * 0.006, -0.85, 0.85);
      self.camT.pitch = clamp(self.camT.pitch + dy * 0.004, 0.14, 0.95);
      self.idle = 0;
    });
    function up() { self.dragging = false; cv.classList.remove('grabbing'); }
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.cam.zoom = clamp(self.cam.zoom * Math.exp(e.deltaY * 0.0012), 0.6, 1.5);
      self.idle = 0;
    }, { passive: false });
  };

  Stage.prototype.nudge = function (dyaw, dpitch, dzoom) {
    this.camT.yaw = clamp(this.camT.yaw + dyaw, -0.85, 0.85);
    this.camT.pitch = clamp(this.camT.pitch + dpitch, 0.14, 0.95);
    this.cam.zoom = clamp(this.cam.zoom * (1 + dzoom), 0.6, 1.5);
    this.idle = 0;
  };

  Stage.prototype.setLanes = function (cfgs) {
    this.lanes.forEach(function (l) { l.destroy(); });
    this.pops.forEach(function (p) { if (p.el.parentNode) p.el.parentNode.removeChild(p.el); });
    this.pops = [];
    this.lanes = cfgs.map(function (cfg) { return new Lane(this, cfg); }, this);
    this.sb = null; this.d = null; this.off = null;
    return this.lanes;
  };

  Stage.prototype.pop = function (text, cls, x, y, z) {
    var el = document.createElement('div');
    el.className = 'pop ' + (cls || '');
    el.innerHTML = '<span>' + text + '</span>';
    this.tags.appendChild(el);
    var p = { el: el, x: x, y: y, z: z, t: 0 };
    this.pops.push(p);
    if (this.pops.length > 40) { var o = this.pops.shift(); if (o.el.parentNode) o.el.parentNode.removeChild(o.el); }
  };

  Stage.prototype.laneTempo = function (lane) {
    var t = this.tempo * (1 + 0.45 * lane.queue.length);
    if (this.reduced) t *= 2;
    return Math.min(t, 14);
  };

  Stage.prototype._bounds = function (scenes) {
    var x0 = 1e9, x1 = -1e9, y1 = 0;
    scenes.forEach(function (sc, li) {
      var lane = this.lanes[li];
      sc.buildings.forEach(function (b) {
        if (b.rise < 0.03) return;
        var L = b.L;
        x0 = Math.min(x0, b.x - 1.4); x1 = Math.max(x1, b.x + L.W + 1.4);
        y1 = Math.max(y1, (L.H + 0.5) * Math.max(b.rise, 0.3));
      });
      if (lane.fixedHalf) { x0 = Math.min(x0, lane.cx - lane.fixedHalf); x1 = Math.max(x1, lane.cx + lane.fixedHalf); }
    }, this);
    if (x0 > x1) { x0 = -3; x1 = 3; y1 = 3; }
    return { x0: x0, x1: x1, y1: y1, z0: -1.2, z1: D + 2.0, y0: GY };
  };

  Stage.prototype._fit = function (T, d, aspect, safe, b) {
    var cam = this.cam;
    var cy = Math.cos(cam.pitch), sy = Math.sin(cam.pitch);
    var eye = [T[0] + d * Math.sin(cam.yaw) * cy, T[1] + d * sy, T[2] + d * Math.cos(cam.yaw) * cy];
    var V = M4.lookAt(eye, T, [0, 1, 0]);
    var P = M4.perspective(0.5, aspect, 1, 600);
    var VP = M4.mul(P, V);
    var minx = 9, maxx = -9, miny = 9, maxy = -9;
    for (var i = 0; i < 8; i++) {
      var q = M4.project(VP, i & 1 ? b.x1 : b.x0, i & 2 ? b.y1 : b.y0, i & 4 ? b.z1 : b.z0);
      minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]);
      miny = Math.min(miny, q[1]); maxy = Math.max(maxy, q[1]);
    }
    return { eye: eye, P: P, V: V, VP: VP, minx: minx, maxx: maxx, miny: miny, maxy: maxy };
  };

  Stage.prototype.frame = function (dt) {
    if (!this.ok) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    var self = this, R = this.R;
    var cv = this.canvas, rect = cv.getBoundingClientRect();
    var cssW = rect.width, cssH = rect.height;
    if (cssW < 4 || cssH < 4) return;
    var dpr = Math.min(window.devicePixelRatio || 1, cssW * cssH > 1500000 ? 1.5 : 2);
    R.resize(cssW, cssH, dpr);

    // simulate
    this.lanes.forEach(function (l) { l.update(dt, self.laneTempo(l)); });
    var scenes = this.lanes.map(function (l) { return l.scene(); });

    // smoothed bounds
    var nb = this._bounds(scenes);
    var k = 1 - Math.exp(-dt * 6);
    if (!this.sb) this.sb = nb;
    else ['x0', 'x1', 'y1', 'z0', 'z1', 'y0'].forEach(function (key) { self.sb[key] += (nb[key] - self.sb[key]) * k; });
    var b = this.sb;

    // camera pose: gentle sway, and ease back after the viewer lets go
    this.idle += dt;
    if (!this.dragging && this.idle > 3.5) {
      var r = 1 - Math.exp(-dt * 1.2);
      this.camT.yaw += (0.30 - this.camT.yaw) * r;
      this.camT.pitch += (0.50 - this.camT.pitch) * r;
      this.cam.zoom += (1 - this.cam.zoom) * r;
    }
    var sway = this.reduced ? 0 : Math.sin(this.time * 0.22) * 0.03;
    var kc = 1 - Math.exp(-dt * 10);
    this.cam.yaw += (this.camT.yaw + sway - this.cam.yaw) * kc;
    this.cam.pitch += (this.camT.pitch - this.cam.pitch) * kc;

    // fit the scene inside the free area between the panels
    var safe = this.safeEl ? this.safeEl.getBoundingClientRect() : rect;
    var sx = (safe.width / cssW), sy = (safe.height / cssH);
    var ox = ((safe.left + safe.width / 2) - (rect.left + cssW / 2)) / (cssW / 2);
    var oy = -((safe.top + safe.height / 2) - (rect.top + cssH / 2)) / (cssH / 2);
    var aspect = cssW / cssH;
    var T = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2 + 0.3, (b.z0 + b.z1) / 2];
    var first = !this.d;
    if (first) this.d = 40;
    var d = this.d, f = null, it;
    for (it = 0; it < (first ? 6 : 3); it++) {
      f = this._fit(T, d, aspect, safe, b);
      var need = Math.max((f.maxx - f.minx) / (2 * sx * 0.95), (f.maxy - f.miny) / (2 * sy * 0.95));
      d = clamp(d * need, 6, 400);
    }
    if (first) this.d = d;
    else this.d += (d - this.d) * (1 - Math.exp(-dt * 5));
    f = this._fit(T, this.d / this.cam.zoom, aspect, safe, b);
    var tx = ox - (f.minx + f.maxx) / 2, ty = oy - (f.miny + f.maxy) / 2;
    if (!this.off) this.off = [tx, ty];
    this.off[0] += (tx - this.off[0]) * k; this.off[1] += (ty - this.off[1]) * k;
    var VP = M4.mul(M4.translation(this.off[0], this.off[1], 0), f.VP);
    this.view = { VP: VP, cssW: cssW, cssH: cssH };

    // draw
    R.begin();
    var O = R.opaque, S = R.soft;
    var gcx = T[0], gcz = T[2];
    O.push(gcx, GY - 0.5, gcz, 1200, 1, 1200, C.ground, K.GROUND, 0, 0, 0);

    this.lanes.forEach(function (lane, li) {
      var sc = scenes[li];
      // plinth: the little model base the building stands on
      var x0 = 1e9, x1 = -1e9;
      sc.buildings.forEach(function (bd) {
        if (bd.rise < 0.03) return;
        x0 = Math.min(x0, bd.x - 0.8); x1 = Math.max(x1, bd.x + bd.L.W + 0.8);
      });
      if (lane.fixedHalf) { x0 = lane.cx - lane.fixedHalf; x1 = lane.cx + lane.fixedHalf; }
      if (x0 > x1) { x0 = lane.cx - 2; x1 = lane.cx + 2; }
      if (!lane.plinth) lane.plinth = { x0: x0, x1: x1 };
      lane.plinth.x0 += (x0 - lane.plinth.x0) * k; lane.plinth.x1 += (x1 - lane.plinth.x1) * k;
      var pw = lane.plinth.x1 - lane.plinth.x0, pcx = (lane.plinth.x0 + lane.plinth.x1) / 2;
      var pz0 = -0.55, pz1 = D + 0.95;
      O.push(pcx, GY / 2, (pz0 + pz1) / 2, pw, -GY, pz1 - pz0, C.plinth, K.MATTE, 0, 0, 0);
      S.push(pcx + 0.7, GY + 0.01, (pz0 + pz1) / 2 - 0.5, pw + 2.2, 0.004, (pz1 - pz0) + 2.2, C.shadow, K.SHADOW, 0, 1.3, 0.32);
      S.push(pcx, GY + 0.014, (pz0 + pz1) / 2, pw + 0.5, 0.004, (pz1 - pz0) + 0.5, C.shadow, K.SHADOW, 0, 0.25, 0.22);

      sc.buildings.forEach(function (bd) { drawBuilding(R, bd); drawBuildingShadows(R, bd, 0); });
      sc.flights.forEach(function (fl) {
        var tint = C.cards[(fl.i * 7 + 3) % 5];
        O.push(fl.x, fl.y, fl.z, 0.46, 0.44, 0.5, tint, K.BOX, fl.yaw, fl.tilt, 0);
        var h = Math.max(0, fl.y - 0.3);
        S.push(fl.x + 0.1, 0.02, fl.z - 0.1, 0.8 + h * 0.05, 0.004, 0.8 + h * 0.05, C.shadow, K.SHADOW, 0, 0.3, 0.16 * Math.max(0, 1 - h / 6));
      });
    });

    R.render(VP, f.eye, { fog: C.fog, gc: [gcx, 0, gcz], gr: 150, shadow: C.shadow });

    // floating labels
    this._labels(scenes);
  };

  Stage.prototype._toScreen = function (x, y, z) {
    var v = this.view;
    if (!v) return null;
    var q = M4.project(v.VP, x, y, z);
    return [(q[0] * 0.5 + 0.5) * v.cssW, (1 - (q[1] * 0.5 + 0.5)) * v.cssH];
  };

  Stage.prototype._labels = function (scenes) {
    var self = this;
    this.lanes.forEach(function (lane, li) {
      var sc = scenes[li];
      var main = sc.buildings[0];
      var txt = '<i class="sw"></i><b>' + lane.tag + '</b><span>' + lane.cap + (lane.cap === 1 ? ' room' : ' rooms') + '</span>';
      if (txt !== lane.tagText) { lane.tagText = txt; lane.el.innerHTML = txt; }
      var px = lane.plinth ? lane.plinth.x0 + 0.25 : lane.cx;
      var s = self._toScreen(px, GY + 0.0, D + 1.15);
      if (s) { lane.el.style.transform = 'translate(' + s[0].toFixed(1) + 'px,' + s[1].toFixed(1) + 'px)'; lane.el.style.opacity = 1; }

      var c = lane.cur;
      var phase = c ? c.phases[c.pi][0] : null;
      if (c && c.ev.moved && sc.neu && phase !== 'fold' && phase !== 'place') {
        var nb = sc.neu, L = nb.L;
        var ms = self._toScreen(nb.x + L.W / 2, Math.max(1, L.H * Math.max(nb.rise, 0.2)) + 0.9, D / 2);
        var n = c.ev.sizeBefore;
        var html = phase === 'full' ? '<b>FULL</b>' : '<b>MOVING</b><span>' + c.landed + ' of ' + n + ' boxes</span>';
        if (phase === 'full') {
          var ob = sc.old; var Lo = ob.L;
          ms = self._toScreen(ob.x + Lo.W / 2, Lo.H + 0.9, D / 2);
        }
        if (lane.moveHtml !== html) { lane.moveHtml = html; lane.moveEl.innerHTML = html; }
        if (ms) { lane.moveEl.style.transform = 'translate(' + ms[0].toFixed(1) + 'px,' + ms[1].toFixed(1) + 'px)'; lane.moveEl.style.opacity = 1; }
      } else if (c && c.ev.moved && phase === 'swap') {
        var Ls = MD.layout(c.ev.to);
        var ss = self._toScreen(lane.cx, Ls.H + 0.9, D / 2);
        var html2 = '<b>MOVING</b><span>' + c.ev.sizeBefore + (c.ev.sizeBefore === 1 ? ' box' : ' boxes') + '</span>';
        if (lane.moveHtml !== html2) { lane.moveHtml = html2; lane.moveEl.innerHTML = html2; }
        if (ss) { lane.moveEl.style.transform = 'translate(' + ss[0].toFixed(1) + 'px,' + ss[1].toFixed(1) + 'px)'; lane.moveEl.style.opacity = 1; }
      } else {
        lane.moveEl.style.opacity = 0;
      }
    });
    for (var i = this.pops.length - 1; i >= 0; i--) {
      var p = this.pops[i];
      p.t += 1 / 60;
      var s2 = this._toScreen(p.x, p.y, p.z);
      if (s2) p.el.style.transform = 'translate(' + s2[0].toFixed(1) + 'px,' + s2[1].toFixed(1) + 'px)';
      if (p.t > 1.4) { if (p.el.parentNode) p.el.parentNode.removeChild(p.el); this.pops.splice(i, 1); }
    }
  };

  MD.Stage = Stage;
  MD.GY = GY;
  MD.ROOM_D = D;
})();
