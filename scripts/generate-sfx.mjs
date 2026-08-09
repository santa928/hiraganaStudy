/* global Buffer, console, process */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIRECTORY = resolve(ROOT_DIRECTORY, "public/assets/sfx");
const MAX_PEAK = 10 ** (-12 / 20);
const ATTACK_SECONDS = 0.005;

/** 指定sample rateと長さで、端点が0になるPCM用波形を作る。 */
function createSamples(sampleRate, durationSeconds, sampleAt) {
  const frameCount = Math.round(sampleRate * durationSeconds);
  const samples = new Float64Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) samples[frame] = sampleAt(frame / sampleRate, frame, frameCount);
  samples[0] = 0;
  samples[frameCount - 1] = 0;
  return samples;
}

/** 5ms以上のattackと末尾fadeを持つ滑らかな振幅包絡線を返す。 */
function envelope(time, durationSeconds) {
  const attack = Math.min(ATTACK_SECONDS, durationSeconds / 2);
  if (time < attack) return Math.sin((Math.PI * time) / (2 * attack));
  if (time > durationSeconds - attack) return Math.sin((Math.PI * (durationSeconds - time)) / (2 * attack));
  return 1;
}

/** sine波の単音効果音を作る。 */
function sineEffect(sampleRate, durationSeconds, frequency) {
  return createSamples(sampleRate, durationSeconds, (time) => {
    return 0.24 * envelope(time, durationSeconds) * Math.sin(2 * Math.PI * frequency * time);
  });
}

/** C5/E5/G5を順番に鳴らす420msの成功音を作る。 */
function successEffect(sampleRate) {
  const durationSeconds = 0.42;
  const frequencies = [523.251, 659.255, 783.991];
  const segmentDuration = durationSeconds / frequencies.length;
  return createSamples(sampleRate, durationSeconds, (time) => {
    const index = Math.min(frequencies.length - 1, Math.floor(time / segmentDuration));
    const localTime = time - index * segmentDuration;
    return 0.22 * envelope(localTime, segmentDuration) * Math.sin(2 * Math.PI * frequencies[index] * localTime);
  });
}

/** 330Hzから660Hzへ上がる280msの芽吹き音を作る。 */
function sproutEffect(sampleRate) {
  const durationSeconds = 0.28;
  return createSamples(sampleRate, durationSeconds, (time) => {
    const phase = 2 * Math.PI * (330 * time + (330 * time * time) / durationSeconds);
    return 0.23 * envelope(time, durationSeconds) * Math.sin(phase);
  });
}

/** C4/G4/A4/F4を各3秒、柔らかな2音コードでつなぐ12秒BGMを作る。 */
function gardenLoop(sampleRate) {
  const durationSeconds = 12;
  const roots = [261.626, 391.995, 440, 349.228];
  const fifths = [391.995, 587.33, 659.255, 523.251];
  const segmentDuration = 3;
  return createSamples(sampleRate, durationSeconds, (time) => {
    const index = Math.min(roots.length - 1, Math.floor(time / segmentDuration));
    const localTime = time - index * segmentDuration;
    const chord = Math.sin(2 * Math.PI * roots[index] * localTime) + Math.sin(2 * Math.PI * fifths[index] * localTime);
    return 0.115 * envelope(localTime, segmentDuration) * chord;
  });
}

/** 浮動小数波形をmono 16-bit PCM WAVへ符号化する。 */
function encodeWav(samples, sampleRate) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const output = Buffer.alloc(44 + dataSize);
  output.write("RIFF", 0);
  output.writeUInt32LE(36 + dataSize, 4);
  output.write("WAVEfmt ", 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * bytesPerSample, 28);
  output.writeUInt16LE(bytesPerSample, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36);
  output.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const normalized = Math.max(-MAX_PEAK, Math.min(MAX_PEAK, samples[index]));
    output.writeInt16LE(Math.round(normalized * 32767), 44 + index * bytesPerSample);
  }
  return output;
}

/** WAV headerとwaveformが指定された完成版品質を満たすか検査する。 */
function verifyWav(bytes, specification) {
  if (bytes.subarray(0, 4).toString() !== "RIFF" || bytes.subarray(8, 12).toString() !== "WAVE") throw new Error(`${specification.name}: WAV header is invalid`);
  if (bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 || bytes.readUInt16LE(34) !== 16) throw new Error(`${specification.name}: expected mono 16-bit PCM`);
  if (bytes.readUInt32LE(24) !== specification.sampleRate) throw new Error(`${specification.name}: unexpected sample rate`);
  const frameCount = bytes.readUInt32LE(40) / 2;
  if (frameCount !== specification.frameCount) throw new Error(`${specification.name}: unexpected frame count`);
  let peak = 0;
  for (let offset = 44; offset < bytes.length; offset += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(offset) / 32767));
  if (peak > MAX_PEAK + 1 / 32767) throw new Error(`${specification.name}: peak exceeds -12dBFS`);
  if (bytes.readInt16LE(44) !== 0 || bytes.readInt16LE(bytes.length - 2) !== 0) throw new Error(`${specification.name}: endpoints are not loop-safe`);
  return { frameCount, peak };
}

const SFX = [
  { name: "tap.wav", sampleRate: 44_100, samples: () => sineEffect(44_100, 0.045, 523) },
  { name: "success.wav", sampleRate: 44_100, samples: () => successEffect(44_100) },
  { name: "sprout.wav", sampleRate: 44_100, samples: () => sproutEffect(44_100) },
  { name: "garden-loop.wav", sampleRate: 22_050, samples: () => gardenLoop(22_050) },
];

/** 4つの同梱WAVを再生成し、ヘッダ・frame数・peakを機械検証する。 */
async function generate() {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  for (const specification of SFX) {
    const samples = specification.samples();
    const output = encodeWav(samples, specification.sampleRate);
    const verification = verifyWav(output, { ...specification, frameCount: samples.length });
    await writeFile(resolve(OUTPUT_DIRECTORY, specification.name), output);
    console.log(`${specification.name}: ${specification.sampleRate}Hz mono 16-bit ${verification.frameCount} frames peak=${verification.peak.toFixed(5)}`);
  }
}

/** 既存WAVを再生成せずに仕様値だけ検査する。 */
async function verify() {
  for (const specification of SFX) {
    const expectedFrames = Math.round(specification.sampleRate * (specification.name === "tap.wav" ? 0.045 : specification.name === "success.wav" ? 0.42 : specification.name === "sprout.wav" ? 0.28 : 12));
    const bytes = await readFile(resolve(OUTPUT_DIRECTORY, specification.name));
    const verification = verifyWav(bytes, { ...specification, frameCount: expectedFrames });
    console.log(`${specification.name}: verified ${verification.frameCount} frames peak=${verification.peak.toFixed(5)}`);
  }
}

if (process.argv.includes("--verify")) await verify();
else await generate();
