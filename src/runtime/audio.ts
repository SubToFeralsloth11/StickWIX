/** Sound output used by the game; the browser implementation uses Web Audio. */
export interface AudioAdapter {
  play(assetId: string): void;
  music(assetId: string | null): void;
  stop(): void;
}

export const silentAudio: AudioAdapter = { play() {}, music() {}, stop() {} };

/**
 * Web Audio player. Buffers decode once per asset; one-shot effects overlap,
 * music loops on its own channel. Browsers keep the context suspended until a
 * user gesture, so `unlock()` must be called from a click or key press.
 */
export class WebAudio implements AudioAdapter {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private musicNode: AudioBufferSourceNode | null = null;
  private musicId: string | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private stopped = false;

  /** `urlFor` maps an asset id to a fetchable URL (blob:, data: or builtin path). */
  constructor(private readonly urlFor: (assetId: string) => string | undefined) {}

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    // Every target browser (Safari 14.1+ included) ships the unprefixed AudioContext.
    if (typeof AudioContext === 'undefined') return null;
    this.ctx = new AudioContext();
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.7;
    this.sfxGain.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.ctx.destination);
    return this.ctx;
  }

  unlock() {
    void this.context()?.resume();
  }

  private load(assetId: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(assetId);
    if (!p) {
      const url = this.urlFor(assetId);
      const ctx = this.context();
      p = !url || !ctx
        ? Promise.resolve(null)
        : fetch(url)
            .then((r) => r.arrayBuffer())
            .then((b) => ctx.decodeAudioData(b))
            .catch(() => null);
      this.buffers.set(assetId, p);
    }
    return p;
  }

  /** Starts decoding ahead of time so the first play is not late. */
  preload(ids: Iterable<string>) {
    for (const id of ids) void this.load(id);
  }

  play(assetId: string) {
    if (this.stopped) return;
    void this.load(assetId).then((buf) => {
      const ctx = this.ctx;
      if (!buf || !ctx || !this.sfxGain || this.stopped) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.sfxGain);
      src.start();
    });
  }

  music(assetId: string | null) {
    if (assetId === this.musicId) return;
    this.musicId = assetId;
    this.musicNode?.stop();
    this.musicNode = null;
    if (!assetId || this.stopped) return;
    void this.load(assetId).then((buf) => {
      const ctx = this.ctx;
      if (!buf || !ctx || !this.musicGain || this.musicId !== assetId || this.stopped) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.musicGain);
      src.start();
      this.musicNode = src;
    });
  }

  stop() {
    this.stopped = true;
    this.musicNode?.stop();
    this.musicNode = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}
