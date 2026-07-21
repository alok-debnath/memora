/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
  compactSustainedSilence,
  encodeMonoWav,
  prepareAudioForTranscription,
  TRANSCRIPTION_AUDIO_SAMPLE_RATE,
  TRANSCRIPTION_AUDIO_TEMPO,
} from "../lib/audio/transcriptionPreprocessor";

function sine(seconds: number, frequency = 220) {
  const length = Math.round(TRANSCRIPTION_AUDIO_SAMPLE_RATE * seconds);
  return Float32Array.from(
    { length },
    (_, index) =>
      Math.sin((2 * Math.PI * frequency * index) / TRANSCRIPTION_AUDIO_SAMPLE_RATE) * 0.4,
  );
}

describe("frontend transcription audio preprocessing", () => {
  test("keeps the requested tempo fixed in code", () => {
    expect(TRANSCRIPTION_AUDIO_TEMPO).toBe(2);
  });

  test("removes sustained silence but retains speech", () => {
    const speech = sine(1);
    const input = new Float32Array(speech.length * 2 + TRANSCRIPTION_AUDIO_SAMPLE_RATE);
    input.set(speech, 0);
    input.set(speech, speech.length + TRANSCRIPTION_AUDIO_SAMPLE_RATE);
    const result = compactSustainedSilence(input, TRANSCRIPTION_AUDIO_SAMPLE_RATE);
    expect(result.removedSamples).toBeGreaterThan(TRANSCRIPTION_AUDIO_SAMPLE_RATE * 0.5);
    expect(result.samples.length).toBeGreaterThan(speech.length * 2);
  });

  test("produces a valid compact mono WAV", () => {
    const speech = sine(1.5);
    const silence = new Float32Array(TRANSCRIPTION_AUDIO_SAMPLE_RATE);
    const prepared = prepareAudioForTranscription([speech, silence, speech]);
    const view = new DataView(prepared.audio);
    const text = (offset: number, length: number) =>
      String.fromCharCode(...new Uint8Array(prepared.audio, offset, length));
    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(TRANSCRIPTION_AUDIO_SAMPLE_RATE);
    expect(prepared.mimeType).toBe("audio/wav");
    expect(prepared.durationMs).toBeLessThan(2_000);
    expect(prepared.removedSilenceMs).toBeGreaterThan(500);
  });

  test("WAV encoder clamps out-of-range samples", () => {
    const wav = encodeMonoWav(new Float32Array([-2, 2]), TRANSCRIPTION_AUDIO_SAMPLE_RATE);
    const view = new DataView(wav);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(46, true)).toBe(32767);
  });
});
