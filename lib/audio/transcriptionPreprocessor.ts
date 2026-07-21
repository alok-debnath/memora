export const TRANSCRIPTION_AUDIO_SAMPLE_RATE = 16_000;
export const TRANSCRIPTION_AUDIO_TEMPO = 2;

const SILENCE_THRESHOLD_DB = -45;
const SILENCE_THRESHOLD = 10 ** (SILENCE_THRESHOLD_DB / 20);
const FRAME_MS = 20;
const SPEECH_PADDING_MS = 120;
const MIN_REMOVABLE_SILENCE_MS = 600;

export type PreparedTranscriptionAudio = {
  audio: ArrayBuffer;
  mimeType: "audio/wav";
  durationMs: number;
  removedSilenceMs: number;
};

export function joinPcmChunks(chunks: readonly Float32Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const joined = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

function frameRms(samples: Float32Array, start: number, end: number) {
  let power = 0;
  for (let index = start; index < end; index += 1) power += samples[index] ** 2;
  return Math.sqrt(power / Math.max(1, end - start));
}

/**
 * Removes only sustained silence. Short pauses and padding around every speech
 * region are retained so words and sentence boundaries do not get joined.
 */
export function compactSustainedSilence(samples: Float32Array, sampleRate: number) {
  const frameSize = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000));
  const frameCount = Math.ceil(samples.length / frameSize);
  const voiced = new Uint8Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * frameSize;
    voiced[frame] =
      frameRms(samples, start, Math.min(samples.length, start + frameSize)) >= SILENCE_THRESHOLD
        ? 1
        : 0;
  }

  const paddingFrames = Math.ceil(SPEECH_PADDING_MS / FRAME_MS);
  const minimumGapFrames = Math.ceil(MIN_REMOVABLE_SILENCE_MS / FRAME_MS);
  const ranges: Array<{ start: number; end: number }> = [];
  let frame = 0;
  while (frame < frameCount) {
    while (frame < frameCount && voiced[frame] === 0) frame += 1;
    if (frame >= frameCount) break;
    const voicedStart = frame;
    while (frame < frameCount && voiced[frame] === 1) frame += 1;
    const voicedEnd = frame;
    ranges.push({
      start: Math.max(0, voicedStart - paddingFrames),
      end: Math.min(frameCount, voicedEnd + paddingFrames),
    });
  }

  // An all-silent/very-quiet recording should reach transcription unchanged;
  // dropping it here would turn a recoverable provider result into an empty file.
  if (ranges.length === 0) return { samples, removedSamples: 0 };

  const merged: typeof ranges = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (!previous || range.start - previous.end >= minimumGapFrames) merged.push({ ...range });
    else previous.end = Math.max(previous.end, range.end);
  }

  const keptSamples = merged.reduce(
    (total, range) => total + (range.end - range.start) * frameSize,
    0,
  );
  const output = new Float32Array(Math.min(samples.length, keptSamples));
  let outputOffset = 0;
  for (const range of merged) {
    const start = range.start * frameSize;
    const end = Math.min(samples.length, range.end * frameSize);
    output.set(samples.subarray(start, end), outputOffset);
    outputOffset += end - start;
  }
  const compacted = outputOffset === output.length ? output : output.slice(0, outputOffset);
  return { samples: compacted, removedSamples: samples.length - compacted.length };
}

function correlation(
  output: Float32Array,
  outputStart: number,
  input: Float32Array,
  inputStart: number,
  length: number,
) {
  let dot = 0;
  let outputPower = 1e-9;
  let inputPower = 1e-9;
  // Speech matching does not need every sample; stepping by two halves the work
  // while retaining enough waveform structure for a stable overlap choice.
  for (let index = 0; index < length; index += 2) {
    const a = output[outputStart + index];
    const b = input[inputStart + index];
    dot += a * b;
    outputPower += a * a;
    inputPower += b * b;
  }
  return dot / Math.sqrt(outputPower * inputPower);
}

/** Pitch-preserving Waveform Similarity Overlap-Add for mono speech. */
export function compressTempoWsola(
  input: Float32Array,
  sampleRate: number,
  tempo = TRANSCRIPTION_AUDIO_TEMPO,
) {
  if (tempo <= 1 || input.length < sampleRate * 0.08) return input.slice();

  const windowSize = Math.round(sampleRate * 0.04);
  const synthesisHop = Math.round(sampleRate * 0.02);
  const overlap = windowSize - synthesisHop;
  const analysisHop = Math.round(synthesisHop * tempo);
  const searchRadius = Math.round(sampleRate * 0.005);
  const correlationLength = Math.min(overlap, Math.round(sampleRate * 0.01));
  const output = new Float32Array(Math.ceil(input.length / tempo) + windowSize * 2);

  output.set(input.subarray(0, Math.min(windowSize, input.length)));
  let inputPosition = 0;
  let outputPosition = synthesisHop;
  let written = Math.min(windowSize, input.length);

  while (outputPosition + windowSize < output.length) {
    const expected = inputPosition + analysisHop;
    if (expected + windowSize >= input.length) break;
    const searchStart = Math.max(0, expected - searchRadius);
    const searchEnd = Math.min(input.length - windowSize, expected + searchRadius);
    let bestPosition = expected;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let candidate = searchStart; candidate <= searchEnd; candidate += 4) {
      const score = correlation(output, outputPosition, input, candidate, correlationLength);
      if (score > bestScore) {
        bestScore = score;
        bestPosition = candidate;
      }
    }

    for (let index = 0; index < overlap; index += 1) {
      const mix = index / overlap;
      output[outputPosition + index] =
        output[outputPosition + index] * (1 - mix) + input[bestPosition + index] * mix;
    }
    output.set(
      input.subarray(bestPosition + overlap, bestPosition + windowSize),
      outputPosition + overlap,
    );
    written = outputPosition + windowSize;
    inputPosition = bestPosition;
    outputPosition += synthesisHop;
  }

  return output.slice(0, written);
}

export function encodeMonoWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1)
      view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}

export function prepareAudioForTranscription(
  chunks: readonly Float32Array[],
  sampleRate = TRANSCRIPTION_AUDIO_SAMPLE_RATE,
): PreparedTranscriptionAudio {
  const original = joinPcmChunks(chunks);
  if (original.length < sampleRate / 2) throw new Error("Recording is too short to process.");
  const compacted = compactSustainedSilence(original, sampleRate);
  const accelerated = compressTempoWsola(compacted.samples, sampleRate);
  if (accelerated.length < sampleRate * 0.15)
    throw new Error("Processed recording is unexpectedly short.");
  return {
    audio: encodeMonoWav(accelerated, sampleRate),
    mimeType: "audio/wav",
    durationMs: Math.round((accelerated.length / sampleRate) * 1000),
    removedSilenceMs: Math.round((compacted.removedSamples / sampleRate) * 1000),
  };
}
