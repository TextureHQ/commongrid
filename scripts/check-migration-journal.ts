import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const drizzleDir = path.join(__dirname, '..', 'drizzle');
const journalPath = path.join(drizzleDir, 'meta', '_journal.json');

const legacyUnjournalled = [
  '0000_noisy_archangel_fixed.sql',
  '0001_add_performance_indexes.sql',
  '0002_add_users_auth.sql',
  '0002_graceful_mister_sinister.sql',
  '0008_resolve_utility_by_name_function.sql',
  '0009_utility_cache_and_overrides_tables.sql',
  '0010_fix_crm_org_enrichment_view.sql'
];

function checkJournal() {
  const sqlFiles = fs.readdirSync(drizzleDir).filter(f => f.endsWith('.sql'));
  
  let journal: any;
  try {
    journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  } catch (e) {
    console.error(`Error reading _journal.json: ${e}`);
    process.exit(1);
  }

  const journalledTags = new Set(journal.entries.map((e: any) => e.tag));
  let errorCount = 0;

  for (const file of sqlFiles) {
    if (legacyUnjournalled.includes(file)) {
      continue;
    }
    
    // 0024_add_program_details_fields.sql -> tag is 0024_add_program_details_fields
    const tag = file.replace('.sql', '');
    if (!journalledTags.has(tag)) {
      console.error(`❌ Migration file ${file} is not present in _journal.json`);
      errorCount++;
    }
  }

  // Check monotonic timestamps
  let lastWhen = 0;
  for (const entry of journal.entries) {
    if (entry.when <= lastWhen) {
      console.error(`❌ Journal entry for ${entry.tag} has non-monotonic timestamp ${entry.when} (previous was ${lastWhen})`);
      errorCount++;
    }
    lastWhen = entry.when;
  }

  if (errorCount > 0) {
    console.error(`\nFound ${errorCount} migration journal errors.`);
    process.exit(1);
  }

  console.log('✅ Migration journal looks good.');
}

checkJournal();
