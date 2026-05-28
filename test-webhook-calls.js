/**
 * Simulates 50 call.completed webhook events hitting the bot's endpoint.
 * Sends them via HTTP POST exactly like Quo would.
 * Then reads the call store and verifies totals.
 */
const axios = require('axios');

const WEBHOOK_URL = 'https://johnston-scratch-shaped-ignored.trycloudflare.com/webhooks/quo/call';

// Agent Quo IDs and expected call distribution
const agents = [
  { name: 'Lucio Fridlander', quoUserId: 'USYfhVQTqA', expectedCalls: 15, totalDuration: 0 },
  { name: 'Shez Barlow', quoUserId: 'USaAHUnMsw', expectedCalls: 12, totalDuration: 0 },
  { name: 'Emmanuel Marquez', quoUserId: 'USfCaXqbkT', expectedCalls: 10, totalDuration: 0 },
  { name: 'Jade Lebaron', quoUserId: 'USwyeqtA74', expectedCalls: 5, totalDuration: 0 },
  { name: 'Madelyn Staddon', quoUserId: 'USyX1XQLjl', expectedCalls: 4, totalDuration: 0 },
  { name: 'Akiami Byrd', quoUserId: 'USIQQ3Dn0T', expectedCalls: 4, totalDuration: 0 },
];

async function main() {
  let callId = 1;
  let totalSent = 0;

  console.log('Sending 50 test webhook calls to:', WEBHOOK_URL);
  console.log('');

  for (const agent of agents) {
    for (let i = 0; i < agent.expectedCalls; i++) {
      const duration = Math.floor(Math.random() * 300) + 10; // 10-310 seconds
      agent.totalDuration += duration;
      const directions = ['outgoing', 'outgoing', 'outgoing', 'incoming']; // 75% outgoing
      const direction = directions[Math.floor(Math.random() * directions.length)];
      const statuses = ['completed', 'completed', 'completed', 'missed']; // 75% completed
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      const payload = {
        data: {
          object: {
            id: `AC_TEST_${String(callId).padStart(4, '0')}`,
            userId: agent.quoUserId,
            answeredBy: null,
            initiatedBy: agent.quoUserId,
            phoneNumberId: 'PNtest123',
            duration: duration,
            direction: direction,
            status: status,
            createdAt: new Date().toISOString(),
          }
        }
      };

      try {
        await axios.post(WEBHOOK_URL, payload, { headers: { 'Content-Type': 'application/json' } });
        totalSent++;
      } catch (err) {
        console.error(`  FAILED to send call ${callId}:`, err.message);
      }

      callId++;
      // Small delay to avoid overwhelming
      await new Promise(r => setTimeout(r, 50));
    }
  }

  console.log(`Sent ${totalSent}/50 webhook calls.`);
  console.log('');

  // Wait for processing
  await new Promise(r => setTimeout(r, 2000));

  // Now verify by reading the call store directly
  console.log('=== EXPECTED vs ACTUAL ===');
  console.log('');

  const { getTodayStats } = require('./services/call-store');
  const stats = getTodayStats();

  let totalExpected = 0;
  let totalActual = 0;
  let allMatch = true;

  for (const agent of agents) {
    const actual = stats.get(agent.quoUserId) || { calls: 0, talkTimeSeconds: 0 };
    const match = actual.calls === agent.expectedCalls;
    const durationMatch = actual.talkTimeSeconds === agent.totalDuration;
    if (!match || !durationMatch) allMatch = false;
    totalExpected += agent.expectedCalls;
    totalActual += actual.calls;

    const icon = match && durationMatch ? 'PASS' : 'FAIL';
    console.log(`[${icon}] ${agent.name}`);
    console.log(`  Calls:    expected ${agent.expectedCalls}, got ${actual.calls}`);
    console.log(`  Duration: expected ${agent.totalDuration}s (${Math.round(agent.totalDuration/60)}m), got ${actual.talkTimeSeconds}s (${Math.round(actual.talkTimeSeconds/60)}m)`);
  }

  console.log('');
  console.log(`Total calls: expected ${totalExpected}, got ${totalActual}`);
  console.log('');

  // Check for any calls attributed to unknown users
  let unknownCalls = 0;
  const knownIds = new Set(agents.map(a => a.quoUserId));
  for (const [userId, data] of stats) {
    if (!knownIds.has(userId)) {
      console.log(`[WARN] Unknown userId ${userId}: ${data.calls} calls`);
      unknownCalls += data.calls;
    }
  }

  if (allMatch && unknownCalls === 0) {
    console.log('=== ALL TESTS PASSED ===');
  } else {
    console.log('=== SOME TESTS FAILED ===');
  }
}

main().catch(e => console.error('Test failed:', e.message));
