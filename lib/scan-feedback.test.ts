import { afterEach, describe, expect, it, vi } from "vitest";
import { playScanError, playScanSuccess } from "./scan-feedback";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubAudioContext() {
  const oscillators: Array<{ frequency: { value: number }; type: string; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> }> = [];

  class FakeAudioContext {
    currentTime = 0;
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
  return oscillators;
}

describe("scan-feedback", () => {
  it("does nothing outside the browser instead of throwing (no window.AudioContext)", () => {
    expect(() => playScanSuccess()).not.toThrow();
    expect(() => playScanError()).not.toThrow();
  });

  it("plays a single tone on success", () => {
    const oscillators = stubAudioContext();
    playScanSuccess();
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].start).toHaveBeenCalled();
    expect(oscillators[0].stop).toHaveBeenCalled();
  });

  it("plays two low tones on error", () => {
    const oscillators = stubAudioContext();
    playScanError();
    expect(oscillators).toHaveLength(2);
    for (const oscillator of oscillators) {
      expect(oscillator.frequency.value).toBe(220);
      expect(oscillator.start).toHaveBeenCalled();
    }
  });
});
