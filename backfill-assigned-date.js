/**
 * Backfills "Sales Agent Assigned Date" using "Contacted Date" as proxy.
 * Only touches leads from April 1, 2026 onward that have a Sales Agent + Contacted Date
 * but are missing the Sales Agent Assigned Date.
 */
const axios = require('axios');
const config = require('./config');

const api = axios.create({
  baseURL: 'https://api.notion.com/v1',
  headers: {
    Authorization: `Bearer ${config.notion.apiKey}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  },
});

async function queryAll(filter) {
  const results = [];
  let cursor;
  do {
    const body = { filter, page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await api.post(`/databases/${config.notion.leadsDbId}/query`, body);
    results.push(...res.data.results);
    cursor = res.data.has_more ? res.data.next_cursor : undefined;
    await new Promise(r => setTimeout(r, 350));
  } while (cursor);
  return results;
}

async function main() {
  console.log('Querying leads with Sales Agent + Contacted Date but no Assigned Date...');

  const filter = {
    and: [
      { property: 'Sales Agent', people: { is_not_empty: true } },
      { property: 'Contacted Date', date: { on_or_after: '2026-04-01' } },
      { property: 'Sales Agent Assigned Date', date: { is_empty: true } },
    ],
  };

  const leads = await queryAll(filter);
  console.log(`Found ${leads.length} leads to backfill.`);

  let updated = 0;
  let skipped = 0;

  for (const lead of leads) {
    const name = lead.properties['Client Name']?.title?.[0]?.plain_text || 'Unknown';
    const contactedDate = lead.properties['Contacted Date']?.date?.start;

    if (!contactedDate) {
      skipped++;
      continue;
    }

    try {
      await api.patch(`/pages/${lead.id}`, {
        properties: {
          'Sales Agent Assigned Date': {
            date: { start: contactedDate },
          },
        },
      });
      updated++;
      if (updated % 10 === 0) console.log(`  Updated ${updated}/${leads.length}...`);
      // Rate limit
      await new Promise(r => setTimeout(r, 350));
    } catch (err) {
      console.error(`  Error updating "${name}":`, err.response?.data?.message || err.message);
    }
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}, Total: ${leads.length}`);
}

main().catch(e => console.error(e.response?.data || e.message));
