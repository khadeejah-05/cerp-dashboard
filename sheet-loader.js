// =====================================================================
// CERP Dashboard — Google Sheet Data Loader
// =====================================================================
// Fetches live data from a published Google Sheet (as CSV) and converts
// each row into the project object shape the dashboard expects.
//
// HOW TO POINT THIS AT YOUR OWN SHEET:
// 1. In Google Sheets: File > Share > Publish to web
// 2. Choose the correct tab, set format to "Comma-separated values (.csv)"
// 3. Click Publish, copy the URL it gives you
// 4. Paste that URL below as SHEET_CSV_URL
//
// SHEET COLUMN FORMAT (first row = headers, exact names matter):
//   id | name | theme | subtheme | description | partners | status |
//   confidence | evaluationType | studyDesign | services | verticals
//
// The last four columns (evaluationType, studyDesign, services, verticals)
// are OPTIONAL in the sheet. If your sheet doesn't have them yet, or leaves a
// row's cell blank, the dashboard falls back to the MANUAL_TAG_OVERRIDES
// table below (keyed by project id) so existing projects still filter
// correctly. Once you add real values for a project in the sheet, the
// sheet's value wins over the fallback automatically. "evaluationType" is
// legacy — nothing in the dashboard reads it anymore, it's parsed only in
// case it's still useful for your own records. "verticals" has no
// fallback — it's a new tagging dimension, so leave it blank until each
// project has been reviewed and tagged by hand.
//
// For columns that hold MULTIPLE values (theme, subtheme, evaluationType,
// studyDesign, services, verticals), separate values with a comma inside
// the cell, e.g.:
//   Education, Health
//
// Expected values —
//   studyDesign: "RCT", "Stepped Wedge", "Difference-in-Differences (DiD)",
//                "Matching", "Pre-Post / Before-After", "Descriptive",
//                "Qualitative", "Mixed Methods"
//     Tag by the project's PRIMARY IDENTIFICATION STRATEGY, not every
//     data-collection method it touches — a project with a comparison
//     group is tagged by its causal design (RCT, DiD, etc.) even if it
//     also runs some qualitative interviews as a secondary component.
//     Only use Qualitative or Mixed Methods when there's no counterfactual
//     driving the study, or when a qualitative/mixed strand is a
//     genuinely separate, co-equal study. Multi-study portfolio programs
//     that bundle genuinely distinct sub-studies (e.g. RISE, LEAPS) get
//     multi-tagged with each sub-study's design rather than forced into
//     one tag. Non-research/advisory projects aren't tagged here at all —
//     leave studyDesign empty for those.
//     "Quasi-Experimental", "Cross-Sectional", "Longitudinal" are older
//     tags some existing projects still carry — they still display fine,
//     just aren't part of the sidebar's filter tree anymore, so don't tag
//     new projects with them (use Descriptive, Difference-in-Differences
//     (DiD), or Matching instead).
//   services: "MLE", "Capacity Building", "Survey", "Software Development",
//             "Monitoring only"
//     Tag by the project's PRIMARY COMMISSIONED DELIVERABLE, not every
//     method touched — a project that used a survey as one input into a
//     larger evaluation is MLE, not Survey; Survey is reserved for
//     projects where the dataset itself is the entire deliverable. Two
//     genuinely separate deliverables (e.g. a survey that also feeds a
//     custom-built dashboard) get both tags. A small number of pure
//     program-design/delivery or incubation-management projects don't fit
//     any of these five — leave services empty for those. "Monitoring
//     only" is reserved for future third-party monitoring engagements;
//     no current project fits it cleanly, so don't force it onto one.
//   verticals: "Data Analytics", "Labs", "Survey", "Learning Hub",
//              "Policy Advisory", "Research", "Strategic Comms"
//
// "id" can be left blank — it will be auto-generated from the name if
// missing. Leave any multi-value cell blank for "none".
// =====================================================================

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQdYWlEGCyStnO_miYtaTUCuPl0P1SDHTYgtZ8fc-1uZSJRAzNX08AJJJ9T4Ftq7QvFjGoIPsCd05MQ/pub?gid=904451246&single=true&output=csv";

// Fields that should be split into arrays on commas
const LIST_FIELDS = ["theme", "subtheme", "evaluationType", "studyDesign", "services", "verticals"];

// ---------------------------------------------------------------------
// Fallback tags for the Study Design and Services filters, re-derived
// project-by-project from each description against the tagging rules in
// the header comment above. Only used when the sheet doesn't supply its
// own value for that project. Safe to delete a row's entry here once the
// sheet itself has real values for it — the sheet always wins.
//
// Rows marked FLAG below are genuine judgment calls made from the
// one-paragraph description alone (no explicit comparison-group language,
// or a Services category that doesn't cleanly match any of the five) —
// worth a second look from someone who knows the project, then fix
// directly in the sheet (which will override this fallback automatically).
// ---------------------------------------------------------------------
const MANUAL_TAG_OVERRIDES = {
  "econ-better-cotton-kap": { studyDesign: ["Mixed Methods"], services: ["MLE"] },
  "econ-day-labor": { studyDesign: ["RCT"], services: ["MLE"] },
  "econ-industrial-upgrading": { studyDesign: ["RCT", "Descriptive"], services: ["MLE"] }, // FLAG: bundles a randomized subsidy pilot (RCT) with long-run census tracking (Descriptive) — confirm both sub-studies still apply
  "econ-punjab-human-capital-market-assessment": { studyDesign: ["Mixed Methods"], services: ["Survey"] }, // FLAG: market-assessment/advisory work, Survey is a guess — may not fit any Services category cleanly
  "econ-retail-sme-segmentation": { studyDesign: ["Mixed Methods"], services: ["Survey"] }, // FLAG: market-segmentation consulting — could also be Capacity Building given its "M&E framework" output
  "edu-financing-support": { studyDesign: ["RCT"], services: ["MLE"] }, // FLAG: description doesn't name an explicit comparison group
  "edu-happiness": { studyDesign: ["Pre-Post / Before-After"], services: ["MLE"] },
  "edu-ilm-exchange": { studyDesign: [], services: ["Software Development"] },
  "edu-kpk-census": { studyDesign: ["Descriptive"], services: ["Survey"] },
  "edu-leaps": { studyDesign: ["Descriptive"], services: [] }, // FLAG: umbrella program (per your RISE/LEAPS example) — this description only reveals a single longitudinal panel; add sub-study tags directly in the sheet if LEAPS should carry more than one design here. Services excluded — broad research program, not a single evaluated intervention
  "edu-learning-beyond-school": { studyDesign: ["RCT"], services: ["MLE"] },
  "edu-market-tutors": { studyDesign: ["Descriptive"], services: ["Survey"] }, // FLAG: also involves tutor interviews and network analysis alongside the household survey
  "edu-niete": { studyDesign: ["Pre-Post / Before-After"], services: ["MLE"] }, // FLAG: was Quasi-Experimental under the old taxonomy; no explicit comparison-school group named in the description
  "edu-oosc-feasibility": { studyDesign: ["Descriptive"], services: [] }, // FLAG: feasibility/landscaping study informing a future financing model — doesn't evaluate an existing program
  "edu-parent-engagement": { studyDesign: ["RCT"], services: ["MLE"] }, // FLAG: "pilot study testing whether" — no explicit randomization language, inferred from J-PAL partnership
  "edu-rise": { studyDesign: ["Descriptive"], services: [] }, // FLAG: umbrella program (per your RISE/LEAPS example) — this description only reveals a single systems-level market analysis; add sub-study tags directly in the sheet if RISE should carry more than one design here. Services excluded — broad research program, not a single evaluated intervention
  "edu-taleemabad-validation": { studyDesign: ["Descriptive"], services: ["MLE"] },
  "edu-targeted-instruction": { studyDesign: ["RCT"], services: ["MLE"] },
  "edu-teachers-expectations": { studyDesign: ["RCT"], services: ["MLE"] },
  "edu-tech-empower": { studyDesign: ["RCT"], services: ["MLE"] },
  "edu-tip-balochistan": { studyDesign: ["Mixed Methods"], services: ["MLE"] },
  "edu-tip-ict-kpk": { studyDesign: ["RCT"], services: ["MLE"] },
  "fin-gsma-women-microentrepreneurs": { studyDesign: ["Qualitative"], services: ["MLE"] },
  "gov-clear-pca-planning-commission": { studyDesign: ["Qualitative"], services: ["Capacity Building"] },
  "gov-computer-vision-tax": { studyDesign: ["RCT"], services: ["Software Development", "MLE"] },
  "gov-imam-outreach": { studyDesign: ["Pre-Post / Before-After"], services: ["MLE"] },
  "gov-political-incorporation-migrants": { studyDesign: ["RCT"], services: ["MLE"] },
  "gov-political-linkages": { studyDesign: ["RCT"], services: ["MLE"] },
  "gov-procurement-efficiency": { studyDesign: ["Pre-Post / Before-After"], services: ["Software Development", "MLE"] },
  "gov-state-authority": { studyDesign: ["RCT"], services: ["MLE"] },
  "gov-willingness-to-pay-survey": { studyDesign: ["Descriptive"], services: ["Survey"] },
  "health-adaptive-social-protection": { studyDesign: ["Difference-in-Differences (DiD)"], services: ["MLE"] },
  "health-admin-data-punjab-health": { studyDesign: ["Descriptive"], services: ["Capacity Building"] },
  "health-anc-mamta": { studyDesign: ["Stepped Wedge"], services: ["MLE"] },
  "health-bep-market-test": { studyDesign: ["Descriptive"], services: ["Capacity Building"] }, // FLAG: reads as delivery/piloting support more than a discrete study — both fields are a guess
  "health-bigcatchup": { studyDesign: ["Mixed Methods"], services: ["MLE"] },
  "health-camps-kp-balochistan": { studyDesign: ["Qualitative"], services: ["MLE"] },
  "health-demand-maternal-supplements": { studyDesign: ["Descriptive"], services: ["Survey"] },
  "health-dmpa-sc": { studyDesign: ["Mixed Methods"], services: ["MLE"] },
  "health-femtech": { studyDesign: [], services: [] }, // excluded — incubation/hub management, not research or one of the five Services categories
  "health-growth-monitoring-tool": { studyDesign: ["RCT"], services: ["Software Development", "MLE"] },
  "health-hepatitis": { studyDesign: ["Descriptive"], services: ["Capacity Building"] },
  "health-independent-audit-isd": { studyDesign: ["Qualitative"], services: ["MLE"] }, // FLAG: reads very close to "Monitoring only" (independent third-party monitoring), but per your instruction that tag is reserved for future engagements only
  "health-lady-health-worker": { studyDesign: ["Descriptive"], services: ["Software Development"] }, // FLAG: built a custom monitoring app but also runs an ongoing performance study — could arguably carry both Software Development and MLE
  "health-mcw-products": { studyDesign: ["Descriptive"], services: [] }, // FLAG: market analysis informing future intervention strategy — doesn't evaluate an existing program
  "health-micare": { studyDesign: [], services: ["Software Development"] },
  "health-micare-bep-business-model": { studyDesign: ["Pre-Post / Before-After"], services: ["Software Development", "MLE"] },
  "health-mnch-healthtech": { studyDesign: [], services: ["Software Development"] },
  "health-ppif-behavioral-fp": { studyDesign: ["Mixed Methods"], services: ["MLE"] },
  "health-prism-his-evaluation": { studyDesign: ["Mixed Methods"], services: ["Capacity Building"] },
  "health-private-study": { studyDesign: ["Descriptive"], services: ["Survey"] },
  "health-r4d-mcw-commodities": { studyDesign: ["Descriptive"], services: [] }, // FLAG: landscaping/desk study — doesn't evaluate an existing program
  "health-scale": { studyDesign: ["Descriptive"], services: ["Survey"] }, // FLAG: COVID policy-advisory work built around survey data collection — may not fit any Services category cleanly
  "health-screening-camps": { studyDesign: ["Descriptive"], services: [] }, // FLAG: analysis of existing screening data — doesn't clearly evaluate a program or build a client's M&E system
  "health-sehatdost": { studyDesign: [], services: ["Software Development"] },
  "health-sopran": { studyDesign: ["Descriptive"], services: ["MLE"] }, // FLAG: description doesn't name a specific comparison design for this ongoing MLE engagement
  "misc-agri-lending": { studyDesign: ["Descriptive"], services: ["MLE"] },
  "misc-air-pollution": { studyDesign: ["Descriptive"], services: ["Survey"] },
  "misc-asset-transfer": { studyDesign: ["RCT"], services: ["MLE"] },
  "misc-climate-adaptation": { studyDesign: ["Descriptive"], services: ["Survey"] }, // FLAG: long-run household tracking study, not evaluating one specific program
  "misc-crop-burning": { studyDesign: ["Difference-in-Differences (DiD)"], services: ["MLE"] }, // FLAG: was Quasi-Experimental under the old taxonomy; DiD is a best guess among its more specific successors
  "misc-ecd-ultrapoor": { studyDesign: ["RCT"], services: ["MLE"] },
  "misc-food-insecurity-survey": { studyDesign: ["Descriptive"], services: ["Survey", "Software Development"] },
  "misc-gender-transport": { studyDesign: ["RCT"], services: ["MLE"] }, // FLAG: "tests whether X can reduce Y" — no explicit randomization language, inferred from IGC/J-PAL partnership
  "misc-property-tax": { studyDesign: ["Pre-Post / Before-After"], services: ["Software Development", "MLE"] }, // FLAG: "measure adoption of digital reforms" implied a before/after comparison — no explicit control group named
  "misc-punjab-economic-opportunities": { studyDesign: ["Descriptive"], services: ["MLE"] }, // FLAG: description doesn't name an explicit comparison design despite "measure effects" language
  "misc-pxd-weather": { studyDesign: ["RCT"], services: ["MLE"] }, // FLAG: "test how standalone/integrated messages" implies arms being compared, but randomization isn't stated explicitly
  "misc-social-compact": { studyDesign: ["Descriptive"], services: ["MLE"] }, // FLAG: examines a governance reform's effect on compliance — no explicit program being evaluated
  "misc-social-norms": { studyDesign: ["RCT"], services: ["MLE"] },
  "misc-training-quality": { studyDesign: ["Descriptive"], services: ["MLE"] },
  "misc-womens-mobility": { studyDesign: ["RCT"], services: ["MLE"] },
  "misc-zinc-wheat": { studyDesign: ["Descriptive"], services: ["MLE"] },
};

// =====================================================================
// PROJECT RESOURCES — detail-page links (e.g. PDFs, decks, dashboards)
// =====================================================================
// Add resources for a project here. Each project's detail page (click
// any card, or visit #/project/<id>) lists whatever is in its array.
//
// Add an item like this:
//   { label: "Endline report (PDF)", url: "https://example.org/report.pdf", type: "pdf" }
//
// "type" controls the little icon shown — use one of:
//   "pdf"   — PDF document
//   "link"  — generic webpage
//   "data"  — dataset / dashboard
//   "doc"   — Word/Google doc, slides, etc.
// "type" is optional; it defaults to "link" if omitted.
//
// You can add as many items as you want per project, in any order.
// Leave the array empty ( [] ) for projects with nothing to add yet.
// =====================================================================
const PROJECT_RESOURCES = {
  // TIP – Balochistan Rollout
  "edu-tip-balochistan": [],
  // TIP – ICT & KPK
  "edu-tip-ict-kpk": [],
  // National Institute of Excellence in Teacher Education (NIETE)
  "edu-niete": [],
  // Teacher's Expectations Project
  "edu-teachers-expectations": [],
  // Ilm Exchange
  "edu-ilm-exchange": [],
  // Taleemabad Evaluation Validation Exercise
  "edu-taleemabad-validation": [],
  // Research on Improving Systems of Education (RISE)
  "edu-rise": [],
  // Learning and Educational Achievements in Pakistan Schools (LEAPS)
  "edu-leaps": [],
  // Khyber Pakhtunkhwa School Census
  "edu-kpk-census": [],
  // Feasibility Study: Out-of-School Children & Outcome-Based Financing
  "edu-oosc-feasibility": [],
  // Education Financing and Support Services Project
  "edu-financing-support": [],
  // Parent Engagement Project
  "edu-parent-engagement": [],
  // Technology to Empower Actors Across the Learning Ecosystem
  "edu-tech-empower": [],
  // Learning Beyond School: Out-of-School Adolescent Girls in Pakistan
  "edu-learning-beyond-school": [],
  // Market for Tutors
  "edu-market-tutors": [],
  // Evaluation of The Happiness Project
  "edu-happiness": [],
  // MLE for Leveraging Pakistan's Social Protection Program for Adolescent Girls' Nutrition (SOPRAN)
  "health-sopran": [],
  // Smart Containment with Active Learning (SCALE)
  "health-scale": [],
  // Analysis of Health Week Screening Camps
  "health-screening-camps": [],
  // Private Healthcare Study
  "health-private-study": [],
  // MLE of DMPA-SC Roll-out through Private Sector
  "health-dmpa-sc": [],
  // MLE of Adaptive Social Protection
  "health-adaptive-social-protection": [],
  // Case Studies of Big Catch-up Activities in LMICs
  "health-bigcatchup": [],
  // Assessment of Health Camps in KP and Balochistan
  "health-camps-kp-balochistan": [],
  // Hepatitis Control Program (Health Data System Practices and Budget Impact Analysis)
  "health-hepatitis": [],
  // Increasing Uptake of ANC Services by Mamta Beneficiaries
  "health-anc-mamta": [],
  // Increasing Access to MCW Products
  "health-mcw-products": [],
  // Improving MNCH Outcomes: HealthTech Solutions with a Purpose
  "health-mnch-healthtech": [],
  // Creating Indigenous Digital Tools: Women-Led Digital Solutions (MiCare)
  "health-micare": [],
  // Sehatdost
  "health-sehatdost": [],
  // Femtech Innovation Hub for Pakistan
  "health-femtech": [],
  // Market Test of Balanced Energy Protein Supplement in Pakistan
  "health-bep-market-test": [],
  // Asset Transfer Project
  "misc-asset-transfer": [],
  // World Bank Food Insecurity Survey
  "misc-food-insecurity-survey": [],
  // Impact of Social Assistance on Early Childhood Development among Ultra-Poor Households
  "misc-ecd-ultrapoor": [],
  // Barriers to Climate Adaptation
  "misc-climate-adaptation": [],
  // Harnessing Digital Extension to Promote Zinc-Biofortified Wheat Seeds
  "misc-zinc-wheat": [],
  // PxD Weather-Based Forecast Activity
  "misc-pxd-weather": [],
  // World Bank Project: Technical Assistance to Measure Air Pollution
  "misc-air-pollution": [],
  // Crop Burning in Punjab
  "misc-crop-burning": [],
  // Lending in Agriculture Project
  "misc-agri-lending": [],
  // Gender Norms and Transport Project
  "misc-gender-transport": [],
  // Women's Mobility Program
  "misc-womens-mobility": [],
  // Social Norms Project
  "misc-social-norms": [],
  // Social Compact: Urban Services and Taxes
  "misc-social-compact": [],
  // Property Tax Innovation through Digital Technology
  "misc-property-tax": [],
  // Training Quality Assessment of Circle's Digital Literacy Program
  "misc-training-quality": [],
  // Punjab Economic Opportunities Program
  "misc-punjab-economic-opportunities": [],
  // GSMA-Empowering Women Micro-Entrepreneurs
  "fin-gsma-women-microentrepreneurs": [],
  // Behavioral and Attitudinal Studies and Impact Assessment Surveys (PPIF)
  "health-ppif-behavioral-fp": [],
  // Barriers to Industrial Upgrading Project
  "econ-industrial-upgrading": [],
  // Political Linkages Project
  "gov-political-linkages": [],
  // State Authority Project
  "gov-state-authority": [],
  // Targeted Instruction Program
  "edu-targeted-instruction": [],
  // Computer Vision Project
  "gov-computer-vision-tax": [],
  // Demand for Maternal Nutritional Supplements Study
  "health-demand-maternal-supplements": [],
  // Retail SME Market Segmentation Study
  "econ-retail-sme-segmentation": [],
  // R4D - Increasing Access to Maternal and Child Wasting Nutrition Commodities
  "health-r4d-mcw-commodities": [],
  // MiCare: Impact of Technology Intervention on the Balanced Energy Protein Business Model
  "health-micare-bep-business-model": [],
  // Better Cotton: Comprehensive KAP Assessment Study & Data Collection
  "econ-better-cotton-kap": [],
  // Analysis of Administrative Data to Enhance M&E Practices in Punjab Health Department
  "health-admin-data-punjab-health": [],
  // PRISM Evaluation of Punjab's Health Information Systems
  "health-prism-his-evaluation": [],
  // Clear PCA Planning Commission
  "gov-clear-pca-planning-commission": [],
  // Willingness to Pay Survey
  "gov-willingness-to-pay-survey": [],
  // Market Assessment for Punjab Human Capital Investment Project Economic Inclusion Component (World Bank)
  "econ-punjab-human-capital-market-assessment": [],
  // Lady Health Worker Project
  "health-lady-health-worker": [],
  // Political Incorporation of Rural-to-Urban Migrants in Karachi
  "gov-political-incorporation-migrants": [],
  // Day Labor Project
  "econ-day-labor": [],
  // Growth Monitoring Tool Project
  "health-growth-monitoring-tool": [],
  // Procurement Efficiency Project
  "gov-procurement-efficiency": [],
  // Independent Audit of Integrated Service Delivery Interventions in Pakistan
  "health-independent-audit-isd": [],
  // Imam Outreach Project
  "gov-imam-outreach": [],
};

// ---------------------------------------------------------------------
// Minimal CSV parser (handles quoted fields, commas inside quotes, and
// escaped quotes "") — Google Sheets' published CSV uses this format.
// ---------------------------------------------------------------------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\r") {
        // skip, handled by \n
      } else if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
  }
  // last field/row if file doesn't end with newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(cell => cell.trim() !== ""));
}

function slugify(name, fallbackIndex) {
  const base = (name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `project-${fallbackIndex}`;
}

function splitList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function rowsToProjects(rows) {
  if (!rows.length) return [];

  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);

  return dataRows.map((cells, idx) => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = (cells[i] || "").trim();
    });

    const project = {
      id: obj.id ? obj.id.trim() : slugify(obj.name, idx),
      name: obj.name || "(Untitled project)",
      description: obj.description || "",
      partners: obj.partners || "",
      status: obj.status || "",
      confidence: obj.confidence ? obj.confidence.trim() : "confirmed"
    };

    LIST_FIELDS.forEach(field => {
      project[field] = splitList(obj[field]);
    });

    // Belt-and-braces: no matter what happens above (a missing column, a
    // renamed header, a weird cell), every list field is guaranteed to be
    // a real array by the time this function returns. A single malformed
    // row should never be able to crash the whole dashboard with a
    // "cannot read properties of undefined" error downstream.
    LIST_FIELDS.forEach(field => {
      if (!Array.isArray(project[field])) project[field] = [];
    });

    // Fall back to the manually-researched tags for studyDesign / services
    // whenever the sheet doesn't supply its own values for this project
    // (sheet wins whenever it has something).
    const fallback = MANUAL_TAG_OVERRIDES[project.id];
    if (fallback) {
      if (!project.studyDesign.length && fallback.studyDesign) project.studyDesign = fallback.studyDesign.slice();
      if (!project.services.length && fallback.services) project.services = fallback.services.slice();
    }

    // Attach resources for the project detail page (see PROJECT_RESOURCES above).
    const resources = PROJECT_RESOURCES[project.id];
    project.resources = Array.isArray(resources) ? resources : [];

    return project;
  }).filter(p => p.name && p.name !== "(Untitled project)" || p.description || p.theme.length);
}

// ---------------------------------------------------------------------
// Public loader: fetches the sheet and calls onReady(projects) when
// done, or onError(err) if something goes wrong (e.g. sheet not
// published, network issue, wrong URL still pasted as placeholder).
// ---------------------------------------------------------------------
function loadProjectsFromSheet(onReady, onError) {
  if (!SHEET_CSV_URL || SHEET_CSV_URL === "PASTE_YOUR_PUBLISHED_CSV_URL_HERE") {
    onError(new Error(
      "No Google Sheet URL configured yet. Open sheet-loader.js and paste your published CSV URL into SHEET_CSV_URL."
    ));
    return;
  }

  // No cache-busting query param here — Google's "pub" endpoint signs a
  // redirect to its CDN based on the request URL, and an extra unexpected
  // parameter tacked onto that can make it reject the request outright
  // (HTTP 400). The publish endpoint already sends its own short
  // Cache-Control (a few minutes), which is plenty fresh for this.
  fetch(SHEET_CSV_URL)
    .then(res => {
      if (!res.ok) throw new Error("Could not reach the Google Sheet (HTTP " + res.status + "). Make sure it's published to the web.");
      return res.text();
    })
    .then(text => {
      const rows = parseCSV(text);
      const projects = rowsToProjects(rows);
      if (!projects.length) throw new Error("The sheet loaded, but no project rows were found. Check the header row matches the expected column names.");
      onReady(projects);
    })
    .catch(err => onError(err));
}
