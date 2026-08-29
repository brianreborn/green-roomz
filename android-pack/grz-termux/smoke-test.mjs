const BASE_URL = 'http://127.0.0.1:8080/v1/chat/completions';

async function test(name, body) {
  console.log(`\n--- Test: ${name} ---`);
  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`✅ Success (Status: ${res.status})`);
      console.log(`Response Model: ${data.model}`);
      console.log(`Output: ${data.choices[0].message.content.substring(0, 150)}...`);
    } else {
      console.error(`❌ Failed (Status: ${res.status})`);
      console.error(JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
  }
}

async function run() {
  await test('Direct text completion on general-text-speculator', {
    model: 'general-text-speculator',
    messages: [{ role: 'user', content: 'What is the capital of France?' }],
    max_tokens: 20
  });

  await test('Slash command routing (/code) on default nexus', {
    model: null,
    messages: [{ role: 'user', content: '/code def hello_world():' }],
    max_tokens: 30
  });

  await test('UTF-8 Payload test (Emoji)', {
    model: 'general-text-speculator',
    messages: [{ role: 'user', content: 'Repeat after me: 🚀 🧠' }],
    max_tokens: 20
  });

  console.log('\n--- Smoke Test Complete ---');
}

run();
