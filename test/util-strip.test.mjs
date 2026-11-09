import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headerSafe, stripControls, stripEscapes } from '../src/util.mjs';

test('U+2028 and U+2029 are stripped as one-char class', () => {
  assert.equal(stripControls('\u2028'), '');
  assert.equal(stripControls('\u2029'), '');
  assert.equal(stripControls('a\u2028b\u2029c'), 'a b c');
  assert.equal(stripEscapes('\u2028'), '');
  assert.equal(stripEscapes('\u2029'), '');
  assert.equal(stripEscapes('keep\u2028me'), 'keepme');
  assert.equal(headerSafe('x\u2028y'), 'x y');
  assert.equal(stripControls('ok'), 'ok');
});

test('one-char covert format classes strip to empty', () => {
  const chars = [
    '\u200B', // ZWSP
    '\u200C', // ZWNJ
    '\u200D', // ZWJ
    '\u200E', // LRM
    '\u200F', // RLM
    '\u2060', // WJ
    '\u2061',
    '\u2062',
    '\u2063',
    '\u2064',
    '\uFEFF', // BOM
    '\u202A', // LRE
    '\u202B', // RLE
    '\u202C', // PDF
    '\u202D', // LRO
    '\u202E', // RLO
    '\u2066', // LRI
    '\u2067', // RLI
    '\u2068', // FSI
    '\u2069', // PDI
  ];
  for (const ch of chars) {
    assert.equal(stripEscapes(ch), '', `stripEscapes codepoint U+${ch.codePointAt(0).toString(16).toUpperCase()}`);
    assert.equal(stripControls(ch), '', `stripControls codepoint U+${ch.codePointAt(0).toString(16).toUpperCase()}`);
  }
});

test('TAG and VS supplementary planes strip', () => {
  assert.equal(stripEscapes('\u{E0000}'), '');
  assert.equal(stripEscapes('\u{E0020}'), ''); // TAG space
  assert.equal(stripEscapes('\u{E007F}'), '');
  assert.equal(stripEscapes('\u{E0100}'), ''); // VS1
  assert.equal(stripControls('\u{E0061}'), ''); // TAG a
});

test('Cyrillic а passes unchanged (no homoglyph fold)', () => {
  assert.equal(stripEscapes('а'), 'а');
  assert.equal(stripEscapes('okаtxt'), 'okаtxt');
  assert.equal(stripControls('а'), 'а');
});

test('trailing space/tab stripped per line; LF kept', () => {
  assert.equal(stripEscapes('ok   '), 'ok');
  assert.equal(stripEscapes('ok\t\t'), 'ok');
  assert.equal(stripEscapes('a  \nb  '), 'a\nb');
});

test('mixed zwsp/bidi strip from content', () => {
  assert.equal(stripEscapes('ok\u200b\u200d\u202e\u2028\u2029txt  '), 'oktxt');
});
