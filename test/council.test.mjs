import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldVote, similarityVote, resolveJudgeChoice, judgePrompt } from '../src/council.mjs';

const c = (alias, content) => ({ alias, content, ok: true, ms: 1 });

test('fieldVote: per-key majority, flags the outlier, computes agreement', () => {
  const r = fieldVote([
    c('a', '{"brand":"Acme","abv":"13.5%","warning":"present"}'),
    c('b', '```json\n{"brand":"Acme","abv":"13.5%","warning":"present"}\n```'),
    c('d', '{"brand":"Acme","abv":"13%","warning":"missing"}'),
  ]);
  assert.equal(r.consensus.abv, '13.5%');
  assert.equal(r.consensus.warning, 'present');
  assert.equal(r.votes.abv.count, 2);
  assert.deepEqual(r.votes.abv.dissent, [{ value: '13%', by: ['d'] }]);
  assert.equal(r.outlier, 'd');
  assert.ok(r.agreement > 0.6 && r.agreement < 0.8);
  assert.ok(['a', 'b'].includes(r.winner));
});

test('fieldVote: non-JSON candidates abstain, unanimous agreement is 1', () => {
  const r = fieldVote([
    c('a', '{"x":1}'),
    c('b', '{"x":1}'),
    c('d', 'sorry I cannot do that'),
  ]);
  assert.equal(r.abstained.length, 1);
  assert.equal(r.abstained[0], 'd');
  assert.equal(r.agreement, 1);
  assert.equal(r.outlier, null);
});

test('fieldVote: case/whitespace-insensitive string match', () => {
  const r = fieldVote([c('a', '{"t":"Wine"}'), c('b', '{"t":"  wine "}')]);
  assert.equal(r.votes.t.count, 2);
});

test('similarityVote: medoid wins, far outlier flagged', () => {
  const vecs = [
    { alias: 'a', embedding: [1, 0, 0] },
    { alias: 'b', embedding: [0.98, 0.1, 0] },
    { alias: 'd', embedding: [0, 1, 0] },
  ];
  const r = similarityVote([c('a', 'x'), c('b', 'x'), c('d', 'y')], vecs);
  assert.ok(['a', 'b'].includes(r.winner));
  assert.equal(r.outlier, 'd');
});

test('resolveJudgeChoice: parses number / letter / {choice}', () => {
  const cands = [c('a', ''), c('b', ''), c('d', '')];
  assert.equal(resolveJudgeChoice('2', cands).winner, 'b');
  assert.equal(resolveJudgeChoice('The best is answer 3.', cands).winner, 'd');
  assert.equal(resolveJudgeChoice('{"choice":1}', cands).winner, 'a');
  assert.equal(resolveJudgeChoice('candidate B', cands).winner, 'b');
});

test('judgePrompt lists candidates numbered', () => {
  const p = judgePrompt('what is 2+2', [c('a', 'four'), c('b', '4')]);
  assert.match(p, /\[1\] \(a\)/);
  assert.match(p, /\[2\] \(b\)/);
  assert.match(p, /Best answer number:/);
});
