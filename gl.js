/*
 * gl.js: a tiny WebGL2 renderer written for this project.
 *
 * Everything in the scene is a box (a cuboid). Boxes are drawn in one
 * instanced draw call, and a fragment shader gives each "kind" of box its own
 * material: matte clay, painted wall, window glass, cardboard with tape,
 * a ground that fades into the backdrop, and soft shadows.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var MD = (root.MD = root.MD || {});

  var STRIDE = 13; // pos3 size3 color3 misc4 (kind, yaw, tilt/param, glow/alpha)

  MD.KIND = { MATTE: 0, WALL: 1, WINDOW: 2, BOX: 3, GROUND: 4, EMISSIVE: 5, SHADOW: 6 };

  MD.hex = function (h) {
    h = h.replace('#', '');
    return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255];
  };
  MD.mixc = function (a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };

  /* ---------- matrices (column-major, like OpenGL) ---------- */
  var M4 = {
    perspective: function (fovy, aspect, near, far) {
      var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
    },
    lookAt: function (e, c, u) {
      var zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
      var l = 1 / Math.hypot(zx, zy, zz); zx *= l; zy *= l; zz *= l;
      var xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
      l = 1 / Math.hypot(xx, xy, xz); xx *= l; xy *= l; xz *= l;
      var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([
        xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1
      ]);
    },
    mul: function (a, b) {
      var o = new Float32Array(16);
      for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
        var s = 0;
        for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
      return o;
    },
    translation: function (x, y, z) {
      return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
    },
    // world point -> normalised device coordinates
    project: function (m, x, y, z) {
      var cx = m[0] * x + m[4] * y + m[8] * z + m[12];
      var cy = m[1] * x + m[5] * y + m[9] * z + m[13];
      var cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      return [cx / cw, cy / cw, cw];
    }
  };
  MD.M4 = M4;

  /* ---------- instance list ---------- */
  function Instances(max) {
    this.max = max;
    this.data = new Float32Array(max * STRIDE);
    this.count = 0;
  }
  Instances.prototype.clear = function () { this.count = 0; };
  Instances.prototype.push = function (x, y, z, sx, sy, sz, c, kind, yaw, tilt, glow) {
    if (this.count >= this.max) return;
    var d = this.data, o = this.count * STRIDE;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = sx; d[o + 4] = sy; d[o + 5] = sz;
    d[o + 6] = c[0]; d[o + 7] = c[1]; d[o + 8] = c[2];
    d[o + 9] = kind; d[o + 10] = yaw || 0; d[o + 11] = tilt || 0; d[o + 12] = glow || 0;
    this.count++;
  };

  /* ---------- shaders ---------- */
  var VERT = [
    '#version 300 es',
    'layout(location=0) in vec3 a_vert;',
    'layout(location=1) in vec3 a_norm;',
    'layout(location=2) in vec3 a_pos;',
    'layout(location=3) in vec3 a_size;',
    'layout(location=4) in vec3 a_color;',
    'layout(location=5) in vec4 a_misc;',
    'uniform mat4 u_vp;',
    'out vec3 v_world; out vec3 v_norm; out vec3 v_lnorm; out vec3 v_local;',
    'out vec3 v_size; out vec3 v_color; out vec4 v_misc;',
    'vec3 rot(vec3 p, float yaw, float tilt){',
    '  float ct = cos(tilt), st = sin(tilt);',
    '  p = vec3(ct*p.x - st*p.y, st*p.x + ct*p.y, p.z);',
    '  float cy = cos(yaw), sy = sin(yaw);',
    '  return vec3(cy*p.x + sy*p.z, p.y, -sy*p.x + cy*p.z);',
    '}',
    'void main(){',
    '  vec3 local = a_vert * a_size;',
    '  float tilt = a_misc.x > 5.5 ? 0.0 : a_misc.z;', // shadows reuse this slot for softness
    '  vec3 p = rot(local, a_misc.y, tilt);',
    '  v_norm = rot(a_norm, a_misc.y, tilt);',
    '  v_lnorm = a_norm; v_local = local; v_size = a_size; v_color = a_color; v_misc = a_misc;',
    '  v_world = p + a_pos;',
    '  gl_Position = u_vp * vec4(v_world, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 v_world; in vec3 v_norm; in vec3 v_lnorm; in vec3 v_local;',
    'in vec3 v_size; in vec3 v_color; in vec4 v_misc;',
    'uniform vec3 u_eye; uniform vec3 u_fog; uniform vec3 u_gc; uniform float u_gr; uniform vec3 u_shadow;',
    'out vec4 o;',
    'float hash31(vec3 p){ p = fract(p*vec3(0.1031,0.1030,0.0973)); p += dot(p, p.yxz+33.33); return fract((p.x+p.y)*p.z); }',
    'void main(){',
    '  int kind = int(v_misc.x + 0.5);',
    '  vec3 ad = abs(v_lnorm);',
    '  vec3 h = 0.5*v_size - abs(v_local);',
    '  float ed = min(min(mix(h.x,9.0,ad.x), mix(h.y,9.0,ad.y)), mix(h.z,9.0,ad.z));',
    '  if (kind == 6) {',
    '    if (ad.y < 0.5) discard;',
    '    vec2 hs = 0.5*v_size.xz; float soft = max(v_misc.z, 0.01);',
    '    vec2 q = abs(v_local.xz) - (hs - vec2(2.0*soft));',
    '    float d = length(max(q,0.0)) + min(max(q.x,q.y),0.0);',
    '    float a = v_misc.w * (1.0 - smoothstep(0.0, 2.0*soft, d));',
    '    o = vec4(u_shadow*a, a); return;',
    '  }',
    '  vec3 n = normalize(v_norm);',
    '  vec3 L1 = normalize(vec3(-0.55, 0.85, 0.50));',
    '  vec3 L2 = normalize(vec3(0.75, 0.20, 0.55));',
    '  float d1 = max(dot(n,L1), 0.0), d2 = max(dot(n,L2), 0.0);',
    '  float hemi = n.y*0.5 + 0.5;',
    '  vec3 amb = mix(vec3(0.50,0.57,0.67), vec3(0.88,0.90,0.92), hemi);',
    '  vec3 lit = amb*0.66 + vec3(1.0,0.94,0.84)*d1*0.52 + vec3(0.60,0.72,0.95)*d2*0.12;',
    '  vec3 col = v_color; float alpha = 1.0;',
    '  float grain = 1.0 + (hash31(floor(v_local*14.0)) - 0.5)*0.014;',
    '  if (kind == 0) {',
    '    col *= lit * grain;',
    '    float topEdge = (1.0 - smoothstep(0.0, 0.05, ed)) * smoothstep(0.5, 0.9, n.y);',
    '    col += topEdge*0.07;',
    '  } else if (kind == 1) {',
    '    float ao = mix(0.58, 1.0, smoothstep(0.0, 0.34, ed));',
    '    col *= lit * ao * grain;',
    '  } else if (kind == 2) {',
    '    bool front = v_lnorm.z > 0.5;',
    '    vec2 uv = v_local.xy / v_size.xy;',
    '    vec3 dark = mix(vec3(0.17,0.23,0.31), vec3(0.33,0.42,0.52), uv.y + 0.5);',
    '    vec3 warm = mix(vec3(1.0,0.74,0.36), vec3(1.0,0.90,0.62), uv.y + 0.5);',
    '    vec3 glass = mix(dark, warm, v_misc.w);',
    '    float fr = 1.0;',
    '    if (front) fr = max(1.0 - step(0.03, ed), max(1.0 - step(0.011, abs(v_local.x)), 1.0 - step(0.011, abs(v_local.y))));',
    '    col = mix(glass, v_color * lit, fr);',
    '  } else if (kind == 3) {',
    '    col *= lit * grain;',
    '    float tapeMask = 0.0;',
    '    float tw = 0.075 * v_size.x;',
    '    if (ad.y > 0.5) tapeMask = 1.0 - smoothstep(tw - 0.006, tw, abs(v_local.x));',
    '    else if (ad.z > 0.5) tapeMask = 1.0 - smoothstep(tw - 0.006, tw, abs(v_local.x));',
    '    col = mix(col, vec3(0.90,0.80,0.62) * lit, tapeMask * 0.92);',
    '    if (v_lnorm.z > 0.5) {',
    '      vec2 lc = vec2(0.24*v_size.x, -0.17*v_size.y); vec2 ls = vec2(0.15*v_size.x, 0.10*v_size.y);',
    '      vec2 dq = abs(v_local.xy - lc) - ls;',
    '      float inside = 1.0 - step(0.0, max(dq.x, dq.y));',
    '      col = mix(col, vec3(0.97,0.96,0.92) * lit, inside);',
    '      float ln = step(abs(v_local.y - (lc.y + 0.035*v_size.y)), 0.007*v_size.y) + step(abs(v_local.y - (lc.y - 0.035*v_size.y)), 0.007*v_size.y);',
    '      col = mix(col, vec3(0.32,0.30,0.28), inside * clamp(ln, 0.0, 1.0) * 0.75);',
    '    }',
    '    col *= mix(0.84, 1.0, smoothstep(0.0, 0.045, ed));',
    '  } else if (kind == 4) {',
    '    float r = length(v_world.xz - u_gc.xz);',
    '    alpha = 1.0 - smoothstep(u_gr*0.40, u_gr, r);',
    '    col = v_color * (amb*0.95 + d1*0.22) * (1.0 + 0.10*(1.0 - smoothstep(0.0, u_gr*0.5, r)));',
    '  } else {',
    '    col = v_color * (0.92 + 0.5*v_misc.w);',
    '  }',
    '  float dist = length(v_world - u_eye);',
    '  col = mix(col, u_fog, smoothstep(40.0, 150.0, dist) * 0.45);',
    '  o = vec4(col * alpha, alpha);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  /* ---------- the renderer ---------- */
  function Renderer(canvas) {
    var gl = (this.gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true }));
    this.canvas = canvas;
    this.ok = !!gl;
    if (!gl) return;

    var prog = (this.prog = gl.createProgram());
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.u = {};
    ['u_vp', 'u_eye', 'u_fog', 'u_gc', 'u_gr', 'u_shadow'].forEach(function (n) { this.u[n] = gl.getUniformLocation(prog, n); }, this);

    // one unit cube: 6 faces x 4 vertices, with outward normals
    var faces = [
      { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
      { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
      { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] }
    ];
    var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    var verts = [], idx = [];
    faces.forEach(function (f, fi) {
      corners.forEach(function (c) {
        for (var k = 0; k < 3; k++) verts.push(f.n[k] * 0.5 + f.u[k] * c[0] * 0.5 + f.v[k] * c[1] * 0.5);
        verts.push(f.n[0], f.n[1], f.n[2]);
      });
      var b = fi * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    var geo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, geo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    var ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);

    this.opaque = new Instances(6000);
    this.soft = new Instances(1500);
    this.vaoO = this._makeVao(geo, ib);
    this.vaoS = this._makeVao(geo, ib);
    this.bufO = this.vaoO.buf; this.bufS = this.vaoS.buf;
  }

  Renderer.prototype._makeVao = function (geo, ib) {
    var gl = this.gl;
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, geo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, STRIDE * 4 * 16, gl.DYNAMIC_DRAW);
    var sz = [3, 3, 3, 4], off = [0, 12, 24, 36];
    for (var i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(2 + i);
      gl.vertexAttribPointer(2 + i, sz[i], gl.FLOAT, false, STRIDE * 4, off[i]);
      gl.vertexAttribDivisor(2 + i, 1);
    }
    gl.bindVertexArray(null);
    vao.buf = buf;
    return vao;
  };

  Renderer.prototype.resize = function (cssW, cssH, dpr) {
    var w = Math.max(2, Math.round(cssW * dpr)), h = Math.max(2, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.w = w; this.h = h;
  };

  Renderer.prototype.begin = function () { this.opaque.clear(); this.soft.clear(); };

  Renderer.prototype.render = function (vp, eye, p) {
    var gl = this.gl;
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.u_vp, false, vp);
    gl.uniform3fv(this.u.u_eye, eye);
    gl.uniform3fv(this.u.u_fog, p.fog);
    gl.uniform3fv(this.u.u_gc, p.gc);
    gl.uniform1f(this.u.u_gr, p.gr);
    gl.uniform3fv(this.u.u_shadow, p.shadow);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this._draw(this.vaoO, this.bufO, this.opaque, true);
    this._draw(this.vaoS, this.bufS, this.soft, false);
    gl.depthMask(true);
  };

  Renderer.prototype._draw = function (vao, buf, list, depthWrite) {
    var gl = this.gl;
    if (!list.count) return;
    gl.depthMask(depthWrite);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, list.data.subarray(0, list.count * STRIDE), gl.DYNAMIC_DRAW);
    gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, list.count);
    gl.bindVertexArray(null);
  };

  MD.Renderer = Renderer;
})();
