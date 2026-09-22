/** Map llama.cpp completion probabilities into OpenAI chat logprobs. */

export const OPENAI_TOP_LOGPROBS_CAP = 20;

export function clientWantsLogprobs(body) {
  return body?.logprobs === true || body?.logprobs === 'full' || Number(body?.top_logprobs) > 0;
}

export function clientWantsFullLogits(body) {
  return body?.logprobs === 'full' || body?.obliteratus?.logits === true;
}

export function topLogprobsLimit(body) {
  const requested = Number(body?.top_logprobs);
  const n = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 0;
  const uncapped = body?.logprobs === 'full' || body?.obliteratus?.uncapped_logprobs === true;
  if (!uncapped && n > OPENAI_TOP_LOGPROBS_CAP) return OPENAI_TOP_LOGPROBS_CAP;
  return n;
}

function lnProb(value) {
  const p = Number(value);
  if (!Number.isFinite(p) || p <= 0) return null;
  return Math.log(p);
}

function asTopRow(item) {
  if (!item || typeof item !== 'object') return null;
  const token = item.token ?? item.tok_str ?? '';
  const logprob = typeof item.logprob === 'number' ? item.logprob : lnProb(item.prob);
  if (logprob == null) return null;
  return { token: String(token), logprob };
}

function trimTop(list, limit) {
  const rows = (Array.isArray(list) ? list : []).map(asTopRow).filter(Boolean);
  if (limit <= 0) return [];
  return rows.slice(0, limit);
}

function fromProbStep(step, limit) {
  const ranked = trimTop(step?.probs ?? step?.top_logprobs, Number.POSITIVE_INFINITY);
  const token = String(step?.token ?? step?.content ?? ranked[0]?.token ?? '');
  const chosen = ranked.find((row) => row.token === token) ?? ranked[0];
  const logprob = typeof step?.logprob === 'number' ? step.logprob : (chosen?.logprob ?? null);
  return { token, logprob, top_logprobs: trimTop(step?.probs ?? step?.top_logprobs, limit) };
}

export function toOpenAILogprobs(raw, limit) {
  if (!raw) return null;
  if (Array.isArray(raw?.content)) {
    return {
      content: raw.content.map((step) => ({
        token: String(step?.token ?? step?.content ?? ''),
        logprob: typeof step?.logprob === 'number' ? step.logprob : (fromProbStep(step, limit).logprob),
        top_logprobs: trimTop(step?.top_logprobs ?? step?.probs, limit),
      })),
    };
  }
  const steps = Array.isArray(raw) ? raw : (Array.isArray(raw?.completion_probabilities) ? raw.completion_probabilities : null);
  if (!steps) return null;
  return { content: steps.map((step) => fromProbStep(step, limit)) };
}

function stripDumps(payload) {
  delete payload.logits;
  delete payload.obliteratus;
  delete payload.completion_probabilities;
  if (!Array.isArray(payload.choices)) return payload;
  payload.choices = payload.choices.map((choice) => {
    if (!choice || typeof choice !== 'object') return choice;
    const copy = { ...choice };
    delete copy.logprobs;
    delete copy.logits;
    delete copy.completion_probabilities;
    return copy;
  });
  return payload;
}

function takeLogits(choice, payload) {
  if (Array.isArray(choice?.logits)) return choice.logits;
  if (Array.isArray(payload?.logits)) return payload.logits;
  if (Array.isArray(payload?.obliteratus?.logits)) return payload.obliteratus.logits;
  return null;
}

/** Apply the chat logprobs contract when the caller passed the original request body. */
export function applyLogprobContract(payload, requestBody) {
  if (!payload || typeof payload !== 'object' || requestBody == null) return payload;
  if (!clientWantsLogprobs(requestBody) && !clientWantsFullLogits(requestBody)) return stripDumps(payload);
  const limit = topLogprobsLimit(requestBody);
  const wantLogits = clientWantsFullLogits(requestBody);
  const next = { ...payload };
  delete next.logits;
  delete next.completion_probabilities;
  const rows = [];
  if (Array.isArray(next.choices)) {
    next.choices = next.choices.map((choice) => {
      if (!choice || typeof choice !== 'object') return choice;
      const copy = { ...choice };
      const raw = copy.logprobs ?? copy.completion_probabilities ?? next.completion_probabilities;
      const mapped = clientWantsLogprobs(requestBody) ? toOpenAILogprobs(raw, limit) : null;
      if (mapped?.content) copy.logprobs = mapped;
      else delete copy.logprobs;
      const logits = takeLogits(copy, payload);
      if (wantLogits && logits) rows.push(logits);
      delete copy.logits;
      delete copy.completion_probabilities;
      return copy;
    });
  }
  if (wantLogits && rows.length) {
    next.obliteratus = { logits: rows.length === 1 ? rows[0] : rows };
  } else {
    delete next.obliteratus;
  }
  return next;
}
