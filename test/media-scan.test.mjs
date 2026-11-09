import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA_POLICIES, pngEndsAtIend, scanMedia, sniffMime, wavMatchesRiffSize } from '../src/media-scan.mjs';
import { tinyPng, tinyWav } from './helpers.mjs';

test('MEDIA_POLICIES constants', () => {
  assert.deepEqual(MEDIA_POLICIES['vision-layout-agent'].kinds, ['image/png', 'image/jpeg', 'image/webp']);
  assert.equal(MEDIA_POLICIES['vision-layout-agent'].maxBytes, 8 * 1024 * 1024);
  assert.deepEqual(MEDIA_POLICIES['image-generation-agent'].kinds, ['image/png']);
  assert.ok(MEDIA_POLICIES['audio-transcription-agent'].kinds.includes('audio/wav'));
});

test('PNG magic ending at IEND is ok for vision', () => {
  const png = tinyPng();
  assert.equal(sniffMime(png), 'image/png');
  assert.equal(pngEndsAtIend(png), true);
  const r = scanMedia(png, { alias: 'vision-layout-agent' });
  assert.equal(r.ok, true);
  assert.equal(r.mime, 'image/png');
});

test('JPEG magic labeled image/png is refused', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const r = scanMedia(jpeg, { alias: 'vision-layout-agent', declaredMime: 'image/png' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'declared mime mismatch');
});

test('empty and oversize refuse', () => {
  assert.equal(scanMedia(Buffer.alloc(0), { alias: 'vision-layout-agent' }).reason, 'empty');
  const huge = Buffer.alloc(8 * 1024 * 1024 + 1, 0);
  huge[0] = 137; huge[1] = 80; huge[2] = 78; huge[3] = 71;
  assert.equal(scanMedia(huge, { alias: 'vision-layout-agent' }).reason, 'too large');
});

test('unknown alias refuses with no media policy', () => {
  assert.equal(scanMedia(tinyPng(), { alias: 'no-such-agent' }).reason, 'no media policy');
});

test('PNG with extra byte after IEND refuses trailing bytes', () => {
  const bad = Buffer.concat([tinyPng(), Buffer.from([0x00])]);
  const r = scanMedia(bad, { alias: 'vision-layout-agent' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'trailing bytes');
});

test('tiny WAV accept; garbage RIFF refuse', () => {
  const wav = tinyWav();
  assert.equal(wavMatchesRiffSize(wav), true);
  assert.equal(scanMedia(wav, { alias: 'audio-transcription-agent' }).ok, true);
  assert.equal(scanMedia(Buffer.from('RIFFxxxxWAVE'), { alias: 'audio-transcription-agent' }).ok, false);
});
