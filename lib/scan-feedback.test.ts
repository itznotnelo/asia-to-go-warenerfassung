import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module keeps one AudioContext for the session, so every test loads a fresh copy.
let playScanSuccess: () => void;
let playScanError: () => void;

beforeEach(async () => {
  vi.resetModules();
  ({ playScanSuccess, playScanError } = await import("./scan-feedback"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubAudioContext(initialState: AudioContextState = "running") {
  const oscillators: Array<{ frequency: { value: number }; type: string; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> }> = [];
  const contexts: FakeAudioContext[] = [];

  class FakeAudioContext {
    currentTime = 0;
    state: AudioContextState = initialState;
    resume = vi.fn(async () => {
      this.state = "running";
    });
    constructor() {
      contexts.push(this);
    }
    createOscillator() {
      const oscillator = {
        type: "sine",
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    }
    createGain() {
      return {
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      };
    }
    destination = {};
  }

  vi.stubGlobal("window", { AudioContext: FakeAudioContext });
  return { oscillators, contexts };
}

describe("scan-feedback", () => {
  it("does nothing outside the browser instead of throwing (no window.AudioContext)", () => {
    expect(() => playScanSuccess()).not.toThrow();
    expect(() => playScanError()).not.toThrow();
  });

  it("plays a single tone on success", () => {
    const { oscillators } = stubAudioContext();
    playScanSuccess();
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].start).toHaveBeenCalled();
    expect(oscillators[0].stop).toHaveBeenCalled();
  });

  it("plays two low tones on error", () => {
    const { oscillators } = stubAudioContext();
    playScanError();
    expect(oscillators).toHaveLength(2);
    for (const oscillator of oscillators) {
      expect(oscillator.frequency.value).toBe(220);
      expect(oscillator.start).toHaveBeenCalled();
    }
  });

  it("reuses one AudioContext across many scans, success and error alike", () => {
    const { contexts, oscillators } = stubAudioContext();
    for (let i = 0; i < 50; i++) playScanSuccess();
    playScanError();
    expect(contexts).toHaveLength(1);
    expect(oscillators).toHaveLength(52);
  });

  it("resumes a suspended context instead of creating a new one", () => {
    const { contexts } = stubAudioContext("suspended");
    playScanSuccess();
    expect(contexts).toHaveLength(1);
    expect(contexts[0].resume).toHaveBeenCalledTimes(1);
    playScanSuccess();
    expect(contexts).toHaveLength(1);
    expect(contexts[0].resume).toHaveBeenCalledTimes(1);
  });

  it("creates a new context only if the old one was closed", () => {
    const { contexts } = stubAudioContext();
    playScanSuccess();
    contexts[0].state = "closed";
    playScanSuccess();
    expect(contexts).toHaveLength(2);
  });
});
