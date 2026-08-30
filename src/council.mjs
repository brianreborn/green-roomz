/**
 * Council judges: given N candidate answers to the same prompt, choose a
 * consensus and flag the outlier. Pure functions - the gateway does the fan-out.
 *
 * A candidate: { alias, content: string, ok: boolean, ms: number }
 */
import { stripEscapes } from './util.mjs';

function parseJsonLoose(text) {
  const t = stripEscapes(String(text ?? '')).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(t); } catch {}
  const m = /\{[\s\S]*\}/.exec(t);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

/** Deep-ish equality for scalar / small structured values. */
function sameValue(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'string' && typeof b === 'string') return a.trim().toLowerCase() === b.trim().toLowerCase();
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/**
 * field-vote: parse each candidate as JSON; per key, majority value wins.
 * Non-JSON candidates abstain. Returns the consensus object, per-key tallies,
 * and the alias that disagreed with the majority most often.
 */
export function fieldVote(candidates) {
  const parsed = candidates.map((c) => ({ ...c, json: parseJsonLoose(c.content) }));
  const voters = parsed.filter((p) => p.json && typeof p.json === 'object' && !Array.isArray(p.json));
  const keys = [...new Set(voters.flatMap((v) => Object.keys(v.json)))];

  const votes = {};
  const consensus = {};
  const dissentCount = Object.fromEntries(candidates.map((c) => [c.alias, 0]));

  for (const key of keys) {
    const buckets = [];
    for (const v of voters) {
      const val = v.json[key];
      const hit = buckets.find((b) => sameValue(b.value, val));
      if (hit) hit.by.push(v.alias);
      else buckets.push({ value: val, by: [v.alias] });
    }
    buckets.sort((a, b) => b.by.length - a.by.length);
    const [win, ...rest] = buckets;
    consensus[key] = win.value;
    votes[key] = { value: win.value, count: win.by.length, of: voters.length, dissent: rest.map((r) => ({ value: r.value, by: r.by })) };
    for (const r of rest) for (const alias of r.by) dissentCount[alias] += 1;
  }

  const outlier = Object.entries(dissentCount).sort((a, b) => b[1] - a[1])[0];
  const totalFields = keys.length || 1;
  const agreement = voters.length
    ? Object.values(votes).reduce((s, v) => s + v.count / Math.max(1, v.of), 0) / totalFields
    : 0;

  return {
    judge: 'field-vote',
    consensus,
    votes,
    voters: voters.map((v) => v.alias),
    abstained: parsed.filter((p) => !voters.includes(p)).map((p) => p.alias),
    outlier: outlier && outlier[1] > 0 ? outlier[0] : null,
    agreement: Number(agreement.toFixed(3)),
    winner: pickCleanest(voters, consensus),
  };
}

/** The voter whose object is closest to the consensus (fewest dissenting fields). */
function pickCleanest(voters, consensus) {
  let best = null; let bestScore = Infinity;
  for (const v of voters) {
    const miss = Object.keys(consensus).filter((k) => !sameValue(v.json[k], consensus[k])).length;
    if (miss < bestScore) { bestScore = miss; best = v.alias; }
  }
  return best;
}

/**
 * similarity: pick the medoid (highest average pairwise cosine) as the winner,
 * the least-similar as the outlier. `vectors` is [{alias, embedding:number[]}].
 */
export function similarityVote(candidates, vectors) {
  const byAlias = new Map(vectors.map((v) => [v.alias, v.embedding]));
  const usable = candidates.filter((c) => Array.isArray(byAlias.get(c.alias)));
  if (usable.length < 2) return { judge: 'similarity', winner: usable[0]?.alias ?? candidates[0]?.alias ?? null, outlier: null, agreement: 1 };
  const cos = (a, b) => {
    let dot = 0; let na = 0; let nb = 0;
    for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
  };
  const scores = usable.map((c) => {
    const me = byAlias.get(c.alias);
    const others = usable.filter((o) => o.alias !== c.alias).map((o) => cos(me, byAlias.get(o.alias)));
    return { alias: c.alias, avg: others.reduce((s, x) => s + x, 0) / others.length };
  }).sort((a, b) => b.avg - a.avg);
  return {
    judge: 'similarity',
    winner: scores[0].alias,
    outlier: scores[scores.length - 1].avg < 0.85 ? scores[scores.length - 1].alias : null,
    agreement: Number(scores[0].avg.toFixed(3)),
    scores,
  };
}

/** Turn a judge-model reply ("2" / "candidate B" / {choice:1}) into a winner alias. */
export function resolveJudgeChoice(reply, candidates) {
  const parsed = parseJsonLoose(reply);
  let idx = null;
  if (parsed && Number.isInteger(parsed.choice)) idx = parsed.choice;      // 1-based
  else {
    const num = /(\d+)/.exec(String(reply ?? ''));
    if (num) idx = Number(num[1]);                                        // 1-based
    const letter = /\b([A-Z])\b/.exec(String(reply ?? '').toUpperCase());
    if (idx == null && letter) idx = letter[1].charCodeAt(0) - 65 + 1;    // A->1
  }
  if (idx == null) return { judge: 'judge-model', winner: candidates[0]?.alias ?? null, outlier: null };
  const one = idx - 1;
  return {
    judge: 'judge-model',
    winner: candidates[Math.max(0, Math.min(candidates.length - 1, one))]?.alias ?? null,
    outlier: null,
    raw: String(reply ?? '').slice(0, 200),
  };
}

export function judgePrompt(userText, candidates) {
  const list = candidates.map((c, i) => `[${i + 1}] (${c.alias})\n${String(c.content ?? '').slice(0, 2000)}`).join('\n\n');
  return `You are judging ${candidates.length} answers to the same request. Reply with ONLY the number of the best answer.\n\nREQUEST:\n${String(userText ?? '').slice(0, 2000)}\n\nANSWERS:\n${list}\n\nBest answer number:`;
}
