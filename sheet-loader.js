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
//   serviceLine | tier2 | tier3 | confidence | evaluationType | studyDesign
//
// The last two columns (evaluationType, studyDesign) are OPTIONAL in the
// sheet. If your sheet doesn't have them yet, or leaves a row's cell
// blank, the dashboard falls back to the MANUAL_TAG_OVERRIDES table
// below (keyed by project id) so existing projects still filter
// correctly. Once you add real values for a project in the sheet,
// the sheet's value wins over the fallback automatically.
//
// For columns that hold MULTIPLE values (theme, subtheme, serviceLine,
// tier2, tier3, evaluationType, studyDesign), separate values with a
// comma inside the cell, e.g.:
//   Education, Health
//
// Expected values —
//   evaluationType: "Process Evaluation", "Impact Evaluation",
//                    "Monitoring, Evaluation, and Learning (MLE)"
//   studyDesign:     "RCT", "Stepped Wedge", "Quasi-Experimental",
//                    "Difference-in-Difference (DiD)",
//                    "Pre-Post / Before-After", "Cross-Sectional",
//                    "Longitudinal", "Qualitative"
//
// "id" can be left blank — it will be auto-generated from the name if
// missing. Leave any multi-value cell blank for "none".
// =====================================================================

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQdYWlEGCyStnO_miYtaTUCuPl0P1SDHTYgtZ8fc-1uZSJRAzNX08AJJJ9T4Ftq7QvFjGoIPsCd05MQ/pub?output=csv";

// Fields that should be split into arrays on commas
const LIST_FIELDS = ["theme", "subtheme", "serviceLine", "tier2", "tier3", "evaluationType", "studyDesign"];

// ---------------------------------------------------------------------
// Fallback tags for the "Evaluation" and "Study Design" filters.
// These were assigned by reading every project description by hand.
// They're only used when the sheet doesn't supply its own value for
// that project — see the note above. Safe to delete a row's entry
// here once the sheet itself has real values for it.
// ---------------------------------------------------------------------
const MANUAL_TAG_OVERRIDES = {
  "econ-better-cotton-kap": { evaluationType: ["Process Evaluation"], studyDesign: ["Qualitative", "Cross-Sectional"] },
  "econ-day-labor": { evaluationType: ["Impact Evaluation"], studyDesign: ["RCT"] },
  "econ-industrial-upgrading": { evaluationType: ["Impact Evaluation"], studyDesign: ["RCT", "Longitudinal"] },
  "econ-punjab-human-capital-market-assessment": { evaluationType: [], studyDesign: ["Cross-Sectional", "Qualitative"] },
  "econ-retail-sme-segmentation": { evaluationType: [], studyDesign: ["Cross-Sectional", "Qualitative"] },
  "edu-financing-support": { evaluationType: ["Impact Evaluation"], studyDesign: [] },
  "edu-happiness": { evaluationType: ["Impact Evaluation"], studyDesign: ["Pre-Post / Before-After"] },
  "edu-ilm-exchange": { evaluationType: [], studyDesign: [] },
  "edu-kpk-census": { evaluationType: [], studyDesign: ["Cross-Sectional"] },
  "edu-leaps": { evaluationType: ["Impact Evaluation"], studyDesign: ["Longitudinal"] },
  "edu-learning-beyond-school": { evaluationType: ["Impact Evaluation"], studyDesign: ["RCT"] },
  "edu-market-tutors": { evaluationType: [], studyDesign: ["Cross-Sectional", "Qualitative"] },
  "edu-niete": { evaluationType: ["Process Evaluation", "Impact Evaluation"], studyDesign: ["Quasi-Experimental"] },
  "edu-oosc-feasibility": { evaluationType: [], studyDesign: ["Cross-Sectional"] },
  "edu-parent-engagement": { evaluationType: ["Impact Evaluation"], studyDesign: [] },
  "edu-rise": { evaluationType: [], studyDesign: ["Cross-Sectional"] },
  "edu-taleemabad-validation": { evaluationType: ["Process Evaluation"], studyDesign: ["Cross-Sectional"] },
  "edu-targeted-instruction": { evaluationType: ["Impact Evaluation"], studyDesign: ["RCT"] },
  "edu-teachers-expectations": { evaluationType: ["Impact Evaluation"], studyDesign: ["RCT"] },
  "edu-tech-empower": { evaluationType: ["Impact Evaluation"], studyDesign: ["RCT"] },
  "edu-tip-balochistan": { evaluationType: ["Process Evaluation"], studyDesign: ["Longitudinal", "Qualitative"] },
  "edu-tip-ict-kpk": { evaluationType: ["Impact Evaluation"], studyDesign: ["RCT"] },
  "fin-gsma-women-microentrepreneurs": { evaluationType: [], studyDesign: ["Qualitative"] },
  "gov-clear-pca-planning-commission": { evaluationType: [], studyDesign: ["Qualitative"] },
  "gov-computer-vision-tax": { evaluationType: ["Impact Evaluation"], studyDesign: ["RCT"] },
  "gov-imam-outreach": { evaluationType: ["Impact Evaluation"], studyDesign: ["Pre-Post / Before-After"] },
  "gov-political-incorporation-migrants": { evaluationType: ["Impact Evaluation"], studyDesign: ["RCT"] },
  "gov-political-linkages": { evaluationType: ["Impact Evaluation"], studyDesign: ["RCT"] },
  "gov-procurement-efficiency": { evaluationType: ["Impact Evaluation"], studyDesign: ["Pre-Post / Before-After"] },
  "gov-state-authority": { evaluationType: ["Impact Evaluation"], studyDesign: ["RCT"] },
  "gov-willingness-to-pay-survey": { evaluationType: [], studyDesign: ["Cross-Sectional"] },
  "health-adaptive-social-protection": { evaluationType: ["Monitoring, Evaluation, and Learning (MLE)", "Impact Evaluation"], studyDesign: ["Quasi-Experimental", "Difference-in-Difference (DiD)"] },
  "health-admin-data-punjab-health": { evaluationType: [], studyDesign: ["Cross-Sectional"] },
  "health-anc-mamta": { evaluationType: ["Impact Evaluation"], studyDesign: ["Stepped Wedge", "RCT"] },
  "health-bep-market-test": { evaluationType: [], studyDesign: [] },
  "health-bigcatchup": { evaluationType: ["Process Evaluation"], studyDesign: ["Qualitative"] },
  "health-camps-kp-balochistan": { evaluationType: ["Process Evaluation"], studyDesign: ["Qualitative"] },
  "health-demand-maternal-supplements": { evaluationType: [], studyDesign: ["Cross-Sectional"] },
  "health-dmpa-sc": { evaluationType: ["Monitoring, Evaluation, and Learning (MLE)"], studyDesign: [] },
  "health-femtech": { evaluationType: [], studyDesign: [] },
  "health-growth-monitoring-tool": { evaluationType: ["Impact Evaluation"], studyDesign: ["RCT"] },
  "health-hepatitis": { evaluationType: ["Process Evaluation"], studyDesign: ["Cross-Sectional"] },
  "health-independent-audit-isd": { evaluationType: ["Process Evaluation", "Monitoring, Evaluation, and Learning (MLE)"], studyDesign: ["Qualitative", "Longitudinal"] },
  "health-lady-health-worker": { evaluationType: [], studyDesign: ["Cross-Sectional"] },
  "health-mcw-products": { evaluationType: [], studyDesign: ["Cross-Sectional"] },
  "health-micare": { evaluationType: [], studyDesign: [] },
  "health-micare-bep-business-model": { evaluationType: ["Impact Evaluation"], studyDesign: ["Pre-Post / Before-After"] },
  "health-mnch-healthtech": { evaluationType: [], studyDesign: [] },
  "health-ppif-behavioral-fp": { evaluationType: ["Impact Evaluation"], studyDesign: ["Qualitative"] },
  "health-prism-his-evaluation": { evaluationType: ["Process Evaluation"], studyDesign: ["Qualitative", "Cross-Sectional"] },
  "health-private-study": { evaluationType: [], studyDesign: ["Cross-Sectional"] },
  "health-r4d-mcw-commodities": { evaluationType: [], studyDesign: ["Cross-Sectional"] },
  "health-scale": { evaluationType: [], studyDesign: ["Cross-Sectional"] },
  "health-screening-camps": { evaluationType: [], studyDesign: ["Cross-Sectional"] },
  "health-sehatdost": { evaluationType: [], studyDesign: [] },
  "health-sopran": { evaluationType: ["Monitoring, Evaluation, and Learning (MLE)"], studyDesign: [] },
  "misc-agri-lending": { evaluationType: [], studyDesign: ["Cross-Sectional"] },
  "misc-air-pollution": { evaluationType: [], studyDesign: ["Cross-Sectional"] },
  "misc-asset-transfer": { evaluationType: ["Impact Evaluation"], studyDesign: ["RCT"] },
  "misc-climate-adaptation": { evaluationType: ["Impact Evaluation"], studyDesign: ["Longitudinal"] },
  "misc-crop-burning": { evaluationType: ["Impact Evaluation"], studyDesign: ["Quasi-Experimental"] },
  "misc-ecd-ultrapoor": { evaluationType: ["Impact Evaluation"], studyDesign: ["RCT"] },
  "misc-food-insecurity-survey": { evaluationType: [], studyDesign: ["Cross-Sectional"] },
  "misc-gender-transport": { evaluationType: ["Impact Evaluation"], studyDesign: [] },
  "misc-property-tax": { evaluationType: [], studyDesign: [] },
  "misc-punjab-economic-opportunities": { evaluationType: ["Impact Evaluation"], studyDesign: [] },
  "misc-pxd-weather": { evaluationType: ["Impact Evaluation"], studyDesign: [] },
  "misc-social-compact": { evaluationType: [], studyDesign: ["Cross-Sectional"] },
  "misc-social-norms": { evaluationType: ["Impact Evaluation"], studyDesign: ["RCT"] },
  "misc-training-quality": { evaluationType: ["Process Evaluation"], studyDesign: ["Cross-Sectional"] },
  "misc-womens-mobility": { evaluationType: ["Impact Evaluation"], studyDesign: ["RCT"] },
  "misc-zinc-wheat": { evaluationType: ["Process Evaluation"], studyDesign: ["Cross-Sectional"] },
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

    // Fall back to the manually-researched tags for evaluationType /
    // studyDesign whenever the sheet doesn't supply its own values for
    // this project (sheet wins whenever it has something).
    const fallback = MANUAL_TAG_OVERRIDES[project.id];
    if (fallback) {
      if (!project.evaluationType.length) project.evaluationType = fallback.evaluationType.slice();
      if (!project.studyDesign.length) project.studyDesign = fallback.studyDesign.slice();
    }

    // Attach resources for the project detail page (see PROJECT_RESOURCES above).
    project.resources = PROJECT_RESOURCES[project.id] || [];

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

  // Cache-bust so the browser doesn't serve a stale copy of the CSV
  const url = SHEET_CSV_URL + (SHEET_CSV_URL.includes("?") ? "&" : "?") + "_=" + Date.now();

  fetch(url)
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
