#!/usr/bin/env node
/**
 * Offline nexus route scorer — no live GPU / llama required.
 *
 * Usage:
 *   node score-routes.mjs [--gold gold-routes.json] [--recorded recorded.jsonl] [--out score-report.json]
 *
 * recorded.jsonl lines (one of):
 *   {"id":"T01","raw":"{\"route\":\"general-text-speculator\",\"confidence\":0.9,\"reason\":\"chat\"}"}
 *   {"id":"T01","route":"general-text-speculator","confidence":0.9,"reason":"chat"}
 *   {"id":"T01","parse_error":true}   // counts as fail + json_fail
 *
 * Exit: 0 always (report written); check report.pass_bar for gates.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function stripFence(text) {
  return String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

function extractJsonObject(text) {
  const stripped = String(text ?? '').trim();
  if (!stripped) return null;
  const tryParse = (raw) => {
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      return value;
    } catch {
      return null;
    }
  };
  const direct = tryParse(stripped);
  if (direct) return direct;
  const start = stripped.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return tryParse(stripped.slice(start, i + 1));
    }
  }
  return null;
}

function parseRoute(rawOrObj) {
  if (rawOrObj && typeof rawOrObj === 'object' && !Array.isArray(rawOrObj)) {
    if (rawOrObj.parse_error) return { ok: false, route: null, confidence: 0, reason: 'parse_error' };
    if (typeof rawOrObj.route === 'string') {
      return {
        ok: true,
        route: rawOrObj.route.trim(),
        confidence: Number(rawOrObj.confidence) || 0,
        reason: String(rawOrObj.reason ?? ''),
      };
    }
    if (typeof rawOrObj.raw === 'string') return parseRoute(rawOrObj.raw);
  }
  const value = extractJsonObject(stripFence(rawOrObj));
  if (!value || typeof value.route !== 'string') {
    return { ok: false, route: null, confidence: 0, reason: 'parse_fail' };
  }
  return {
    ok: true,
    route: value.route.trim(),
    confidence: Number(value.confidence) || 0,
    reason: String(value.reason ?? value.reason_code ?? ''),
  };
}

function loadJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  return lines.map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      return { id: `line_${idx + 1}`, parse_error: true, _jsonl_error: String(err.message) };
    }
  });
}

const goldPath = path.resolve(HERE, arg('--gold', 'gold-routes.json'));
const recordedPath = path.resolve(HERE, arg('--recorded', 'recorded.jsonl'));
const outPath = path.resolve(HERE, arg('--out', 'score-report.json'));

const gold = JSON.parse(readFileSync(goldPath, 'utf8'));
const recorded = loadJsonl(recordedPath);
const byId = new Map(recorded.map((r) => [r.id, r]));

const ILLEGAL_ALWAYS = new Set(['tool-router-agent', 'auto']);

let top1 = 0;
let acceptHit = 0;
let illegalHop = 0;
let jsonOk = 0;
let scored = 0;
let missing = 0;
const perFamily = {};
const details = [];

for (const c of gold.cases) {
  const fam = c.family || 'other';
  perFamily[fam] ??= { n: 0, top1: 0, accept: 0, illegal: 0, json_ok: 0, missing: 0 };
  perFamily[fam].n += 1;

  const rec = byId.get(c.id);
  if (!rec) {
    missing += 1;
    perFamily[fam].missing += 1;
    details.push({ id: c.id, family: fam, status: 'missing_recording', expect: c.expect_route });
    continue;
  }

  scored += 1;
  const parsed = parseRoute(rec);
  const route = parsed.route;
  const accept = new Set(c.accept ?? [c.expect_route]);
  const illegal = new Set([...(c.illegal ?? []), ...ILLEGAL_ALWAYS]);

  // modality gate: vision/audio without part is always illegal on text modality
  if (c.modality === 'text') {
    illegal.add('vision-layout-agent');
    illegal.add('audio-transcription-agent');
  }

  const row = {
    id: c.id,
    family: fam,
    expect: c.expect_route,
    got: route,
    confidence: parsed.confidence,
    reason: parsed.reason,
    json_ok: parsed.ok,
    top1: false,
    accept: false,
    illegal: false,
  };

  if (parsed.ok) {
    jsonOk += 1;
    perFamily[fam].json_ok += 1;
  }

  if (route === c.expect_route) {
    top1 += 1;
    perFamily[fam].top1 += 1;
    row.top1 = true;
  }
  if (route && accept.has(route)) {
    acceptHit += 1;
    perFamily[fam].accept += 1;
    row.accept = true;
  }
  if (route && illegal.has(route)) {
    illegalHop += 1;
    perFamily[fam].illegal += 1;
    row.illegal = true;
  }

  row.status = !parsed.ok
    ? 'json_fail'
    : row.illegal
      ? 'illegal_hop'
      : row.top1
        ? 'pass_top1'
        : row.accept
          ? 'pass_accept'
          : 'wrong_route';
  details.push(row);
}

const denom = gold.cases.length;
const top1Rate = denom ? top1 / denom : 0;
const acceptRate = denom ? acceptHit / denom : 0;
const illegalRate = denom ? illegalHop / denom : 0;
const jsonRate = denom ? jsonOk / denom : 0;

const bars = {
  top1_ge_0_85: top1Rate >= 0.85,
  illegal_lt_0_05: illegalRate < 0.05,
  json_ge_0_95: jsonRate >= 0.95,
  coverage_complete: missing === 0,
};

const report = {
  schema: 'green-roomz.nexus-route-score.v1',
  gold: path.basename(goldPath),
  recorded: path.basename(recordedPath),
  n_cases: denom,
  n_scored: scored,
  n_missing: missing,
  metrics: {
    top1_accuracy: Number(top1Rate.toFixed(4)),
    accept_accuracy: Number(acceptRate.toFixed(4)),
    illegal_hop_rate: Number(illegalRate.toFixed(4)),
    json_parse_rate: Number(jsonRate.toFixed(4)),
    top1_count: top1,
    accept_count: acceptHit,
    illegal_count: illegalHop,
    json_ok_count: jsonOk,
  },
  per_family: perFamily,
  pass_bar: bars,
  all_bars_pass: Object.values(bars).every(Boolean),
  details,
};

writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');

console.log(`Nexus offline route score`);
console.log(`  gold=${goldPath}`);
console.log(`  recorded=${recordedPath} (${recorded.length} lines)`);
console.log(`  cases=${denom} scored=${scored} missing=${missing}`);
console.log(`  top1=${(top1Rate * 100).toFixed(1)}%  accept=${(acceptRate * 100).toFixed(1)}%  illegal=${(illegalRate * 100).toFixed(1)}%  json=${(jsonRate * 100).toFixed(1)}%`);
console.log(`  bars: top1≥85%=${bars.top1_ge_0_85} illegal<5%=${bars.illegal_lt_0_05} json≥95%=${bars.json_ge_0_95} coverage=${bars.coverage_complete}`);
console.log(`  all_bars_pass=${report.all_bars_pass}`);
console.log(`  wrote ${outPath}`);
