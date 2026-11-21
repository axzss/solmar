// SOLMAR v4 — procedural WebAudio: engine hum, sirens, gunshots, chimes,
// mission sting, rain loop, bassline + hats music loop. No audio files.
export class AudioEngine {
  constructor() {
    this.ctx = null; this.master = null; this.musicOn = true;
    this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null;
    this.rainSrc = null; this.musicTimer = 0; this.beat = 0;
    this.stations = ['SOLMAR FM', 'VICE 98.5', 'PALM RADIO'];
    this.station = 0;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      // engine: sawtooth + lowpass, pitch follows speed
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
      // siren: two-tone triangle
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
    } catch (e) { this.ctx = null; }
  }
  setEngine(speed01, on) {
    if (!this.ctx) return;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.09 : 0, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, this.ctx.currentTime, 0.08);
  }
  setSiren(on, t) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
    if (on) this.sirenOsc.frequency.setTargetAtTime(Math.sin(t * 4.4) > 0 ? 720 : 960, this.ctx.currentTime, 0.05);
  }
  noiseBurst(dur, freq, gain, type = 'highpass') {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  }
  gunshot() { this.noiseBurst(0.14, 1800, 0.5, 'highpass'); }
  shotgunBlast() { this.noiseBurst(0.3, 500, 0.7, 'lowpass'); }
  chime() {
    if (!this.ctx) return;
    for (const [f, dt] of [[880, 0], [1318, 0.09]]) {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.22, this.ctx.currentTime + dt);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dt + 0.35);
      o.connect(g); g.connect(this.master);
      o.start(this.ctx.currentTime + dt); o.stop(this.ctx.currentTime + dt + 0.4);
    }
  }
  sting() {
    if (!this.ctx) return;
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = this.ctx.createGain();
      const t0 = this.ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.2, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + 0.55);
    });
  }
  setRain(on) {
    if (!this.ctx) return;
    if (on && !this.rainSrc) {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3; }
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.4;
      const g = this.ctx.createGain(); g.gain.value = 0.12;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(); this.rainSrc = src;
    } else if (!on && this.rainSrc) {
      try { this.rainSrc.stop(); } catch (e) { /* already stopped */ }
      this.rainSrc = null;
    }
  }
  updateMusic(dt) {
    if (!this.ctx || !this.musicOn) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 0.24;
    this.beat++;
    // simple bassline + hats: A minor groove, 8 steps
    const bass = [55, 0, 55, 65.4, 55, 0, 49, 58.3];
    const f = bass[this.beat % 8];
    if (f) {
      const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.09, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
      o.connect(lp); lp.connect(g); g.connect(this.master);
      o.start(); o.stop(this.ctx.currentTime + 0.24);
    }
    if (this.beat % 2 === 0) this.noiseBurst(0.03, 6000, 0.03);
  }
  nextStation() { this.station = (this.station + 1) % this.stations.length; return this.stations[this.station]; }
}
