/* ==================================================================
   RXDSEC — AURA
   ------------------------------------------------------------------
   A raymarched participating medium: the shader walks a ray through a
   3D density field built from domain-warped fBm noise and accumulates
   colour front-to-back, the way real volumetric smoke is integrated.

   It runs OVER the hero artwork in screen blend, so it reads as light
   moving through that scene rather than a layer stacked on top of it.
   Deliberately restrained — the artwork is the subject, this is only
   atmosphere. Turn it down per section with data-power.
   ================================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("gl");
  if (!canvas) return;

  var gl =
    canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: "high-performance" }) ||
    canvas.getContext("experimental-webgl", { alpha: true });

  if (!gl) {
    canvas.style.display = "none";
    document.documentElement.classList.add("no-gl");
    return;
  }

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COARSE = !window.matchMedia("(pointer: fine)").matches || window.innerWidth < 820;

  var SCALE = COARSE ? 0.40 : 0.56;
  var VOL_STEPS = COARSE ? 20 : 34;
  var OCTAVES = COARSE ? 3 : 4;

  /* ================= program ================= */

  var VERT = ["attribute vec2 aPos;", "void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }"].join("\n");

  var FRAG = [
    "precision highp float;",
    "uniform vec2  uRes;",
    "uniform float uTime;",
    "uniform float uScroll;",
    "uniform vec2  uMouse;",
    "uniform vec3  uBg;",
    "uniform vec3  uCore;",
    "uniform vec3  uEdge;",
    "uniform float uDark;",
    "uniform float uPower;",
    "",
    /* ---------- helpers ---------- */
    "float hash31(vec3 p){",
    "  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));",
    "  p *= 17.0;",
    "  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));",
    "}",
    "",
    "float vnoise(vec3 x){",
    "  vec3 i = floor(x), f = fract(x);",
    "  f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),",
    "                 mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),",
    "             mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),",
    "                 mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);",
    "}",
    "",
    "mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }",
    "",
    "float fbm(vec3 p){",
    "  float a = 0.5, s = 0.0;",
    "  for (int i = 0; i < 5; i++) {",
    "    if (i >= " + OCTAVES + ") break;",
    "    s += a * vnoise(p); p *= 2.03; a *= 0.5;",
    "  }",
    "  return s;",
    "}",
    "",
    /* ---------- the volume ---------- */
    "float density(vec3 p, out float core){",
    "  vec3 q = p;",
    "  q.y -= uTime * 0.42;",
    "  float w = fbm(q * 0.55 + uTime * 0.045);",
    "  float d = fbm(q * 1.15 + w * 1.45);",
    "",
    "  float r = length(p.xz - vec2(-1.05, 0.0));",
    "  float column = smoothstep(2.70, 0.26, r) * (0.50 + 0.50 * smoothstep(0.0, 0.85, r));",
    "  float height = smoothstep(-2.6, -0.2, p.y) * smoothstep(6.0, 1.0, p.y);",
    "  float mist = smoothstep(-1.9, -0.55, p.y) * smoothstep(0.35, -0.7, p.y) * smoothstep(4.6, 0.6, r) * 0.55;",
    "",
    "  float shaped = clamp((d - 0.485) * 3.0, 0.0, 1.0);",
    "  core = shaped * column * height;",
    "  return (core + shaped * mist) * uPower;",
    "}",
    "",
    "void main(){",
    "  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;",
    "",
    "  vec3 ro = vec3(uMouse.x * 0.55, 0.75 + uMouse.y * 0.35, -6.6 + uScroll * 2.4);",
    "  vec3 rd = normalize(vec3(uv, 1.25));",
    "  rd.yz = rot(-0.045 - uMouse.y * 0.04) * rd.yz;",
    "",
    /* ---- pass 2: the volume, only as far as the surface ---- */
    "  float jitter = hash31(vec3(gl_FragCoord.xy, uTime));",
    "  float stepSize = 0.36;",
    "  float t = 1.2 + jitter * stepSize;",
    "  float limit = 16.0;",
    "",
    "  vec4 acc = vec4(0.0);",
    "  float glow = 0.0;",
    "",
    "  for (int i = 0; i < 48; i++) {",
    "    if (i >= " + VOL_STEPS + ") break;",
    "    if (acc.a > 0.96 || t > limit) break;",
    "    vec3 pos = ro + rd * t;",
    "    float core;",
    "    float dn = density(pos, core);",
    "    if (dn > 0.003) {",
    "      vec3 c = mix(uEdge, uCore, clamp(core * 1.8, 0.0, 1.0));",
    "      c = mix(c, vec3(1.0), pow(clamp(core, 0.0, 1.0), 3.0) * 0.55);",
    "      float a = clamp(dn * stepSize * 3.0, 0.0, 1.0);",
    "      acc.rgb += (1.0 - acc.a) * c * a;",
    "      acc.a   += (1.0 - acc.a) * a;",
    "      glow += core * 0.02;",
    "    }",
    "    t += stepSize;",
    "  }",
    "",
    /* ---- composite: volume over surface ---- */
    "  vec3 col = acc.rgb;",
    "  float alpha = acc.a;",
    "",
    "  col += uCore * glow * 0.42;",
    "  alpha += glow * 0.10;",
    "",
    // embers
    "  float embers = 0.0;",
    "  for (int L = 0; L < 3; L++) {",
    "    float fl = float(L);",
    "    float sc = 5.0 + fl * 4.0;",
    "    vec2 g = uv * sc;",
    "    g.y += uTime * (0.22 + fl * 0.12);",
    "    g.x += sin(uTime * 0.3 + fl) * 0.3;",
    "    vec2 cell = floor(g);",
    "    vec2 f = fract(g) - 0.5;",
    "    float hh = hash31(vec3(cell, fl));",
    "    if (hh > 0.955) {",
    "      float dd = length(f - (vec2(hash31(vec3(cell, fl + 9.0)), hash31(vec3(cell, fl + 21.0))) - 0.5) * 0.6);",
    "      embers += smoothstep(0.09, 0.0, dd) * (0.4 + 0.6 * (sin(uTime * 2.0 + hh * 30.0) * 0.5 + 0.5));",
    "    }",
    "  }",
    "  col += mix(uEdge, vec3(1.0), 0.35) * embers * 0.8;",
    "  alpha += embers * 0.5;",
    "",
    "  float base = smoothstep(0.85, 0.0, length(uv - vec2(0.0, -0.32)));",
    "  col += uCore * base * 0.14 * uPower;",
    "  alpha += base * 0.09 * uPower;",
    "",
    "  float vig = 1.0 - dot(uv, uv) * mix(0.30, 0.18, uDark);",
    "  col *= vig;",
    "  alpha *= vig;",
    "  alpha *= mix(0.72, 1.0, uDark);",
    "",
    "  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));",
    "}",
  ].join("\n");

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("[gl]", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) {
    canvas.style.display = "none";
    document.documentElement.classList.add("no-gl");
    return;
  }

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("[gl] link failed", gl.getProgramInfoLog(prog));
    canvas.style.display = "none";
    document.documentElement.classList.add("no-gl");
    return;
  }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  var U = {};
  ["uRes", "uTime", "uScroll", "uMouse", "uBg", "uCore", "uEdge", "uDark", "uPower"].forEach(function (n) {
    U[n] = gl.getUniformLocation(prog, n);
  });

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  /* ================= palette ================= */

  var palette = { bg: [0.043, 0.043, 0.047], core: [0.75, 0.89, 1.0], edge: [0.486, 0.247, 0.949], dark: 1 };

  function hexToRgb(h) {
    h = (h || "").trim().replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return null;
    var n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function readPalette() {
    var cs = getComputedStyle(document.documentElement);
    var bg = hexToRgb(cs.getPropertyValue("--gl-bg"));
    var edge = hexToRgb(cs.getPropertyValue("--gl-edge")) || hexToRgb(cs.getPropertyValue("--gl-a"));
    var core = hexToRgb(cs.getPropertyValue("--gl-core")) || hexToRgb(cs.getPropertyValue("--gl-b"));
    if (bg) palette.bg = bg;
    if (edge) palette.edge = edge;
    if (core) palette.core = core;
    palette.dark = document.documentElement.getAttribute("data-theme") === "dark" ? 1 : 0;
  }
  readPalette();
  new MutationObserver(readPalette).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  /* ================= size ================= */

  var W = 0,
    H = 0;

  function resize() {
    var w = Math.max(1, Math.floor(window.innerWidth * SCALE));
    var h = Math.max(1, Math.floor(window.innerHeight * SCALE));
    if (w === W && h === H) return;
    W = w;
    H = h;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", function () {
    setTimeout(resize, 250);
  });

  /* ================= input ================= */

  var mT = [0, 0],
    m = [0, 0];

  window.addEventListener(
    "pointermove",
    function (e) {
      mT[0] = (e.clientX / window.innerWidth - 0.5) * 2;
      mT[1] = -(e.clientY / window.innerHeight - 0.5) * 2;
    },
    { passive: true }
  );

  if (COARSE && window.DeviceOrientationEvent) {
    window.addEventListener(
      "deviceorientation",
      function (e) {
        if (e.gamma == null || e.beta == null) return;
        mT[0] = Math.max(-1, Math.min(1, e.gamma / 40));
        mT[1] = Math.max(-1, Math.min(1, (45 - e.beta) / 45));
      },
      { passive: true }
    );
  }

  var scrollT = 0,
    scroll = 0;
  var powerT = 1,
    power = 1;

  function readScroll() {
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollT = Math.min(1, Math.max(0, window.scrollY / max));

    var mid = window.innerHeight * 0.5;
    var p = 1;
    var secs = document.querySelectorAll("[data-power]");
    for (var i = 0; i < secs.length; i++) {
      var r = secs[i].getBoundingClientRect();
      if (r.top < mid && r.bottom > mid) {
        var v = parseFloat(secs[i].getAttribute("data-power"));
        if (!isNaN(v)) p = v;
        break;
      }
    }
    powerT = p;
  }

  var ticking = false;
  window.addEventListener(
    "scroll",
    function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        readScroll();
      });
    },
    { passive: true }
  );
  readScroll();

  /* ================= loop ================= */

  var t0 = performance.now();
  var last = t0;
  var visible = !document.hidden;
  var slow = 0;

  document.addEventListener("visibilitychange", function () {
    visible = !document.hidden;
    last = performance.now();
  });

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;

    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (dt > 0.045) slow++;
    else slow = Math.max(0, slow - 1);
    if (slow > 100 && SCALE > 0.28) {
      SCALE = 0.28;
      slow = -1e6;
      W = H = 0;
      resize();
    }

    scroll += (scrollT - scroll) * 0.05;
    power += (powerT - power) * 0.05;
    m[0] += (mT[0] - m[0]) * 0.05;
    m[1] += (mT[1] - m[1]) * 0.05;

    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uTime, reduced ? 4.0 : (now - t0) / 1000);
    gl.uniform1f(U.uScroll, scroll);
    gl.uniform2f(U.uMouse, m[0], m[1]);
    gl.uniform3fv(U.uBg, palette.bg);
    gl.uniform3fv(U.uCore, palette.core);
    gl.uniform3fv(U.uEdge, palette.edge);
    gl.uniform1f(U.uDark, palette.dark);
    gl.uniform1f(U.uPower, power);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(function (n) {
    last = n;
    frame(n);
  });

  document.documentElement.classList.add("has-gl");
})();
