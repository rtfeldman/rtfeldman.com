# How Our Rust-to-Zig Rewrite is Going

<aside class="timestamp">
    <time datetime="2026-07-15">July 15, 2026</time>
</aside>

<hr />

For the past year and a half, the team building [Roc](https://www.roc-lang.org/)'s compiler has been rewriting our 300,000 lines of Rust code into [Zig](https://ziglang.org/), for reasons I'll recap below. We recently passed an exciting milestone: feature parity with the original compiler!

Since the Bun project recently shared [an experience report](https://bun.com/blog/bun-in-rust) of their rewrite in the other direction (from Zig to Rust, although that's only the tip of the iceberg of differences between our rewrites), this seems like a nice time to reflect on how our move from Rust to Zig is going.

## Passing Feature Parity

Hitting this milestone made it possible to update [Brendan Hansknecht](https://github.com/bhansconnect)'s charming 2024 [WASM-4](https://wasm4.org/) game, [Rocci Bird](https://github.com/lukewilliamboswell/roc-wasm4/blob/d4161199b0a8afd55d24c30dae304b8a0358f433/examples/rocci-bird.roc) (with art by Luke DeVault) to use the new compiler. It's a nice example because the whole game is under a thousand lines of Roc code, and you can [play it on itch.io](https://itch.io) or right here via [WebAssembly](https://webassembly.org/):

<div class="rocci-embed" style="margin:1rem 0 1.5rem;text-align:center">
<canvas id="rocci-bird-screen" width="160" height="160" tabindex="0" style="width:min(360px,90vw);height:min(360px,90vw);image-rendering:pixelated;background:#071821;border-radius:6px;outline:none;cursor:pointer;touch-action:none"></canvas>
<div style="font-size:.85rem;opacity:.65;margin-top:.5rem">Click the game, then press <kbd>Space</kbd> to flap (or tap it on a touchscreen).</div>
<script>
// Self-contained WASM-4 runtime for Rocci Bird. Drawing routines and the 8x8
// font are ported from the reference WASM-4 web runtime; the cart is fetched
// from /assets/rocci-bird.wasm and run entirely client-side.
(function () {
  var W = 160, H = 160;
  var ADDR_PALETTE = 0x04, ADDR_DRAW_COLORS = 0x14, ADDR_GAMEPAD1 = 0x16;
  var ADDR_SYSTEM_FLAGS = 0x1f, ADDR_FRAMEBUFFER = 0xa0;
  var SYSTEM_PRESERVE_FRAMEBUFFER = 1;

  function b64ToBytes(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  var FONT = b64ToBytes("///////////Hx8fPz//P/5OTk///////kwGTk5MBk//vgy+D6QPv/51bN+/ZtXP/jycnjyUzgf/Pz8////////Pnz8/P5/P/n8/n5+fPn///k8cBx5P////n54Hn5//////////Pz5////+B////////////z8///fv379+/f//Hszk5OZvH/+fH5+fn54H/gznxw4cfAf+B8+fD+TmD/+PDkzMB8/P/Az8D+fk5g//Dnz8DOTmD/wE58+fPz8//hzsbh2F5g/+DOTmB+fOH///Pz//Pz////8/P/8/Pn//z58+fz+fz////Af8B////n8/n8+fPn/+DATnzx//H/4N9RVVBf4P/x5M5OQE5Of8DOTkDOTkD/8OZPz8/mcP/BzM5OTkzB/8BPz8DPz8B/wE/PwM/Pz//wZ8/MTmZwf85OTkBOTk5/4Hn5+fn54H/+fn5+fk5g/85MycPByMx/5+fn5+fn4H/OREBASk5Of85GQkBITE5/4M5OTk5OYP/Azk5OQM/P/+DOTk5ITOF/wM5OTEHIzH/hzM/g/k5g/+B5+fn5+fn/zk5OTk5OYP/OTk5EYPH7/85OSkBARE5/zkRg8eDETn/mZmZw+fn5/8B8ePHjx8B/8PPz8/Pz8P/f7/f7/f7/f+H5+fn5+eH/8eT/////////////////wHv9///////////g/mBOYH/Pz8DOTk5g////4E/Pz+B//n5gTk5OYH///+DOQE/g//x54Hn5+fn////gTk5gfmDPz8DOTk5Of/n/8fn5+eB//P/4/Pz8/OHPz8xAwcjMf/H5+fn5+eB////A0lJSUn///8DOTk5Of///4M5OTmD////Azk5Az8///+BOTmB+fn//5GPn5+f////gz+D+QP/5+eB5+fn5////zk5OTmB////mZmZw+f///9JSUlJgf///zkBxwE5////OTk5gfmD//8B48ePAf/z5+fP5+fz/+fn5+fn5+f/n8/P58/Pn////49F4///////////k5P/gykpESkpg/+DOQkRITmD//////////////////////+DESF9IRGD/4MRCX0JEYP/gxE5VRERg/+DERFVORGD////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////5//n58fHx//vgykvKYPv/8OZnwOfnwH//6Xb29ul//+ZmcOB54Hn/+fn5//n5+f/w5mH2+GZw/+T/////////8O9Zl5eZr3Dh8OTw///////yZMnk8n/////gfn5///////////////DvUZaRlq9w4P/////////79fv///////n54Hn5/+B/8fz58P/////w+fzx//////37///////////MzMzMwk/wZW1lcH19f/////Pz/////////////fP58fnw//////Hk5PH//////8nk8mTJ///vTu3rdmxff+9O7ep3btx/x271y3ZsX3/x//HnzkBg//f78eTOQE5//fvx5M5ATn/x5PHkzkBOf/Lp8eTOQE5/5P/x5M5ATn/79fHkzkBOf/BhychBych/8OZPz+Zw/fP3+8BPwM/Af/37wE/Az8B/8eTAT8DPwH/k/8BPwM/Af/v94Hn5+eB//fvgefn54H/58OB5+fngf+Z/4Hn5+eB/4eTmQmZk4f/y6cZCQEhMf/f74M5OTmD//fvgzk5OYP/x5ODOTk5g//Lp4M5OTmD/5P/gzk5OYP//7vX79e7//+DOTEpGTmD/9/vOTk5OYP/9+85OTk5g//Hk/85OTmD/5P/OTk5OYP/9++ZmcPn5/8/Azk5OQM//8OZmZOZiZP/3++D+YE5gf/374P5gTmB/8eTg/mBOYH/y6eD+YE5gf+T/4P5gTmB/+/Xg/mBOYH///+D6YEvg////4E/P4H3z9/vgzkBP4P/9++DOQE/g//Hk4M5AT+D/5P/gzkBP4P/3+//x+fngf/37//H5+eB/8eT/8fn54H/k//H5+fngf+bh2eDOTmD/8unAzk5OTn/3++DOTk5g//374M5OTmD/8eTgzk5OYP/y6eDOTk5g/+T/4M5OTmD///n/4H/5/////+DMSkZg//f7zk5OTmB//fvOTk5OYH/x5P/OTk5gf+T/zk5OTmB//fvOTk5gfmDPz8DOTkDPz+T/zk5OYH5gw==");

  var memory = new WebAssembly.Memory({ initial: 1, maximum: 1 });
  var u8 = new Uint8Array(memory.buffer);
  var dv = new DataView(memory.buffer);
  var fb = new Uint8Array(memory.buffer, ADDR_FRAMEBUFFER, (W * H) >>> 2);
  function drawColors() { return dv.getUint16(ADDR_DRAW_COLORS, true); }

  function drawPoint(color, x, y) {
    var idx = (W * y + x) >>> 2, shift = (x & 0x3) << 1, mask = 0x3 << shift;
    fb[idx] = (color << shift) | (fb[idx] & ~mask);
  }
  function drawPointU(color, x, y) { if (x >= 0 && x < W && y >= 0 && y < H) drawPoint(color, x, y); }
  function hlineFast(color, startX, y, endX) {
    var fillEnd = endX - (endX & 3), fillStart = Math.min((startX + 3) & ~3, fillEnd);
    if (fillEnd - fillStart > 3) {
      for (var xx = startX; xx < fillStart; xx++) drawPoint(color, xx, y);
      fb.fill(color * 0x55, (W * y + fillStart) >>> 2, (W * y + fillEnd) >>> 2);
      startX = fillEnd;
    }
    for (var x2 = startX; x2 < endX; x2++) drawPoint(color, x2, y);
  }
  function hlineU(color, startX, y, endX) {
    if (y >= 0 && y < H) { if (startX < 0) startX = 0; if (endX > W) endX = W; if (startX < endX) hlineFast(color, startX, y, endX); }
  }
  function drawHLine(x, y, len) { var d = drawColors() & 0xf; if (d === 0) return; hlineU((d - 1) & 0x3, x, y, x + len); }
  function drawVLine(x, y, len) {
    if (y + len <= 0 || x < 0 || x >= W) return;
    var d = drawColors() & 0xf; if (d === 0) return;
    var sY = Math.max(0, y), eY = Math.min(H, y + len), sc = (d - 1) & 0x3;
    for (var yy = sY; yy < eY; yy++) drawPoint(sc, x, yy);
  }
  function drawRect(x, y, width, height) {
    var sX = Math.max(0, x), sY = Math.max(0, y), eXU = x + width, eYU = y + height;
    var eX = Math.max(0, Math.min(eXU, W)), eY = Math.max(0, Math.min(eYU, H));
    var dcv = drawColors(), dc0 = dcv & 0xf, dc1 = (dcv >>> 4) & 0xf, yy;
    if (dc0 !== 0) { var fc = (dc0 - 1) & 0x3; for (yy = sY; yy < eY; ++yy) hlineFast(fc, sX, yy, eX); }
    if (dc1 !== 0) {
      var st = (dc1 - 1) & 0x3;
      if (x >= 0 && x < W) for (yy = sY; yy < eY; ++yy) drawPoint(st, x, yy);
      if (eXU > 0 && eXU <= W) for (yy = sY; yy < eY; ++yy) drawPoint(st, eXU - 1, yy);
      if (y >= 0 && y < H) hlineFast(st, sX, y, eX);
      if (eYU > 0 && eYU <= H) hlineFast(st, sX, eYU - 1, eX);
    }
  }
  function drawOval(x, y, width, height) {
    var dcv = drawColors(), dc0 = dcv & 0xf, dc1 = (dcv >>> 4) & 0xf;
    if (dc1 === 0xf) return;
    var st = (dc1 - 1) & 0x3, fc = (dc0 - 1) & 0x3;
    var a = width - 1, b = height - 1, b1 = b % 2;
    var north = y + Math.floor(height / 2), west = x, east = x + width - 1, south = north - b1;
    var a2 = a * a, b2 = b * b, dx = 4 * (1 - a) * b2, dy = 4 * (b1 + 1) * a2, err = dx + dy + b1 * a2;
    a = 8 * a2; b1 = 8 * b2;
    do {
      drawPointU(st, east, north); drawPointU(st, west, north); drawPointU(st, west, south); drawPointU(st, east, south);
      var start = west + 1, len = east - start;
      if (dc0 !== 0 && len > 0) { hlineU(fc, start, north, east); hlineU(fc, start, south, east); }
      var e2 = 2 * err;
      if (e2 <= dy) { north += 1; south -= 1; dy += a; err += dy; }
      if (e2 >= dx || e2 > dy) { west += 1; east -= 1; dx += b1; err += dx; }
    } while (west <= east);
    while (north - south < height) {
      drawPointU(st, west - 1, north); drawPointU(st, east + 1, north); north += 1;
      drawPointU(st, west - 1, south); drawPointU(st, east + 1, south); south -= 1;
    }
  }
  function drawLine(x1, y1, x2, y2) {
    var d = drawColors() & 0xf; if (d === 0) return;
    var sc = (d - 1) & 0x3, s;
    if (y1 > y2) { s = x1; x1 = x2; x2 = s; s = y1; y1 = y2; y2 = s; }
    var dx = Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1, dy = y2 - y1, err = (dx > dy ? dx : -dy) / 2, e2;
    for (;;) {
      drawPointU(sc, x1, y1);
      if (x1 === x2 && y1 === y2) break;
      e2 = err;
      if (e2 > -dx) { err -= dy; x1 += sx; }
      if (e2 < dy) { err += dx; y1++; }
    }
  }
  function blit(sprite, dstX, dstY, width, height, srcX, srcY, srcStride, bpp2, flipX, flipY, rotate) {
    var dcv = drawColors(), cXMin, cYMin, cXMax, cYMax;
    if (rotate) {
      flipX = !flipX;
      cXMin = Math.max(0, dstY) - dstY; cYMin = Math.max(0, dstX) - dstX;
      cXMax = Math.min(width, H - dstY); cYMax = Math.min(height, W - dstX);
    } else {
      cXMin = Math.max(0, dstX) - dstX; cYMin = Math.max(0, dstY) - dstY;
      cXMax = Math.min(width, W - dstX); cYMax = Math.min(height, H - dstY);
    }
    for (var y = cYMin; y < cYMax; y++) {
      for (var x = cXMin; x < cXMax; x++) {
        var tx = dstX + (rotate ? y : x), ty = dstY + (rotate ? x : y);
        var sx = srcX + (flipX ? width - x - 1 : x), sy = srcY + (flipY ? height - y - 1 : y);
        var colorIdx, bitIndex = sy * srcStride + sx, byte, shift;
        if (bpp2) { byte = sprite[bitIndex >>> 2]; shift = 6 - ((bitIndex & 0x03) << 1); colorIdx = (byte >>> shift) & 0x3; }
        else { byte = sprite[bitIndex >>> 3]; shift = 7 - (bitIndex & 0x7); colorIdx = (byte >>> shift) & 0x1; }
        var dc = (dcv >>> (colorIdx << 2)) & 0x0f;
        if (dc !== 0) drawPoint((dc - 1) & 0x03, tx, ty);
      }
    }
  }
  function drawText(arr, x, y) {
    var cx = x;
    for (var i = 0, len = arr.length; i < len; ++i) {
      var cc = arr[i];
      if (cc === 0) return;
      else if (cc === 10) { y += 8; cx = x; }
      else if (cc >= 32 && cc <= 255) { blit(FONT, cx, y, 8, 8, 0, (cc - 32) << 3, 8, false, false, false, false); cx += 8; }
      else cx += 8;
    }
  }

  var decoder = new TextDecoder();
  function strZ(ptr) { var e = ptr; while (u8[e] !== 0) e++; return u8.subarray(ptr, e); }
  var DISK_KEY = "rocci-bird-disk";
  var audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }
  function tone(frequency, duration, volume, flags) {
    if (!audioCtx) return;
    try {
      var startFreq = frequency & 0xffff, endFreq = (frequency >>> 16) & 0xffff;
      var sustain = duration & 0xff, release = (duration >>> 8) & 0xff, decay = (duration >>> 16) & 0xff, attack = (duration >>> 24) & 0xff;
      var sustainVol = (volume & 0xff) / 100, peakVol = (((volume >>> 8) & 0xff) || (volume & 0xff)) / 100, channel = flags & 0x3;
      var F = 1 / 60, t0 = audioCtx.currentTime, tA = t0 + attack * F, tD = tA + decay * F, tS = tD + sustain * F, tR = tS + release * F;
      var osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = channel === 2 ? "triangle" : channel === 3 ? "sawtooth" : "square";
      osc.frequency.setValueAtTime(startFreq, t0);
      if (endFreq && endFreq !== startFreq) osc.frequency.linearRampToValueAtTime(endFreq, tR);
      var peak = Math.max(0.0001, peakVol * 0.25), sus = Math.max(0.0001, sustainVol * 0.25);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(peak, tA);
      gain.gain.linearRampToValueAtTime(sus, tD);
      gain.gain.setValueAtTime(sus, tS);
      gain.gain.linearRampToValueAtTime(0.0001, tR);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0); osc.stop(tR + 0.02);
    } catch (e) {}
  }

  var env = {
    memory: memory,
    blit: function (sp, x, y, w, h, f) { blit(new Uint8Array(memory.buffer, sp), x, y, w, h, 0, 0, w, f & 1, f & 2, f & 4, f & 8); },
    blitSub: function (sp, x, y, w, h, sx, sy, st, f) { blit(new Uint8Array(memory.buffer, sp), x, y, w, h, sx, sy, st, f & 1, f & 2, f & 4, f & 8); },
    line: function (a, b, c, d) { drawLine(a, b, c, d); },
    hline: function (x, y, l) { drawHLine(x, y, l); },
    vline: function (x, y, l) { drawVLine(x, y, l); },
    oval: function (x, y, w, h) { drawOval(x, y, w, h); },
    rect: function (x, y, w, h) { drawRect(x, y, w, h); },
    text: function (ptr, x, y) { drawText(strZ(ptr), x, y); },
    textUtf8: function (ptr, len, x, y) { drawText(u8.subarray(ptr, ptr + len), x, y); },
    textUtf16: function (ptr, byteLen, x, y) { var a = []; for (var i = 0; i < byteLen; i += 2) a.push(dv.getUint16(ptr + i, true)); drawText(a, x, y); },
    tone: tone,
    diskr: function (ptr, size) {
      var s = null; try { s = localStorage.getItem(DISK_KEY); } catch (e) {}
      if (!s) return 0;
      var bytes = b64ToBytes(s), n = Math.min(size, bytes.length);
      u8.set(bytes.subarray(0, n), ptr); return n;
    },
    diskw: function (ptr, size) {
      var bytes = u8.slice(ptr, ptr + size), bin = "";
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      try { localStorage.setItem(DISK_KEY, btoa(bin)); } catch (e) { return 0; }
      return size;
    },
    trace: function (ptr) { console.log(decoder.decode(strZ(ptr))); },
    traceUtf8: function (ptr, len) { console.log(decoder.decode(u8.subarray(ptr, ptr + len))); },
    traceUtf16: function (ptr, byteLen) { var s = ""; for (var i = 0; i < byteLen; i += 2) s += String.fromCharCode(dv.getUint16(ptr + i, true)); console.log(s); }
  };

  var canvas = document.getElementById("rocci-bird-screen");
  var ctx = canvas.getContext("2d");
  var img = ctx.createImageData(W, H);
  var px = new Uint32Array(img.data.buffer);

  var KEYMAP = { KeyX: 1, Space: 1, KeyZ: 2, KeyC: 2, ArrowLeft: 16, ArrowRight: 32, ArrowUp: 64, ArrowDown: 128 };
  var held = {}, pointerBtn = 0;
  canvas.addEventListener("keydown", function (e) { if (e.code in KEYMAP) { held[e.code] = 1; ensureAudio(); e.preventDefault(); } });
  canvas.addEventListener("keyup", function (e) { if (e.code in KEYMAP) { held[e.code] = 0; e.preventDefault(); } });
  canvas.addEventListener("pointerdown", function (e) { canvas.focus(); ensureAudio(); pointerBtn = 1; e.preventDefault(); });
  window.addEventListener("pointerup", function () { pointerBtn = 0; });
  function gamepad() { var b = pointerBtn; for (var k in KEYMAP) if (held[k]) b |= KEYMAP[k]; return b; }

  function render() {
    var pal = new Uint32Array(memory.buffer, ADDR_PALETTE, 4);
    for (var i = 0; i < W * H; i++) {
      var c = pal[(fb[i >> 2] >> ((i & 3) << 1)) & 3];
      px[i] = 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff);
    }
    ctx.putImageData(img, 0, 0);
  }

  fetch("/assets/rocci-bird.wasm").then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
    return WebAssembly.instantiate(buf, { env: env });
  }).then(function (res) {
    var start = res.instance.exports.start, update = res.instance.exports.update;
    new Uint32Array(memory.buffer).set([0xe0f8cf, 0x86c06c, 0x306850, 0x071821], ADDR_PALETTE >> 2);
    dv.setUint16(ADDR_DRAW_COLORS, 0x1203, true);
    if (typeof start === "function") start();
    render();
    var STEP = 1000 / 60, acc = 0, prev = performance.now();
    function loop(now) {
      requestAnimationFrame(loop);
      acc += now - prev; prev = now;
      if (acc > 250) acc = 250;
      var ran = false;
      while (acc >= STEP) {
        acc -= STEP;
        u8[ADDR_GAMEPAD1] = gamepad();
        if (!(u8[ADDR_SYSTEM_FLAGS] & SYSTEM_PRESERVE_FRAMEBUFFER)) fb.fill(0);
        if (typeof update === "function") update();
        ran = true;
      }
      if (ran) render();
    }
    requestAnimationFrame(loop);
  }).catch(function (err) {
    canvas.insertAdjacentHTML("afterend", "<div style='font-size:.85rem;color:#c0392b'>Couldn't load Rocci Bird: " + err + "</div>");
  });
})();
</script>
</div>

Rocci Bird's updated source code is a bit more concise than [the original](https://github.com/lukewilliamboswell/roc-wasm4/blob/a769ade51cbd4613b4fca468764c9034f9c8070c/examples/rocci-bird.roc), and `roc build --opt=size` now outputs a 31KB wasm binary. (The original compiler produced a binary more than double that size.) Rocci Bird is by no means a large code base, but getting it to run at all required landing a *lot* of features in the new compiler. Seeing those chunky purple pixels brought a smile to my face when we finally got there!

This is a wonderful milestone to have reached, and I'm extremely grateful to all the people who came together to make this happen. I want to thank some in particular who have been especially helpful in getting the language and compiler to this point:

* [Anthony Bullard](https://github.com/gamebox) and [Sam Mohr](https://github.com/smores56) for collaborating on the new parser  
* [Jared Ramirez](https://github.com/jaredramirez) for the new type-checker (among many other things!)  
* [Ayaz Hafiz](https://github.com/ayazhafiz/) for [the new lambda set resolution system](https://github.com/ayazhafiz/cor/), plus tons of the original compiler  
* [Aurélien Geron](https://github.com/ageron) for hand-updating 108 (!) beginner exercises in [the Roc Exercism course](https://exercism.org/tracks/roc) he originally created  
* [Stephan](https://github.com/stephdin) for getting the compiler's new "echo" platform running in the browser, so that anyone can now write *and* run basic Roc programs from the [roc-lang.org](https://roc-lang.org) homepage via a 2.5MB WebAssembly binary!  
* [Niclas Åhdén](https://github.com/niclas-ahden), Roc's most prolific production user, for patiently filing helpful bug reports and giving actionable feedback about the upgrade process  
* [JRI98](https://github.com/JRI98) for methodically reproducing and investigating fuzzer errors and other bugs, closing out issues that no longer reproduced, and more  
* [Jasper Woudenberg](https://github.com/jwoudenberg) for iterating on API designs for userspace packages using the new compiler  
* [Folkert de Vries](https://github.com/folkertdev), [Brendan Hansknecht](https://github.com/bhansconnect), [Brian Carroll](https://github.com/brian-carroll), [Josh Warner](https://github.com/joshuawarner32), [Agus Zubiaga](https://github.com/agu-z), and [Jelle Teeuwissen](https://github.com/JTeeuwissen) for building the foundation of the original compiler, without which the new compiler never would have existed  
* I've saved the undisputed biggest contributors to the new compiler for last: [Anton-4](https://github.com/Anton-4) and [Luke Boswell](https://github.com/lukewilliamboswell/) for so many things I can't even keep track of them all—compiler work, builtins, platforms, packages, examples, fixing bugs, helping beginners on Roc Zulip…enumerating it all could take up a whole second post! It's been incredible seeing how much you've built.

Thank you all so much! I feel honored that you've put so much of your valuable time into this project. Also thanks to our past and present sponsors—[rwx](https://www.rwx.com/), [Lambda Class](https://lambdaclass.com/), [ohne-makler](https://www.ohne-makler.net/), [martian](https://withmartian.com/), [tweede golf](https://tweedegolf.nl), [Vendr](https://www.vendr.com/), [NoRedInk](https://www.noredink.com/), and many [generous individual sponsors](https://github.com/sponsors/roc-lang/)—who have helped get us to this point by [supporting our contributors](https://roc-lang.org/donate).

Speaking of time: our 487-day rewrite took 476 days longer than [Bun's 11-day rewrite](https://bun.com/blog/bun-in-rust) from their million lines of Zig into a million lines of Rust. There are many reasons for this difference which have nothing to do with Rust or Zig, including the fact that theirs was a direct port whereas we'd decided to rewrite *because* of how much we were going to change. [The techniques they used](https://bun.com/blog/bun-in-rust#claude-rewrite-bun-in-rust) wouldn't have worked in our case.

The laundry list of changes we made also means comparing our original Rust code base and new Zig code base won't be apples-to-apples. Still, we've reached a nice point to reflect on how the rewrite has gone, both in terms of what new features it has unlocked for Roc programmers, as well as how our experiences with Rust and Zig have compared.

## Hot Code Loading + Cross-Compiled Binaries

Roc's new compiler automatically does hot code loading during development. For example, I can run `roc server.roc` to start a Web server, then change some of its code while it's running. The next time that server handles a request, it'll automatically be handled using the new code. Here it is in action, both in a server and in a simple 2D game:

<video class="inline-video" controls preload="metadata" playsinline>
    <source src="/assets/hot-loading.mp4" type="video/mp4">
    <a href="/assets/hot-loading.mp4">Download the hot-loading demo video.</a>
</video>

Hot loading is standard behavior for interpreted languages like Python, but not so much for high-performance compiled languages like Roc. When I'm ready to deploy, `roc build server.roc` gets me an LLVM-optimized, self-contained binary that I can drop onto a machine and run. Roc also cross-compiles; building a static binary that runs on Alpine Linux is as simple as `roc build --target=x64musl`, and that command will produce the same output bytes (for the same input source code bytes) when run on a Mac or any other system—which [not all compilers guarantee](https://xeiaso.net/notes/2026/anubis-wasm-vendor-binary/).

## Pattern Matching with String Interpolation

The HTTP request-handling logic from that video looks like this:

<pre><samp class="code-snippet"><span class="comment"># Starts up the server; initializes a database and logger</span>
<span class="comment"># based on environment variables.</span>
init! <span class="kw">=</span> <span class="kw">|</span>env<span class="punctuation separator">,</span> _args<span class="kw">|</span> <span class="punctuation section">{</span>
    <span class="punctuation section">{</span> log_level<span class="punctuation separator">,</span> db_credentials <span class="punctuation section">}</span> <span class="kw">=</span> env.parse()<span class="kw">?</span>

    db <span class="kw">=</span> init_db!(db_credentials)<span class="kw">?</span>
    log <span class="kw">=</span> init_logger!(log_level)<span class="kw">?</span>

    <span class="comment"># (other such initializations would happen here)</span>

    <span class="upperident">Ok</span><span class="punctuation section">(</span><span class="punctuation section">{</span> db<span class="punctuation separator">,</span> log <span class="punctuation section">}</span><span class="punctuation section">)</span>
<span class="punctuation section">}</span>

<span class="comment"># Handles an incoming HTTP request (HTTP verb,</span>
<span class="comment"># path, headers, body) using the db and log that</span>
<span class="comment"># we initialized during init!()</span>
handle_req! <span class="kw">=</span> <span class="kw">|</span><span class="punctuation section">{</span> db<span class="punctuation separator">,</span> log <span class="punctuation section">}</span><span class="punctuation separator">,</span> verb<span class="punctuation separator">,</span> path<span class="punctuation separator">,</span> headers<span class="punctuation separator">,</span> body<span class="kw">|</span> <span class="punctuation section">{</span>
    auth_token <span class="kw">=</span> headers.x_auth_token
    user_agent <span class="kw">=</span> headers.user_agent

    app <span class="kw">=</span> <span class="upperident">App</span>.init<span class="punctuation section">(</span><span class="punctuation section">{</span> auth_token<span class="punctuation separator">,</span> user_agent<span class="punctuation separator">,</span> db<span class="punctuation separator">,</span> log <span class="punctuation section">}</span><span class="punctuation section">)</span><span class="kw">?</span>

    <span class="kw">match</span> <span class="punctuation section">(</span>verb<span class="punctuation separator">,</span> path<span class="punctuation section">)</span> <span class="punctuation section">{</span>
        <span class="punctuation section">(</span><span class="upperident">GET</span><span class="punctuation separator">,</span> <span class="string">"/users/</span><span class="kw">${</span>id<span class="kw">}</span><span class="string">"</span><span class="punctuation section">)</span> <span class="kw">=&gt;</span> app.user_profile!(id)
        <span class="punctuation section">(</span><span class="upperident">GET</span><span class="punctuation separator">,</span> <span class="string">"/users/</span><span class="kw">${</span>id<span class="kw">}</span><span class="string">/</span><span class="kw">${</span>page<span class="kw">}</span><span class="string">"</span><span class="punctuation section">)</span> <span class="kw">=&gt;</span> <span class="kw">match</span> page <span class="punctuation section">{</span>
            <span class="string">""</span> <span class="kw">|</span> <span class="string">"profile"</span> <span class="kw">=&gt;</span> app.user_profile!(user_id)
            <span class="string">"settings"</span> <span class="kw">=&gt;</span> app.user_settings!(user_id)
            <span class="string">"posts/</span><span class="kw">${</span>post_id<span class="kw">}</span><span class="string">"</span> <span class="kw">=&gt;</span> <span class="punctuation section">{</span>
                app.user_post!(user_id<span class="punctuation separator">,</span> post_id)
            <span class="punctuation section">}</span>
            _ <span class="kw">=&gt;</span> app.not_found!(verb<span class="punctuation separator">,</span> path)
        <span class="punctuation section">}</span>
        <span class="punctuation section">(</span><span class="upperident">POST</span><span class="punctuation separator">,</span> <span class="string">"/posts/new"</span><span class="punctuation section">)</span> <span class="kw">=&gt;</span> <span class="punctuation section">{</span>
            app.new_post!(body)
        <span class="punctuation section">}</span>
        _ <span class="kw">=&gt;</span> app.not_found!(verb<span class="punctuation separator">,</span> path)
    <span class="punctuation section">}</span>
<span class="punctuation section">}</span></samp></pre>

This uses several features we introduced in the new compiler. For example, that `"/users/${id}"` syntax is not implemented with [parsing template strings at runtime](https://expressjs.com/en/guide/routing/#route-parameters), but rather with a new language feature: string interpolation inside pattern matching.

Not only is this type-safe at compile time, this entire code snippet performs *zero heap allocations*. (We even have a regression test which sends various requests to a HTTP server running this code, and the test fails if the server attempts a single heap allocation at any time.) I'd expect the typical language that ships with hot code loading to average closer to 1 allocation per line of code here…but Roc is aiming high on ergonomics, type safety, *and* performance!

In what will become a recurring theme, hot code loading is innately memory-unsafe. We generate arbitrary machine instructions and have the CPU execute them—already memory-unsafe, but that's every compiler's job—and on top of that, we swap out some instructions for others while the compiled program is still running. There's a lot to get right, and we appreciate all the help we can get from our tools!

## Why a Scratch-Rewrite?

Unlike Rust, C, and Zig, Roc is not a systems language; it has automatic memory management (using reference counting, both to avoid tracing collector pauses and also for [Perceus optimizations](https://www.microsoft.com/en-us/research/wp-content/uploads/2020/11/perceus-tr-v4.pdf) and opportunistic mutation [like Koka's](https://koka-lang.github.io/koka/doc/book.html#sec-fbip)). Roc would have *way* more heap allocations if it needed one heap allocation per closure capture (like most non-systems languages do), but our closure captures don't heap-allocate because Roc is the first non-academic language to implement [polymorphic defunctionalization through lambda set specialization](https://www.cs.princeton.edu/~mpmilano/publication/lss/).

This might sound like a niche optimization, but in a functional language like Roc, defunctionalization turns out to be similar to [inlining](https://en.wikipedia.org/wiki/Inline_expansion) in that it unlocks a treasure trove of follow-up optimizations. Although this system proved incredibly beneficial to Roc's runtime performance, it also proved incredibly difficult for us to implement correctly. We [struggled with nasty bugs](https://shows.acast.com/software-unscripted/episodes/664fde448c77cc0013b3338a) in the original implementation, and only after [Ayaz Hafiz prototyped a new architecture in OCaml](https://github.com/ayazhafiz/cor/) were we able to finally get it right in the new compiler.

Ayaz's prototype showed that the root of our problems was architectural across several compiler phases, and fixing it would require rewriting most of the compiler. This was one reason we decided to rewrite in the first place—that, and several contributors independently mentioning they planned to rewrite various parts of the compiler for other reasons. We realized we were about to rewrite almost all of the compiler anyway, so it made sense to consider a full rewrite as an alternative to the [Ship of Theseus](https://en.wikipedia.org/wiki/Ship_of_Theseus) approach.

Compilers are unusual in that scratch-rewrites are the norm among successful projects. It's often the only way to [self-host](https://en.wikipedia.org/wiki/Self-hosting_\(compilers\)), although not all compilers rewrite into their own language; see for example [TypeScript's rewrite to Go](https://devblogs.microsoft.com/typescript/typescript-native-port/). My position has always been that [Roc's compiler should not self-host](https://www.roc-lang.org/faq#self-hosted-compiler), so the idea that someday the benefits of a rewrite might seem to outweigh [their notorious costs](https://www.joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/) had frankly never occurred to me.

The more we talked about it, the more sense it made to do what basically every popular compiler today has done at some point: rewrite from scratch.

## Why Zig?

Once we'd decided to scratch-rewrite, the next question was whether to choose Rust again. Based on our experiences with both Rust and Zig ([we were already using Zig](https://www.youtube.com/watch?v=jIZpKpLCOiU) for a bunch of primitives in our standard library), [we decided to build the entire compiler in Zig this time](https://gist.github.com/rtfeldman/77fb430ee57b42f5f2ca973a3992532f).

I enjoy Rust, [I've taught a course on it](https://frontendmasters.com/courses/rust/), and I happily use it daily for my work at [Zed](https://zed.dev/). Despite what Internet comments might have us believe, it's extremely normal for one language to be the best fit for one project, while a different language turns out to be the best fit for a different project. One size does not actually fit all!

I've talked in depth about our reasons for going with Zig elsewhere—[in writing](https://gist.github.com/rtfeldman/77fb430ee57b42f5f2ca973a3992532f), [on podcasts](https://www.youtube.com/watch?v=E0n82muHMcM), and so on—and we only seriously considered Rust and Zig, because those were the only languages our team knew well enough. (Roc's standard library has been [written in Zig](https://youtu.be/jIZpKpLCOiU?si=ueY5kfKu1p7I7L4c) for years.) The biggest considerations on our minds when deciding between Rust and Zig were:

* **Build times.** Our `cargo` build times were a major pain point, even for incremental builds, and getting worse as our code base grew. We expected build times in a Zig rewrite to be much faster.
* **Memory control.** We use a variety of different memory allocators throughout compilation, especially arenas, and struct-of-arrays layouts all over the place. Rust's ecosystem consistently assumes one global allocator, including [soa\_rs](https://docs.rs/soa-rs/latest/soa_rs/). Zig's whole ecosystem assumes granular allocators, and struct-of-arrays support is standard.
* **Ecosystem relevance.** Rust's ecosystem is much bigger than Zig's overall…but almost no packages in either ecosystem are relevant to our particular needs. For the niche things we wanted to get off the shelf—such as a faster way to emit LLVM bitcode than wrapping LLVM's C++ library—more of that code existed in Zig than in Rust.
* **Memory-unsafety assistance.** Rust is designed to isolate memory-unsafe code inside rare `unsafe` blocks, and use things like [miri](https://github.com/rust-lang/miri) or [Valgrind](https://valgrind.org/) to vet those. Memory-unsafe code wasn't rare for us, though (more on this later) and we ended up with about 1,200 uses of `unsafe` (out of our 300K lines of Rust code; compare to about 40,000 uses of `unsafe` in [rust](https://github.com/rust-lang/rust/)'s 3.5M lines, and remember that for compilers which emit machine code, like `roc` and `rustc`, doing memory-unsafe things is a big part of the job). Zig has [more features than Rust for making memory-unsafe code work correctly](https://zackoverflow.dev/writing/unsafe-rust-vs-zig/), and that was the area where we wanted the most help.

After a year and a half of rewriting, how did our expectations of Zig's benefits line up with the reality of what we got? And which parts of Rust did we end up missing once we no longer had access to them?

## Life Without Borrow-Checking

Let's start with memory safety. There's [a famous 2019 Microsoft presentation](https://github.com/Microsoft/MSRC-Security-Research/blob/master/presentations/2019_02_BlueHatIL/2019_01%20-%20BlueHatIL%20-%20Trends%2C%20challenge%2C%20and%20shifts%20in%20software%20vulnerability%20mitigation.pdf) that says, on slide 10:

> ~70% of the vulnerabilities addressed through a security update each year continue to be memory safety issues.

The presentation's next slide has a breakdown by type of memory safety issue, which paints the following picture when it comes to Rust and Zig specifically:

- 83.6% of vulnerabilities addressed through a security update in 2018 would have been *completely unaffected by the choice of Rust or Zig*, because both languages handle all of these scenarios (out-of-bounds reads/write, unsafe casts, uninitialized reads, stack overflows, and non-memory-safety issues) in the same way.
- 16.4% of the vulnerabilities were specifically use-after-free errors. These could have been caught by Zig's [`ReleaseSafe`](https://ziglang.org/documentation/master/#toc-ReleaseSafe) runtime memory-safety checks, or Rust's borrow checker, or the checks [Fil-C](https://fil-c.org/) uses, and so on. Modern languages offer a variety of ways to help catch UAFs, but these languages represented a tiny fraction of all systems language code running in 2018.

[`ReleaseSafe`](https://ziglang.org/documentation/master/#toc-ReleaseSafe) catches use-after-free errors through runtime checks which panic if the program tries to use freed memory. Compared to [Rust's safe subset](https://doc.rust-lang.org/nomicon/meet-safe-and-unsafe.html), Zig's checks [are less comprehensive](https://github.com/ziglang/zig/issues/3180), have a runtime cost, and can panic. That said, Zig with `ReleaseSafe` has worked great in practice for the [TigerBeetle](https://tigerbeetle.com/) database, which recently underwent a legendarily meticulous [Jepsen report that found only two safety bugs](https://tigerbeetle.com/blog/2025-06-06-fuzzer-blind-spots-meet-jepsen/), neither related to memory safety.

[`ReleaseFast`](https://ziglang.org/documentation/master/#toc-ReleaseFast) skips these checks in production builds to avoid their overhead, but keeps them in debug builds and tests to catch memory-safety issues during development. If your tests covered every possible real-world code path, `ReleaseFast` would give you the same level of memory safety as `ReleaseSafe`, but that level of test coverage is rarely practical; the real question is what slips through the coverage cracks in practice. Bun talked about their struggles with use-after-frees, but other widely-used projects building with `ReleaseFast` have had no CVEs caused by memory unsafety in their Zig code. [Ghostty](https://ghostty.org/) [is one](https://app.opencve.io/cve/?vendor=ghostty), and Zig's compiler itself [is another](/todo/link/to/this).

> If you want to learn more about these projects, I've recorded in-depth conversations with their creators: [Joran Greef on TigerBeetle](https://youtu.be/8br5QcmYq84?si=qi7z2z8nSUKxiWlL), [Mitchell Hashimoto on Ghostty](https://youtu.be/ljoNEH39lyw?si=fnm0emKYj5eH3sPP), and [Andrew Kelley on Zig](https://youtu.be/w74rC-6caxE?si=_THc5UBxeyc4nMe-).

Rust code has a different source of memory-safety gaps: the `unsafe` sections that nearly every Rust program has somewhere in its dependencies. [Unsafe Rust](https://doc.rust-lang.org/book/ch20-01-unsafe-rust.html) has all the memory unsafety risk of `ReleaseFast` Zig code, but none of the runtime checks to catch issues during development. So there's less of it, but you get less help with it. The Rust ecosytsem does have [miri](https://github.com/rust-lang/miri) to find bugs in non-FFI `unsafe` code, and [Valgrind](https://valgrind.org/) can help too, but both are opt-in and only a small percentage of Rust projects use either. That said, the cultural norm of using `unsafe` rarely, and auditing it extra carefully, has worked out well enough to earn Rust a strong reputation for memory safety in practice.

Of course, Rust memory unsafety errors can and do still slip through the cracks. [Deno](https://deno.com), a Bun competitor which is written in Rust, has had memory-unsafety CVEs including an [out-of-bounds read](https://osv.dev/vulnerability/GHSA-c25x-cm9x-qqgx) as well as a [use-after-free](https://osv.dev/vulnerability/GHSA-3j27-563v-28wf), both involving the use of Unsafe Rust. [Rocket](https://rocket.rs/), a Rust Web Framework, has had a [use-after-free CVE](https://osv.dev/vulnerability/GHSA-vcw4-8ph6-7vw8), and [Actix](https://actix.rs/), has had a variety of memory-unsafety CVEs from a period when its use of `unsafe` was abnormally high.

When we were deciding between Rust and Zig for the new compiler, we were aware of all of this. We knew Rust had a well-deserved reputation for memory safety, but that memory unsafety could still happen, and we'd experienced all of that firsthand with the original compiler. We also knew we'd be using `unsafe` way more than typical Rust projects, and even though we were already using Valgrind, getting help with innately memory-unsafe code from Zig's additional checks sounded appealing. We wanted the hard stuff to get easier, and we weren't worried about use-after-free issues in a compiler where allocations would be overwhelmingly done in arenas with straightforward lifetimes.

We knew high-profile Zig projects had achieved great performance *and* memory safety in practice, and we decided to aim for becoming another of those success stories.

## Memory Safety Post-Rewrite

It's easy to theorize about how things will go with a particular technology choice, but where the rubber meets the road is what end users encounter in real-world usage. So how has Zig with `ReleaseFast` worked out for us in practice? How many memory corruption incidents—from use-after-frees or any other cause—have we seen since rewriting our compiler from Rust to Zig?

Here's a breakdown of bug reports in [Roc's issue tracker](https://github.com/roc-lang/roc/issues), as classified by Claude Opus 4.8:

| Type of bug in Roc's compiler | Rust | Zig |
| :---- | :---- | :---- |
| Bug where memory corruption occurred | 21 | 10 |
| Bug where no memory corruption occurred | 2,575 | 421 |
| Total | 2,596 | 431 |

You might be wondering how the Rust-based compiler had any memory corruption bugs at all, let alone more than double the total count of the Zig-based one. Is it because of that pesky Unsafe Rust again?

Actually, no. None of those 21 memory corruption bugs occurred in the compiler's logic itself, which is a testament to Rust's borrow-checker working as intended. The reason we had memory corruption bugs in our Rust-based compiler is that *it's a compiler.*

Compilers emit machine instructions. When a machine executes those instructions, they can cause memory corruption, resulting in memory corruption bug reports from the people who experienced them. Regardless of which process had the bug—the compiler or compiled program—in both cases the processor only did the bad thing because the compiler told it to. And in both cases the fix is the same: the compiler's code must change, since that code was what caused the memory corruption.

Just like every compiler, ours has had bugs, and some of those have been miscompilations that led to memory corruption. That said, while 8 of the 10 memory corruption bugs in the Zig-based compiler were also miscompilations, the remaining 2 were in the compiler itself. Both were use-after-free bugs in error reporting, with the same symptom: filenames in error messages ([one in `roc check`](https://github.com/roc-lang/roc/issues/8943) and [the other in `roc bundle`](https://github.com/roc-lang/roc/issues/8606)) rendered as useless [question-mark-in-diamond characters](https://unicodeplus.com/U+FFFD). Rust's borrow checker would have caught both.

Now let's suppose we had instead chosen Rust for our rewrite, or Zig with `ReleaseSafe`. What would have been the impact in practice, holding all else equal?

| Tooling Choice | Memory-safety impact in practice |
| :---- | :---- |
| Zig with `ReleaseFast` | 2 bug reports: some error messages fail to render filenames  |
| Zig with `ReleaseSafe` | 2 bug reports: some error messages panic instead of rendering at all |
| Rust's borrow checker | neither of these bug reports |

After 18 months of development, hundreds of total bug reports, and hundreds of thousands of lines of code, my main takeaway from retrospecting on this table is that picking a different row would have made no appreciable difference to the project. So far our choice has gotten us the outcome we'd hoped for.

As I noted earlier, every project has different needs. When Bun rewrote in the opposite direction—from Zig to Rust—[their accompanying post](https://bun.com/blog/bun-in-rust#just-be-really-smart-and-don-t-make-mistakes) noted:

> For Bun, correctly handling the lifetimes of garbage-collected values \[from JavaScript\] and manually-managed values has been a major source of stability issues - most often small memory leaks and occasionally, crashes. Every memory allocation has to be meticulously reviewed. Where do these bytes get freed? How do we ensure it only gets freed once? Did we check for JavaScript exceptions properly? Is this garbage-collected pointer visible to the conservative stack scanner? Is this garbage collected memory or manually managed memory?

Roc's compiler doesn't have these particular challenges because it doesn't interface with JavaScript or any other tracing garbage collector. For Bun, "use-after-free, double-free, and 'forgot to free'" errors have been "a large percentage of bugs," whereas errors like these have been a small percentage of Roc's bugs. And of course Roc's compiler faces other challenges that Bun doesn't. Different projects have different needs!

In our case, I'm not sure how I could look back at what's actually happened and conclude that what we needed was a bigger investment in tooling to prevent memory safety bugs *in the compiler itself.* There's a much stronger case that we would benefit from better tooling to catch memory safety bugs *in our compiled output*, which has always been out of scope for the borrow checker.

## Build Times

We wanted faster builds from Zig. Did we get them?

Well, the good news is that `zig build --watch -fincremental` can rebuild a change to our current ~450K lines of Zig code in about 35 milliseconds. That's even faster than what we were hoping for when we considered Zig's build speed a selling point for the rewrite!

The bad news is that Zig's current stable 0.16.0 release has a bug that breaks `-fincremental` on our code base. [The fix](https://codeberg.org/ziglang/zig/pulls/35533) already landed, but to get it we'd have to build on a [nightly 0.17.0 prerelease build](https://ziglang.org/download/) (which has breaking language changes), along with vendoring and upgrading our affected dependencies to 0.17.0. We decided to wait for the next stable release instead.

As of the last commit that had Rust sources in our code base, here's a timing comparison on my Intel desktop machine running Ubuntu 26 for building cold (no cache, but packages downloaded locally) compared to doing an incremental rebuild after making a trivial edit to our parser:

| Roc Compiler Version | LoC | Cold Build | Incremental |
| :---- | :---- | :---- | :---- |
| Original on Rust 1.85.0 | 354K | 32.4s | 10.0s |
| Original on Rust 1.97.0 | 354K | 25.4s | 3.4s |
| Rewrite at feature parity on Zig 0.16.0 | 320K | 39.6s | 8.6s |
| Rewrite today on Zig 0.17.0 | 464K | 32.1s | 0.035s |

> Note that our Zig build configuration as of the feature-parity commit was rebuilding rarely-changing artifacts on every build that we later decided to rebuild only on demand. That's why today's cold builds are faster than they were back at 300K LoC, even though our lines of code have increased by ~50% since then.

Rust 1.97 is the current stable release today, and 1.85 was the current stable release 487 days ago (the time our rewrite took to reach to feature parity). So if we'd stayed on Rust for the same duration, we could have seen our incremental build times decrease from 10 seconds to 3.4. That's a big jump! I really appreciate all the hard work that Rust contributors have done to improve build times. Eliminating 2/3 of our incremental build times over 18 months would have been a very welcome change if we'd stayed on Rust, and it's a bigger improvement than I would have anticipated in an 18-month period. Bravo!

As impressive as that improvement is, Zig's 35ms is still way ahead. Not only is it 1/100th the build time of 3.4 seconds, it's also in [a different performance category](https://www.youtube.com/watch?v=-jy4HaNEJCo&t=279s)—and that 35ms is on a Zig code base with ~50% more lines of code than the Rust one that got 3.4s. I expect Roc's code base to keep growing, and for this gap to keep growing with it; I've never heard of any initiative on Rust's roadmap comparable to `-fincremental`.

So while our decision to remain on stable 0.16.0 (plus how many of our contributors run Mac laptops with ARM processors; `-fincremental` only works on x86-64 CPUs right now) means we haven't yet reaped the anticipated build-time rewards of choosing Zig for the rewrite, we certainly have something to look forward to in the next stable Zig release!

## Memory Control: Zero-Parse Deserialization

Roc's new on-disk caching system uses a technique I first learned about from Zig's compiler, and which Casey Muratori told me is common practice in game programming. It relies on the happy coincidence that if you're organizing your memory in the way that runs fastest on modern hardware anyway, you can also load it from disk directly into memory and start using it without parsing anything.

Here's how it works:

* All of our compiler data structures are represented as arrays with 32-bit [indices over pointers](https://joegm.github.io/blog/indices-not-pointers/) (and often in [structure-of-arrays](https://en.wikipedia.org/wiki/AoS_and_SoA) form).
* This not only saves memory and runs faster, it also means our data structures can be written directly to disk without needing to be serialized into a different format first.
* The bigger benefit is that this lets us *deserialize* them back into memory without parsing the on-disk bytes in any way. We load the bytes into memory, do some relocations to point our existing data structures to the newly-loaded arrays, and we're ready to go.
* This means we deserialize at the speed of loading the bytes from disk into memory—so, [*actually* I/O bound](https://shows.acast.com/software-unscripted/episodes/664fde448c77cc0013b33399). If those bytes are already in the operating system's disk cache, it means we load cached work from previous builds at roughly the speed of [memcpy](https://www.man7.org/linux/man-pages/man3/memcpy.3.html).

When you run `roc check` twice in a row, the first time it caches all of its outputs on disk using this strategy. The second time, if the input source code files haven't changed, all the parsed/type-checked/etc. data structures jump straight from disk into memory. It's *extremely* fast. `roc test` similarly caches the outcomes for tests of pure functions (which are deterministic), and all of this is done with file-level granularity, so if you change one file you'll only be paying for redoing work of that file and any others that depend on it.

This zero-parse deserialization strategy only works because we're following this [programming without pointers](https://www.hytradboi.com/2025/05c72e39-c07e-41bc-ac40-85e8308f2917-programming-without-pointers) style for all of our compiler data structures. If we instead used pointers everywhere (like almost all compilers do), deserialization couldn't be zero-parse.

This approach has safety risks, however. Similarly to how a pointer in memory can point to the wrong address (e.g. leading to a use-after-free), any index can be used as a lookup into the wrong array at runtime, at which point you end up with whatever random bytes happened to be at that location. Rust's borrow checker is designed to help with pointer lifetimes, but it doesn't attempt to answer the question "which index goes with which array?" because that has never been in scope for its design.

If you know exactly how many of these arrays you need up front, the Rust crate [`compact_arena`](https://docs.rs/compact_arena/0.5.0/compact_arena/) can help you avoid indexing into the wrong array by generating type tags with a macro. Unfortunately, if you *can't* know exactly how many you need up front (e.g. because it varies by number of modules, as it does in our use case), this technique doesn't work. That's why `compact_arena` [marks `SmallArena::new`  as `unsafe`](https://docs.rs/compact_arena/0.5.0/compact_arena/struct.SmallArena.html#method.new).

Personally I wouldn't label `SmallArena::new` as unsafe. `unsafe` is supposed to mark the parts of your code base that should be audited extra-carefully, and creating an empty arena doesn't need auditing because it can't cause unsafety. Unfortunately, the potentially-unsafe operation is indexing into an array, which comes up *constantly*. "Audit every part of your code base extra carefully" is not great advice, and neither is "avoid this technique that massively improves performance" when Zig itself has shown that a spotless memory-safety CVE record is achievable while doing exactly this.

[Safe Rust](https://doc.rust-lang.org/nomicon/meet-safe-and-unsafe.html) is effective in practice because it assumes that the amount of Unsafe Rust in your code base is small and isolated, and that assumption holds for the vast majority of Rust code bases. But if `unsafe` is going to be pervasive, like in our case, the assuption no longer holds, and it starts to sound more appealing to choose [a language that's safer than Unsafe Rust](https://zackoverflow.dev/writing/unsafe-rust-vs-zig/).

## Ecosystem Relevance

The Bun post talks about how Rust's [`Drop`](https://doc.rust-lang.org/std/ops/trait.Drop.html) could help with their unusual JavaScript inetrop challenges:

> [...] other users of Zig don't have the bugs we had, and mixing GC with manually-managed memory is an uncommon enough thing for software to need that no language really designs for it. [...] One common way to reduce this class of issue is to ensure cleanup code is always run exactly once for code that needs it. Zig is designed to be a simple language with no hidden control flow, and so it prefers the explicit `defer` keyword to run code at the end of a scope over C++'s implicit ~Destructor or Rust's implicit `Drop`.

Our project is in almost the opposite boat: `Drop` has been a pain point for us because the Rust ecosystem is built around the assumption that everyone is using a global allocator and using `Drop` for implicit deallocation. But we want to be doing almost the opposite: separate [arenas](https://en.wikipedia.org/wiki/Region-based_memory_management) for each module and stage of compilation. Zig's ecosystem consistently passes around allocators, which is exactly what we want, whereas off-the-shelf Rust crates almost always assume a single global allocator.

Simply put, Rust's ecosystem is optimized for the way Bun wants to be written, whereas Zig's is designed for the way Roc wants to be written.

Separately, there's the question of what relevant code we can access off the shelf. LLVM is a critical dependency for our optimizer (we do our own optimizations, but LLVM does more on top), but it's also a project that makes major breaking API changes on a regular basis. Upgrading to new LLVM versions has been a major source of pain and lost time for Roc, but we keep doing it because we want the new optimizations.

As it turns out, LLVM actually has a stable and backwards-compatible API that can be accessed to bypass this upgrade pain: its serialized "bitcode" format. If you write your own LLVM bitcode serializer, then you can tell each new version of LLVM to consume that, and you're off to the races. 

Of course, to access this strategy, you need a handwritten LLVM bitcode serializer that's decoupled from the LLVM C++ library and its breaking changes. I only know of one implementation of such a thing in the wild: Zig's compiler, which of course is written in Zig. And now there are two implementations in the wild, because Roc's new compiler is reusing that same Zig code. (Thanks for sharing it, Zig team!)

Future considerations are relevant here too. Right now our final compiler executable is about 25MB of our own stuff and then over 100MB of LLVM and lld. They also both run very slowly, but today there's no viable alternative out there which does those jobs.

I only know of one project that aims to replace both of those dependencies with fast, modern alternatives. Any guesses? Yeah, it's the Zig team. They want it for their own compiler, for the same reasons we do, and there's no Rust equivalent I've ever heard of being developed.

You might have noticed that the biggest source of dependencies we're interested in from the Zig ecosystem is the Zig compiler itself. This is unusual, but Roc is an unusual project with unusual needs. When I wrote the first line of code in the compiler back in 2019, I would not have guessed that the following would prove true: "In the future, the richest gold mine of reusable code for this project will be an open-source compiler written in a language you haven't heard of yet."

Life is full of surprises!

## Things I Miss From Rust

Even though I'm no longer using Rust for Roc, I remain immersed in the Rust world because I work at [Zed](https://zed.dev/), where we use it for pretty much everything. So when I say I miss something from Rust when building with Zig (or vice versa), it's not just rose-tinted memories of a distant past; it's more like memories from earlier in the same day.

Something I was surprised to find myself missing from Rust is automatic allocation and deallocation in *tests.*

As discussed earlier, having full control over allocations and deallocations is what I want in our compiler's implementation. And in tests, I also appreciate the testing allocators detecting leaks—it can even detect leaks in compiled Roc code! Unfortunately, to get that benefit requires a lot of "init this, defer deinit" code in tests that has to be correct or else the test fails on a memory leak. None of that is necessary in Rust. I care more about the compiler's implementation being the way I want it than the tests looking nicer, but in a perfect world I could somehow have both.

Both [parametric polymorphism](https://en.wikipedia.org/wiki/Parametric_polymorphism) and [ad hoc polymorphism](https://en.wikipedia.org/wiki/Ad_hoc_polymorphism) overlap with `comptime`, so it makes sense that Zig doesn't have them, but I do miss them. For example, Rust's [Allocator trait](https://doc.rust-lang.org/std/alloc/trait.Allocator.html) has its allocate function taking "self" at its first argument, whereas in Zig, allocator implementations [like ArenaAllocator](https://github.com/ziglang/zig/blob/738d2be9d6b6ef3ff3559130c05159ef53336224/lib/std/heap/arena_allocator.zig#L185-L186) need to receive an `anyopaque` pointer and then cast it to itself. 

I also miss private struct fields. I understand the reasoning for not having them, but I miss getting a compile error if I use something that is marked as "not supposed to be accessed directly like this, even though it can be done if you really want to." This comes up when reviewing a diff, because in the diff I just see the field access; I don't see the docs on the original struct definition, and I don't want to go out of my way to look them up defensively every time.

Occasionally I miss functions and variables and constants all using `snake_case`.

I do miss aspects of `unsafe` and the borrow checker, even though their upsides come packaged with downside I don't miss. I don't think Zig should add either of these, but at the same time there is something calming about only worrying about certain classes of problems inside `unsafe` blocks. I can miss that feeling even while not wanting to pay the corresponding costs in this project.

I'm not sure how much of this is because of the way `comptime` works, but I certainly find myself being surprised to discover dead code in our Zig code base (which was caught by neither Zig's built-in tooling nor [TigerBeetle's tidy.zig](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/src/tidy.zig)—by the way, thanks for open-sourcing that, TigerBeetle team!) more often than I'm used to from Rust. Dead Zig code doesn't affect end users because the compiler doesn't even emit it into the binary, but obviously it would be better for our code base if we discovered it earlier. 

Finally, the Rust team does an admirable job with backwards compatibility in their releases. Upgrading to new minor releases barely took any effort, and even edition upgrades were mostly painless. Backwards-compatibility is a non-goal for Zig in its current stage of development, which is something we knew about going in and expected. It hasn't been a big problem for us, but do I miss the trivial upgrade process we had in Rust? Of course!

## Things I Enjoy About Zig

I've always enjoyed the *subtractive* aspect of functional programming. You'd think that subtracting tools from my toolbox that I'm accustomed to reaching for (e.g. mutation, unrestricted side effects, objects and classes) would be frustrating…but once I got used to the different techniques, I really came to enjoy the new properties I had unlocked (cacheability, non-flaking tests, concurrency niceties, reordering operations with no fear that their outputs might change, etc.) and no longer wanted to give *those* up.

I have similar feelings about Zig. I like that it doesn't have macros. I may miss ad hoc polymorphism, but at the same time I enjoy how many problems (including parametric polymorphism) can be addressed by comptime and/or an ordinary function.

I love the control over data layouts. It's great having out-the-box access to number types that aren't a power of 2, like [u7 and u5](https://github.com/roc-lang/roc/blob/012eb3d50f3cd0673a653e1b9bc4f653dbee1eb2/src/builtins/dec.zig#L93-L96), without having to do any bit-level work myself. [Packed structs](https://github.com/roc-lang/roc/blob/012eb3d50f3cd0673a653e1b9bc4f653dbee1eb2/src/base/Ident.zig#L102) out-the-box, the option to inline functions at the call site instead of the declaration site…these are things you can get from Rust crates using macros, but I really like having them available without needing a separate dependency.

Zig's build toolchain is second to none, which is presumably [why Uber uses it](https://www.uber.com/us/en/blog/bootstrapping-ubers-infrastructure-on-arm64-with-zig/) even though they don't use Zig the language. Building self-contained binaries for things like Alpine Linux and WebAssembly has gone really well, even though we're doing weird stuff like compiling part of our code base (the "builtins"—Roc's standard library, essentially) into an opaque binary blob and including it in the final executable.

I also really like [Zig's error-handling strategy](https://ziglang.org/documentation/0.16.0/#Switching-on-Errors), and especially how failed heap allocations are normal userspace errors. Roc has a similar "errors naturally accumulate" strategy (except using anonymous sum types that can have payloads), and I like both of those strategies better than [anyerror](https://docs.rs/anyhow/latest/anyhow/), [thiserror](https://docs.rs/thiserror/latest/thiserror/), or vanilla no-dependency error handling in Rust with [Result](https://doc.rust-lang.org/std/result/enum.Result.html). (That said, I do prefer Rust's postfix unary ? operator over Zig's `try` keyword, which is why we adopted the postfix unary ? operator in Roc.)

Then of course there's all the project-specific stuff which I mentioned earlier: allocator-based APIs everywhere, an ecosystem of high-performance compiler goodies that we can't find anywhere else, and so on. I won't rehash them all here, but I very much enjoy them in addition to appreciating the benefits they've had to the project.

I've had a very positive experience with Zig all around, and looking back I'm really happy that we chose it for our rewrite!

## What's Next for Roc

We aim to land version 0.1.0 of the new compiler later this year, which will be Roc's first-ever numbered release. You're welcome to try out a [Nightly build](https://roc-lang.org/install/) before then, although in its current state you can still expect a variety of bugs, incomplete features, and unfinished docs. I have a lot of documentation to write between now and then!

By the way, the [Roc Programming Language Foundation](https://roc-lang.org/foundation) is a [501(c)(3) nonprofit](https://en.wikipedia.org/wiki/501\(c\)\(3\)_organization), so [donations](https://roc-lang.org/donate) are tax-free in the US, and we use donations primarily to compensate contributors. If you know of an organization that would like to sponsor our work, financially or in other ways, please [get in touch](https://roc-lang.org/donate)! (Separately, if you know anyone at GitHub who could get us into [GH for Nonprofits](https://github.com/solutions/industry/nonprofits), that would be a huge help with our CI backlog.)

Thank you again to everyone who has helped the language reach this milestone. I couldn't be more excited for the next one: our first-ever numbered release! If you'd like to follow along, ask questions, or just come say hi, feel free to come chat with us on [Roc Zulip](roc.zulipchat.com/).
