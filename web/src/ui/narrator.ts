// The planetarium voice. Speaks one sentence at a time with the browser's own speech engine,
// and falls back to silently timed captions when no voice is available. Nothing here needs a network.
export class Narrator {
  volume = 0.9;
  speaking = false;
  paused = false;
  /** true once we know this browser will not speak; captions still run on a timer */
  silent = !("speechSynthesis" in window);
  private queue: string[] = [];
  private i = 0;
  private run = 0;
  private timer = 0;
  private voice: SpeechSynthesisVoice | null = null;

  constructor(private onSentence: (text: string | null, index: number, total: number) => void, private onState: () => void) {
    if (!this.silent) {
      const pick = () => {
        this.voices = Narrator.usable();
        let saved: string | null = null;
        try { saved = localStorage.getItem("skyrewind-voice"); } catch { /* storage may be blocked */ }
        this.voice = this.voices.find((v) => v.name === saved) ?? this.voices[0] ?? null;
        this.onState();
      };
      pick();
      speechSynthesis.addEventListener?.("voiceschanged", pick);
    }
  }

  voices: SpeechSynthesisVoice[] = [];
  get voiceName() { return this.voice?.name ?? ""; }
  setVoice(name: string) {
    this.voice = this.voices.find((v) => v.name === name) ?? this.voice;
    this.silent = false;
    try { localStorage.setItem("skyrewind-voice", name); } catch { /* storage may be blocked */ }
  }

  /** English voices worth offering, most natural first. Novelty and old synthetic voices are left out. */
  static usable(): SpeechSynthesisVoice[] {
    const good = ["Premium", "Enhanced", "Natural", "Google UK English Female", "Google US English", "Google UK English Male", "Ava", "Zoe", "Allison", "Serena", "Samantha", "Karen", "Moira", "Daniel", "Tessa", "Kate", "Oliver", "Susan", "Tom", "Evan", "Nathan", "Alex", "Rishi", "Microsoft"];
    const rank = (v: SpeechSynthesisVoice) => { const i = good.findIndex((g) => v.name.includes(g)); return i < 0 ? 999 : i; };
    return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en") && rank(v) < 999).sort((x, y) => rank(x) - rank(y));
  }

  static sentences(text: string): string[] {
    return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  }

  play(text: string) {
    this.stop();
    this.queue = Narrator.sentences(text);
    this.i = 0;
    this.speaking = true;
    this.paused = false;
    this.next(++this.run);
  }

  private next(run: number) {
    if (run !== this.run) return;
    if (this.i >= this.queue.length) {
      this.speaking = false;
      this.onSentence(null, this.i, this.queue.length);
      this.onState();
      return;
    }
    const text = this.queue[this.i];
    this.onSentence(text, this.i, this.queue.length);
    this.onState();
    const advance = () => {
      clearTimeout(this.timer);
      if (run !== this.run) return;
      this.i++;
      this.timer = window.setTimeout(() => this.next(run), 520);
    };
    const timed = () => (this.timer = window.setTimeout(advance, 1100 + text.length * 62));
    if (this.silent || this.volume === 0) return void timed();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice?.lang ?? "en-US";
    u.rate = 0.9;
    u.pitch = 1;
    u.volume = this.volume;
    let started = false;
    u.onstart = () => (started = true);
    u.onend = () => started && advance();
    u.onerror = () => {
      if (run !== this.run || started) return;
      this.silent = true;
      this.onState();
      timed();
    };
    // some embedded pages accept the call and then never speak: notice, and carry on with captions
    this.timer = window.setTimeout(() => {
      if (started || run !== this.run || this.paused) return;
      const local = this.voices.find((v) => v.localService);
      if (this.voice && !this.voice.localService && local) {
        this.voice = local;
        speechSynthesis.cancel();
        return this.next(run);
      }
      this.silent = true;
      speechSynthesis.cancel();
      this.onState();
      timed();
    }, 2600);
    speechSynthesis.speak(u);
  }

  toggle() {
    if (!this.speaking) return;
    this.paused = !this.paused;
    if (this.silent) {
      clearTimeout(this.timer);
      if (!this.paused) this.next(this.run);
    } else if (this.paused) speechSynthesis.pause();
    else speechSynthesis.resume();
    this.onState();
  }

  stop() {
    this.run++;
    clearTimeout(this.timer);
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    this.speaking = false;
    this.paused = false;
    this.onSentence(null, 0, 0);
    this.onState();
  }
}
