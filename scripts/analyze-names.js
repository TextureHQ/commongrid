const data = require("../data/utilities.json");
const names = data.map((u) => ({ name: u.name, slug: u.slug, segment: u.segment }));

const issues = [];

const skipWords = new Set([
  "of",
  "the",
  "and",
  "in",
  "at",
  "for",
  "or",
  "au",
  "de",
  "du",
  "des",
  "la",
  "le",
  "les",
  "a",
  "an",
]);

for (const u of names) {
  const n = u.name;

  if (/^[A-Z\s&\-'.,()/0-9]+$/.test(n) && n.length > 5) {
    issues.push({ type: "ALL_CAPS", name: n, slug: u.slug });
  }

  if (/\bElec\b/i.test(n) && !/\bElectric/i.test(n)) {
    issues.push({ type: "ABBREV_ELEC", name: n, slug: u.slug });
  }
  if (/\bCoop\b/i.test(n) && !/\bCooperative/i.test(n)) {
    issues.push({ type: "ABBREV_COOP", name: n, slug: u.slug });
  }
  if (/\bComm\b/.test(n)) {
    issues.push({ type: "ABBREV_COMM", name: n, slug: u.slug });
  }
  if (/\bCorp\b/.test(n) && !/\bCorporation/.test(n)) {
    issues.push({ type: "ABBREV_CORP", name: n, slug: u.slug });
  }
  if (/\bAssn\b/.test(n)) {
    issues.push({ type: "ABBREV_ASSN", name: n, slug: u.slug });
  }
  if (/\bDept\b/.test(n)) {
    issues.push({ type: "ABBREV_DEPT", name: n, slug: u.slug });
  }
  if (/\bPwr\b/.test(n)) {
    issues.push({ type: "ABBREV_PWR", name: n, slug: u.slug });
  }
  if (/\bSvcs?\b/.test(n)) {
    issues.push({ type: "ABBREV_SVC", name: n, slug: u.slug });
  }
  if (/\bServ\b/.test(n) && !/\bService/.test(n)) {
    issues.push({ type: "ABBREV_SERV", name: n, slug: u.slug });
  }
  if (/\bDist\b/.test(n) && !/\bDistri/.test(n)) {
    issues.push({ type: "ABBREV_DIST", name: n, slug: u.slug });
  }
  if (/\bDiv\b/.test(n) && !/\bDivision/.test(n)) {
    issues.push({ type: "ABBREV_DIV", name: n, slug: u.slug });
  }
  if (/\bAdmin\b/.test(n) && !/\bAdministration/.test(n)) {
    issues.push({ type: "ABBREV_ADMIN", name: n, slug: u.slug });
  }
  if (/\bAuth\b/.test(n) && !/\bAuthority/.test(n)) {
    issues.push({ type: "ABBREV_AUTH", name: n, slug: u.slug });
  }
  if (/\bMunic\b/.test(n) && !/\bMunicipal/.test(n)) {
    issues.push({ type: "ABBREV_MUNIC", name: n, slug: u.slug });
  }
  if (/\bLtd\b/.test(n)) {
    issues.push({ type: "ABBREV_LTD", name: n, slug: u.slug });
  }
  if (/\bMgt\b/.test(n)) {
    issues.push({ type: "ABBREV_MGT", name: n, slug: u.slug });
  }
  if (/\bOps\b/.test(n)) {
    issues.push({ type: "ABBREV_OPS", name: n, slug: u.slug });
  }
  if (/\bRur\b/.test(n)) {
    issues.push({ type: "ABBREV_RUR", name: n, slug: u.slug });
  }
  if (/\bAssoc\b/.test(n) && !/\bAssociation/.test(n)) {
    issues.push({ type: "ABBREV_ASSOC", name: n, slug: u.slug });
  }
  if (/\bCo\b/.test(n) && !/\bCo(mpany|unty|operative|mmission|rp|-\w)/.test(n)) {
    issues.push({ type: "ABBREV_CO", name: n, slug: u.slug });
  }
  if (/\bPub\b/.test(n) && !/\bPublic/.test(n)) {
    issues.push({ type: "ABBREV_PUB", name: n, slug: u.slug });
  }

  if (n !== n.trim()) {
    issues.push({ type: "WHITESPACE", name: JSON.stringify(n), slug: u.slug });
  }

  if (/ {2}/.test(n)) {
    issues.push({ type: "DOUBLE_SPACE", name: n, slug: u.slug });
  }

  const words = n.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (i > 0 && skipWords.has(w.toLowerCase())) continue;
    if (w.length <= 1 || /^\d/.test(w) || /^[A-Z&]+$/.test(w)) continue;
    if (/^[a-z]/.test(w)) {
      issues.push({ type: "LOWERCASE_WORD", name: n, slug: u.slug });
      break;
    }
  }
}

const grouped = {};
for (const i of issues) {
  if (!grouped[i.type]) grouped[i.type] = [];
  grouped[i.type].push(i.name);
}

const groupedEntries = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);
for (const [type, names] of groupedEntries) {
  console.log(`\n=== ${type} (${names.length}) ===`);
  for (const n of names.slice(0, 20)) console.log(`  ${n}`);
  if (names.length > 20) console.log(`  ... and ${names.length - 20} more`);
}

console.log(`\nTotal issues: ${issues.length}`);
console.log(`Unique utilities with issues: ${new Set(issues.map((i) => i.slug)).size}`);
