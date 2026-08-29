import { detectModalities } from './routing.mjs';

function collectText(body) {
  const parts = [];
  for (const message of body?.messages ?? []) {
    if (typeof message?.content === 'string') parts.push(message.content);
    else if (Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (typeof part === 'string') parts.push(part);
        else if (typeof part?.text === 'string') parts.push(part.text);
      }
    }
  }
  return parts.join('\n');
}

// C++ cannot use a trailing \b: '+' is non-word, so "C++ program" would miss \bc\+\+\b.
const CODE_INTENT = /```|\btypescript\b|\bpython\b|\bfunction\b|\bjson schema\b|\bc\+\+|\bcpp\b|\bprogram\b|\bcode\b/i;
const IMAGE_GENERATION_INTENT = /\b(?:text[- ]to[- ]image|generate (?:an? )?(?:image|picture|illustration|drawing)|draw(?: me)?(?: an?)? (?:image|picture)|draw(?: me)? (?:a|an|the|this|that)\b|imagine (?:an? )?(?:image|picture)|imagine (?:a|an|the)\b)|\b(?:render|illuminat(?:e|ed|ion)|calligraphy|illustration)\b/i;

function plan(route, confidence, reason_code, required_modalities) {
  return { route, confidence, reason_code, required_modalities, allowed_tool_arguments: {} };
}

export function planRoute(body) {
  const modality = detectModalities(body);
  const text = collectText(body);
  if (modality.image && modality.audio) {
    return plan(null, 1, 'mixed_media', ['image', 'audio']);
  }
  if (modality.audio) {
    return plan('audio-transcription-agent', 1, 'audio_input', ['audio']);
  }
  if (modality.image) {
    return plan('vision-layout-agent', 1, 'image_input', ['image']);
  }
  if (/\btranslate\b|\btranslation\b/i.test(text)) {
    return plan('general-text-speculator', 0.9, 'translation_request', ['text']);
  }
  if (/\bembed(ding)?s?\b|\bsimilarit(y|ies)\b/i.test(text)) {
    return plan('semantic-embedding-agent', 0.8, 'embedding_intent', ['text']);
  }
  if (/\brerank\b|\brelevance score\b/i.test(text)) {
    return plan('retrieval-rerank-agent', 0.8, 'rerank_intent', ['text']);
  }
  if (CODE_INTENT.test(text)) {
    return plan('qwenstral-code-speculator', 0.75, 'code_intent', ['text']);
  }
  if (IMAGE_GENERATION_INTENT.test(text)) {
    return plan('image-generation-agent', 0.7, 'image_generation_intent', ['text']);
  }
  return plan('general-text-speculator', 0.6, 'default_text', ['text']);
}
