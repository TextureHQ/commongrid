const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(__dirname, "../data/utilities.json");
const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

// Slug-based overrides where automated word expansion would produce wrong results
const nameOverrides = {
  "snapping-shoals-el-member": "Snapping Shoals Electric Membership Corporation",
  "coweta-fayette-el-member": "Coweta-Fayette Electric Membership Corporation",
  "baldwin-county-el-member": "Baldwin County Electric Membership Corporation",
  "central-georgia-el-member": "Central Georgia Electric Membership Corporation",
  "carteret-craven-el-member": "Carteret-Craven Electric Membership Corporation",
  "okefenoke-rural-el-member": "Okefenoke Rural Electric Membership Corporation",
  "little-ocmulgee-el-member": "Little Ocmulgee Electric Membership Corporation",
  "middle-georgia-el-member": "Middle Georgia Electric Membership Corporation",
  "panhandle-rural-el-member-association": "Panhandle Rural Electric Membership Association",

  "pearl-river-valley-el-power-association": "Pearl River Valley Electric Power Association",
  "white-river-valley-el-co-op": "White River Valley Electric Cooperative",
  "florida-keys-el-co-op-association": "Florida Keys Electric Cooperative Association",
  "west-florida-el-co-op-association": "West Florida Electric Cooperative Association",
  "continental-divide-el-co-op": "Continental Divide Electric Cooperative",
  "central-new-mexico-el-co-op": "Central New Mexico Electric Cooperative",
  "guernsey-muskingum-el-co-op": "Guernsey-Muskingum Electric Cooperative",
  "south-central-ark-el-co-op": "South Central Arkansas Electric Cooperative",
  "allamakee-clayton-el-co-op": "Allamakee-Clayton Electric Cooperative",
  "blachly-lane-county-co-op-el-association": "Blachly-Lane County Cooperative Electric Association",
  "bon-homme-yankton-el-association": "Bon Homme Yankton Electric Association",
  "butler-rural-el-co-op-association": "Butler Rural Electric Cooperative Association",
  "caney-valley-el-co-op-association": "Caney Valley Electric Cooperative Association",
  "sedgwick-county-el-co-op-association": "Sedgwick County Electric Cooperative Association",
  "washington-island-el-co-op": "Washington Island Electric Cooperative",
  "northeast-missouri-el-pwr-coop": "Northeast Missouri Electric Power Cooperative",
  "oregon-trail-el-cons-co-op": "Oregon Trail Electric Consumers Cooperative",

  "south-utah-valley-elec-svc-dist": "South Utah Valley Electric Service District",
  "central-montana-elec-power-co-op": "Central Montana Electric Power Cooperative",
  "new-england-elec-transm-n-corp": "New England Electric Transmission Corporation",
  "new-england-hydro-tran-elec-co": "New England Hydro-Transmission Electric Company",

  "wisconsin-rapids-w-w-and-l-comm": "Wisconsin Rapids Water Works & Lighting Commission",
  "wyandotte-municipal-serv-comm": "Wyandotte Municipal Services Commission",
  "newnan-wtr-sewer-and-light-comm": "Newnan Water, Sewerage & Light Commission",
  "new-castle-municipal-serv-comm": "New Castle Municipal Services Commission",
  "public-serv-comm-of-yazoo-city": "Public Service Commission of Yazoo City",
  "fitzgerald-wtr-lgt-and-bond-comm": "Fitzgerald Water, Light & Bond Commission",
  "tuntutuliak-comm-services-association": "Tuntutuliak Community Services Association",
  "tuolumne-county-pub-power-agny": "Tuolumne County Public Power Agency",
  "central-nebraska-public-power-irrigation-dist": "Central Nebraska Public Power & Irrigation District",
  "strawberry-electric-serv-district": "Strawberry Electric Service District",
  chelco: "Choctawhatchee Electric Cooperative",
  "new-england-hydro-trans-corp": "New England Hydro-Transmission Corporation",
  "south-carolina-genertg-co": "South Carolina Generating Company",
  "southern-electric-gen-co": "Southern Electric Generating Company",
  "vermont-electric-trans-co-inc": "Vermont Electric Transmission Company",
  "tri-state-gandt-assn-inc": "Tri-State Generation & Transmission Association",
  "northern-indiana-pub-serv": "Northern Indiana Public Service Company",

  "public-service-co-of-nm": "Public Service Company of New Mexico",
  "public-service-co-of-nh": "Public Service Company of New Hampshire",
};

const abbreviationMap = {
  Comm: "Commission",
  Corp: "Corporation",
  "Corp.": "Corporation",
  "Assn.": "Association",
  Assn: "Association",
  Dept: "Department",
  Co: "Company",
  "Co.": "Company",
  Pub: "Public",
};

// "El" and "Elec" look like abbreviations but are ambiguous
// (e.g. "El Paso" vs "El" meaning "Electric") — handled via slug overrides
const doNotExpand = new Set(["El", "Elec", "Elec."]);

let changeCount = 0;
const changes = [];

for (const utility of data) {
  const originalName = utility.name;
  let newName = originalName;

  if (nameOverrides[utility.slug]) {
    newName = nameOverrides[utility.slug];
  } else {
    const words = newName.split(/\s+/);
    const expandedWords = words.map((word) => {
      if (doNotExpand.has(word)) return word;
      if (abbreviationMap[word]) {
        return abbreviationMap[word];
      }
      return word;
    });
    newName = expandedWords.join(" ");
  }

  newName = newName.replace(/\s+/g, " ").trim();

  if (newName !== originalName) {
    changes.push({ slug: utility.slug, from: originalName, to: newName });
    utility.name = newName;
    changeCount++;
  }
}

console.log(`\nChanges (${changeCount}):`);
for (const c of changes) {
  console.log(`  "${c.from}"`);
  console.log(`    → "${c.to}"`);
  console.log();
}

fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
console.log(`\nWrote ${changeCount} changes to utilities.json`);
