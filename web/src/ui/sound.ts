// Sound design, synthesised live with the Web Audio API so it works offline and
// inside the published page. If the local server has an ElevenLabs key, generated
// clips replace the synthesised one-shots (see server/app.py /api/sfx).
import type { Biome } from "../sky/landscape";

type Ambient = { stop: () => void };

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private ambientBus!: GainNode;
  private fxBus!: GainNode;
  private ambient: Ambient | null = null;
  private ambientKey = "";
  private noiseBuf: AudioBuffer | null = null;
  private brownBuf: AudioBuffer | null = null;
  private clips = new Map<string, AudioBuffer | null>();
  enabled = true;

  /** Browsers only allow audio after a click or key press. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    this.ambientBus = this.ctx.createGain();
    this.ambientBus.gain.value = 0.55;
    this.ambientBus.connect(this.master);
    this.fxBus = this.ctx.createGain();
    this.fxBus.connect(this.master);
    this.noiseBuf = this.makeNoise(false);
    this.brownBuf = this.makeNoise(true);
    if (this.pending) this.setAmbient(...this.pending);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.2);
  }

  private makeNoise(brown: boolean) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else d[i] = w;
      }
    }
    return buf;
  }

  private noise(brown = false, loop = true) {
    const s = this.ctx!.createBufferSource();
    s.buffer = brown ? this.brownBuf : this.noiseBuf;
    s.loop = loop;
    return s;
  }

  // ------------------------------------------------------------------ ambience
  private pending: [Biome, number] | null = null;

  setAmbient(biome: Biome, lightPollution: number) {
    this.pending = [biome, lightPollution];
    if (!this.ctx) return;
    const key = `${biome}|${lightPollution > 0.3}`;
    if (key === this.ambientKey) return;
    this.ambientKey = key;
    this.ambient?.stop();
    this.ambient = this.buildAmbient(biome, lightPollution);
  }

  private buildAmbient(biome: Biome, lp: number): Ambient {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(1, t0 + 3);
    out.connect(this.ambientBus);
    const nodes: AudioScheduledSourceNode[] = [];
    const timers: number[] = [];

    // wind: filtered noise with slow gusts
    const strength = { ice: 1, tundra: 0.85, desert: 0.55, mountains: 0.75, grassland: 0.5, savanna: 0.45, mesozoic: 0.4, cenozoic: 0.4, forest: 0.3, jungle: 0.2 }[biome] ?? 0.4;
    const wind = this.noise(false);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = biome === "ice" || biome === "tundra" ? 520 : 340;
    bp.Q.value = biome === "ice" ? 2.2 : 0.8;
    const wg = ctx.createGain();
    wg.gain.value = 0.05 * strength;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.035 * strength;
    lfo.connect(lfoGain).connect(wg.gain);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.045;
    const lfo2g = ctx.createGain();
    lfo2g.gain.value = 180;
    lfo2.connect(lfo2g).connect(bp.frequency);
    wind.connect(bp).connect(wg).connect(out);
    nodes.push(wind, lfo, lfo2);

    // night insects in warm, green places
    if (biome === "forest" || biome === "jungle" || biome === "savanna" || biome === "grassland" || biome === "mesozoic" || biome === "cenozoic") {
      const chirp = () => {
        const t = ctx.currentTime;
        const f = biome === "mesozoic" ? 3100 + Math.random() * 600 : 4300 + Math.random() * 900;
        const n = 2 + Math.floor(Math.random() * 4);
        const pan = ctx.createStereoPanner();
        pan.pan.value = Math.random() * 1.6 - 0.8;
        pan.connect(out);
        for (let k = 0; k < n; k++) {
          const o = ctx.createOscillator();
          o.frequency.value = f;
          const g = ctx.createGain();
          const st = t + k * 0.09;
          g.gain.setValueAtTime(0, st);
          g.gain.linearRampToValueAtTime(0.012 * (biome === "jungle" ? 1.4 : 1), st + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, st + 0.06);
          o.connect(g).connect(pan);
          o.start(st);
          o.stop(st + 0.08);
        }
      };
      timers.push(window.setInterval(() => Math.random() < 0.7 && chirp(), biome === "jungle" ? 220 : 480));
    }
    // a living Mesozoic: far-off rumbles of the volcano and deep calls
    if (biome === "mesozoic") {
      timers.push(window.setInterval(() => {
        if (Math.random() < 0.35) this.rumble(out, 2.5 + Math.random() * 3, 0.08, 70);
        if (Math.random() < 0.25) this.call(out);
      }, 5000));
    }
    // modern towns: a low traffic hum
    if (lp > 0.3) {
      const hum = this.noise(true);
      const lp2 = ctx.createBiquadFilter();
      lp2.type = "lowpass";
      lp2.frequency.value = 180;
      const hg = ctx.createGain();
      hg.gain.value = 0.05 * lp;
      hum.connect(lp2).connect(hg).connect(out);
      nodes.push(hum);
    }
    for (const n of nodes) n.start();
    return {
      stop: () => {
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setTargetAtTime(0, t, 0.6);
        for (const n of nodes) n.stop(t + 3);
        for (const id of timers) clearInterval(id);
        setTimeout(() => out.disconnect(), 3500);
      },
    };
  }

  private rumble(dest: AudioNode, dur: number, level: number, cutoff: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const n = this.noise(true);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(dest);
    n.start(t);
    n.stop(t + dur + 0.1);
  }

  /** A distant, low animal call: a falling formant through a resonant filter. */
  private call(dest: AudioNode) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(95 + Math.random() * 40, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 2.2);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 260;
    f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.018, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    o.connect(f).connect(g).connect(pan).connect(dest);
    o.start(t);
    o.stop(t + 2.5);
  }

  // ------------------------------------------------------------------ one-shots
  /** The sky sweeping through time: a deep swell, a rush of air and a glassy choir. dir -1 = past, +1 = future. */
  rewind(dur: number, dir = -1) {
    if (!this.ctx || !this.enabled) return;
    if (this.playClip("rewind", 0.8)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const peak = t + dur * 0.45;
    // rush of air, panned across the way the sky moves
    const n = this.noise(false);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(160, t);
    bp.frequency.exponentialRampToValueAtTime(2800, peak);
    bp.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, peak);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(-0.8 * dir, t);
    pan.pan.linearRampToValueAtTime(0.8 * dir, t + dur);
    n.connect(bp).connect(g).connect(pan).connect(this.fxBus);
    n.start(t);
    n.stop(t + dur + 0.1);
    // sub swell you feel more than hear
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(38, t);
    sub.frequency.linearRampToValueAtTime(62, peak);
    sub.frequency.linearRampToValueAtTime(34, t + dur);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, t);
    sg.gain.linearRampToValueAtTime(0.22, peak);
    sg.gain.linearRampToValueAtTime(0, t + dur);
    sub.connect(sg).connect(this.fxBus);
    sub.start(t);
    sub.stop(t + dur + 0.1);
    // choir of detuned voices gliding down into the past, up into the future
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.exponentialRampToValueAtTime(2600, peak);
    lp.frequency.exponentialRampToValueAtTime(400, t + dur);
    lp.connect(this.fxBus);
    const glide = dir < 0 ? 0.5 : 1.5;
    for (const [f0, det] of [[220, 0], [220, 9], [330, -7], [440, 5], [554.4, -4], [660, 11]]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * glide, t + dur);
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.014, peak);
      og.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    // arrival: a soft bell as the sky settles
    for (const [f0, lvl] of [[523.25, 0.05], [784, 0.03], [1046.5, 0.02]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f0;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t + dur - 0.05);
      og.gain.linearRampToValueAtTime(lvl, t + dur);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dur + 2.4);
      o.connect(og).connect(this.fxBus);
      o.start(t + dur - 0.05);
      o.stop(t + dur + 2.5);
    }
    if (navigator.vibrate) navigator.vibrate([30, 60, 30]);
  }

  private scrubNode: { g: GainNode; bp: BiquadFilterNode } | null = null;
  /** Live sound while dragging the time dial: louder and brighter the faster the sky moves (0..1). */
  scrub(level: number) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    if (!this.scrubNode) {
      const n = this.noise(false);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.1;
      const g = ctx.createGain();
      g.gain.value = 0;
      n.connect(bp).connect(g).connect(this.fxBus);
      n.start();
      this.scrubNode = { g, bp };
    }
    const v = Math.min(1, Math.max(0, level));
    this.scrubNode.g.gain.setTargetAtTime(v * 0.16, ctx.currentTime, 0.08);
    this.scrubNode.bp.frequency.setTargetAtTime(240 + v * 2200, ctx.currentTime, 0.08);
  }

  /** A bolide tearing through the air, growing louder as it falls. */
  bolide(dur = 3.2) {
    if (!this.ctx || !this.enabled) return;
    if (this.playClip("bolide", 1)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.6;
    const n = this.noise(true);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(120, t);
    lp.frequency.exponentialRampToValueAtTime(1800, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    n.connect(lp).connect(g).connect(this.fxBus);
    n.start(t);
    n.stop(t + dur + 0.1);
    // crackle of ablation
    for (let i = 0; i < 40; i++) {
      const st = t + (i / 40) * dur * (0.6 + Math.random() * 0.4);
      const c = this.noise(false, false);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.08 * (i / 40), st);
      cg.gain.exponentialRampToValueAtTime(0.0001, st + 0.03);
      c.connect(cg).connect(this.fxBus);
      c.start(st, Math.random() * 3, 0.04);
    }
  }

  /** Flash and blast: a sub-bass hit, then the slower ground roll and falling debris. */
  impact(scale: number) {
    if (!this.ctx || !this.enabled) return;
    if ("vibrate" in navigator) navigator.vibrate?.(scale > 0.8 ? [600, 120, 1200, 300, 2000] : [250, 80, 400]);
    if (this.playClip(scale > 0.8 ? "impact" : "airburst", 1)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const sub = ctx.createOscillator();
    sub.frequency.setValueAtTime(70, t);
    sub.frequency.exponentialRampToValueAtTime(22, t + 3);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.9 * scale, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 4);
    sub.connect(sg).connect(this.fxBus);
    sub.start(t);
    sub.stop(t + 4.2);
    const burst = this.noise(false, false);
    const bl = ctx.createBiquadFilter();
    bl.type = "lowpass";
    bl.frequency.setValueAtTime(4000, t);
    bl.frequency.exponentialRampToValueAtTime(200, t + 2);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.7 * scale, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    burst.connect(bl).connect(bg).connect(this.fxBus);
    burst.start(t, 0, 3);
    // the shock and ground wave arrive later and roll on
    setTimeout(() => this.rumble(this.fxBus, 9 * scale + 3, 0.55 * scale, 90), 3200);
    if (scale > 0.8) {
      setTimeout(() => this.rumble(this.fxBus, 18, 0.3, 160), 6500);
      // glowing ejecta raining back: scattered pops and hiss
      for (let i = 0; i < 120; i++) {
        setTimeout(() => {
          if (!this.ctx) return;
          const st = this.ctx.currentTime;
          const c = this.noise(false, false);
          const f = this.ctx.createBiquadFilter();
          f.type = "bandpass";
          f.frequency.value = 600 + Math.random() * 2400;
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.05 + Math.random() * 0.06, st);
          g.gain.exponentialRampToValueAtTime(0.0001, st + 0.2 + Math.random() * 0.4);
          const p = this.ctx.createStereoPanner();
          p.pan.value = Math.random() * 2 - 1;
          c.connect(f).connect(g).connect(p).connect(this.fxBus);
          c.start(st, Math.random() * 3, 0.6);
        }, 7000 + Math.random() * 14000);
      }
    }
  }

  /** A soft tick when you pick an object in the sky. */
  /** A quiet two-note chime that opens and closes a narration. */
  chime(up = true) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    (up ? [659.25, 987.77] : [987.77, 659.25]).forEach((f, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.16);
      g.gain.linearRampToValueAtTime(0.035, t + i * 0.16 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 1.4);
      o.connect(g).connect(this.fxBus);
      o.start(t + i * 0.16);
      o.stop(t + i * 0.16 + 1.5);
    });
  }

  tick() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.value = 1760;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.03, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(this.fxBus);
    o.start(t);
    o.stop(t + 0.14);
  }

  /** Optional ElevenLabs clips from the local server; falls back to synthesis. */
  async preloadClips() {
    if (!this.ctx || location.protocol === "file:") return;
    for (const name of ["rewind", "bolide", "impact", "airburst"]) {
      if (this.clips.has(name)) continue;
      this.clips.set(name, null);
      try {
        const r = await fetch(`/api/sfx/${name}`);
        if (!r.ok) continue;
        this.clips.set(name, await this.ctx.decodeAudioData(await r.arrayBuffer()));
      } catch {
        /* no server or no key: keep synthesising */
      }
    }
  }

  private playClip(name: string, gain: number): boolean {
    const buf = this.clips.get(name);
    if (!buf || !this.ctx) return false;
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    s.connect(g).connect(this.fxBus);
    s.start();
    return true;
  }
}
