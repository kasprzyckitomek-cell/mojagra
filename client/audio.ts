// Proceduralne dźwięki i muzyka (Web Audio API) – bez plików audio.
export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfxGain!: GainNode;
  volume = 0.6;
  musicVol = 0.35;
  private musicTimer = 0;
  private mood: 'day' | 'night' | 'boss' | 'dusk' = 'day';
  private noiseBuf: AudioBuffer | null = null;

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.music = this.ctx.createGain();
      this.music.gain.value = this.musicVol;
      this.music.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.scheduleMusic();
    } catch { this.ctx = null; }
  }

  setVolume(v: number, m: number) {
    this.volume = v; this.musicVol = m;
    if (this.ctx) { this.master.gain.value = v; this.music.gain.value = m; }
  }

  setMood(m: 'day' | 'night' | 'boss' | 'dusk') { this.mood = m; }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, slide = 0, delay = 0, dest?: AudioNode) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }
  private noise(dur: number, vol = 0.2, freq = 1000, q = 1, delay = 0, type: BiquadFilterType = 'bandpass') {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  play(k: string, vol = 1) {
    if (!this.ctx) return;
    switch (k) {
      case 'chop': this.noise(0.12, 0.35 * vol, 700, 2); this.tone(180, 0.08, 'triangle', 0.15 * vol, 0.6); break;
      case 'mine': this.tone(900, 0.12, 'square', 0.08 * vol, 0.7); this.noise(0.1, 0.25 * vol, 2500, 3); break;
      case 'pick': this.noise(0.08, 0.15 * vol, 3000, 1); this.tone(600, 0.06, 'sine', 0.08 * vol, 1.4); break;
      case 'hit': this.noise(0.1, 0.35 * vol, 400, 1); this.tone(120, 0.12, 'sawtooth', 0.12 * vol, 0.5); break;
      case 'hurt': this.tone(300, 0.25, 'sawtooth', 0.15 * vol, 0.5); break;
      case 'craft': [523, 659, 784].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.1 * vol, 1, i * 0.06)); break;
      case 'build': this.noise(0.25, 0.3 * vol, 300, 1); this.tone(150, 0.2, 'triangle', 0.12 * vol, 0.8); break;
      case 'eat': for (let i = 0; i < 3; i++) this.noise(0.05, 0.2 * vol, 1500, 2, i * 0.1); break;
      case 'got': this.tone(880, 0.08, 'sine', 0.08 * vol, 1.3); break;
      case 'quest': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, 1, i * 0.1)); break;
      case 'death': [300, 250, 200, 150].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.12, 0.9, i * 0.18)); break;
      case 'revive': [400, 600, 800, 1200].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.12, 1, i * 0.08)); break;
      case 'thunder': this.noise(1.6, 0.6 * vol, 120, 0.5, 0, 'lowpass'); break;
      case 'howl': this.tone(330, 1.6, 'sine', 0.18, 1.6); this.tone(335, 1.6, 'sine', 0.1, 1.55, 0.05); break;
      case 'charlie': this.noise(0.4, 0.5, 200, 1); this.tone(80, 0.5, 'sawtooth', 0.25, 0.5); break;
      case 'roar': this.noise(0.8, 0.5, 200, 0.7, 0, 'lowpass'); this.tone(70, 0.8, 'sawtooth', 0.25, 0.7); break;
      case 'fire': this.noise(0.3, 0.15 * vol, 600, 0.5); break;
      case 'splash': this.noise(0.3, 0.25 * vol, 1200, 0.8); break;
      case 'click': this.tone(1200, 0.03, 'square', 0.05); break;
      case 'warn': this.tone(440, 0.2, 'square', 0.08); this.tone(330, 0.25, 'square', 0.08, 1, 0.2); break;
      case 'step': this.noise(0.05, 0.04 * vol, 500, 1); break;
      case 'shoot': this.noise(0.08, 0.2 * vol, 3000, 2); this.tone(600, 0.08, 'triangle', 0.08 * vol, 0.5); break;
    }
  }

  // Ambientowa muzyka generatywna
  private scheduleMusic() {
    if (!this.ctx) return;
    const chordsDay = [[261.6, 329.6, 392.0], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
    const chordsNight = [[220, 261.6, 311.1], [207.7, 246.9, 311.1], [174.6, 207.7, 261.6], [164.8, 196, 246.9]];
    const step = () => {
      if (!this.ctx) return;
      const set = this.mood === 'night' ? chordsNight : chordsDay;
      const ch = set[this.musicTimer % set.length];
      const dur = this.mood === 'boss' ? 1.6 : 4.5;
      if (this.mood === 'boss') {
        for (let i = 0; i < 4; i++) { this.tone(55, 0.25, 'sawtooth', 0.25, 0.6, i * 0.4, this.music); this.noise(0.1, 0.25, 150, 1, i * 0.4 + 0.2); }
        this.tone(ch[0] / 2, 1.5, 'square', 0.05, 1, 0, this.music);
      } else {
        for (const f of ch) this.pad(this.mood === 'night' ? f / 2 : f / 2, dur);
        if (Math.random() < 0.6) this.tone(ch[Math.floor(Math.random() * 3)] * 2, 0.6, 'triangle', 0.04, 1, Math.random() * 2, this.music);
      }
      this.musicTimer++;
      setTimeout(step, dur * 1000);
    };
    step();
  }
  private pad(f: number, dur: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine'; o2.type = 'triangle';
    o.frequency.value = f; o2.frequency.value = f * 1.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o2.connect(g); g.connect(this.music);
    o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
  }
}

export const audio = new Audio();
