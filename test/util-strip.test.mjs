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
