/**
 * Run: node scripts/test-api.mjs
 * Tests the actual API call shape used in api/_lib/llm/client.ts
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dir, '../.env'), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const key = env.ANTHROPIC_API_KEY;
const model = env.LLM_MODEL || 'claude-haiku-5-5';

console.log('Model:', model);
console.log('Key prefix:', key?.slice(0, 20));

// --- Test 1: basic call without output_config ---
console.log('\n--- Test 1: basic call (no output_config) ---');
const r1 = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({
    model,
    max_tokens: 50,
    messages: [{ role: 'user', content: 'Reply with: {"ok":true}' }],
  }),
});
const j1 = await r1.json();
console.log('Status:', r1.status);
console.log('stop_reason:', j1.stop_reason);
console.log('text:', j1.content?.[0]?.text?.slice(0, 100));

// --- Test 2: with output_config.format (json_schema) only ---
console.log('\n--- Test 2: output_config.format json_schema only ---');
const schema = {
  type: 'object', additionalProperties: false,
  required: ['intent', 'reply'],
  properties: { intent: { type: 'string', enum: ['reply'] }, reply: { type: 'string' } },
};
const r2 = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({
    model,
    max_tokens: 100,
    messages: [{ role: 'user', content: 'Say hello.' }],
    output_config: { format: { type: 'json_schema', schema } },
  }),
});
const j2 = await r2.json();
console.log('Status:', r2.status);
console.log('stop_reason:', j2.stop_reason);
console.log('text:', j2.content?.[0]?.text?.slice(0, 200));
if (!r2.ok) console.log('error:', JSON.stringify(j2).slice(0, 300));

// --- Test 3: with output_config.effort only ---
console.log('\n--- Test 3: output_config.effort only ---');
const r3 = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({
    model,
    max_tokens: 50,
    messages: [{ role: 'user', content: 'Reply with {"ok":true}' }],
    output_config: { effort: 'low' },
  }),
});
const j3 = await r3.json();
console.log('Status:', r3.status);
console.log('stop_reason:', j3.stop_reason);
console.log('text:', j3.content?.[0]?.text?.slice(0, 100));
if (!r3.ok) console.log('error:', JSON.stringify(j3).slice(0, 300));

// --- Test 4: output_config with both effort and format ---
console.log('\n--- Test 4: output_config with effort + format together ---');
const r4 = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({
    model,
    max_tokens: 100,
    messages: [{ role: 'user', content: 'Say hello.' }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
  }),
});
const j4 = await r4.json();
console.log('Status:', r4.status);
console.log('stop_reason:', j4.stop_reason);
console.log('text:', j4.content?.[0]?.text?.slice(0, 200));
if (!r4.ok) console.log('error:', JSON.stringify(j4).slice(0, 400));

// --- Test 5: system as array + output_config.format ---
console.log('\n--- Test 5: system as content array + format ---');
const r5 = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({
    model,
    max_tokens: 100,
    system: [{ type: 'text', text: 'Reply only in JSON.', cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: 'Say hello.' }],
    output_config: { format: { type: 'json_schema', schema } },
  }),
});
const j5 = await r5.json();
console.log('Status:', r5.status);
console.log('stop_reason:', j5.stop_reason);
console.log('text:', j5.content?.[0]?.text?.slice(0, 200));
if (!r5.ok) console.log('error:', JSON.stringify(j5).slice(0, 400));
