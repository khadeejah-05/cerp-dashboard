// =====================================================================
// CERP Dashboard — Google Sheet Data Loader
// =====================================================================
// This file replaces the old static data.js. Instead of a hardcoded
// PROJECTS array, it fetches live data from a published Google Sheet
// (as CSV) and converts each row into the same project object shape
// the dashboard already expects.
//
// HOW TO POINT THIS AT YOUR OWN SHEET:
// 1. In Google Sheets: File > Share > Publish to web
// 2. Choose the correct tab, set format to "Comma-separated values (.csv)"
// 3. Click Publish, copy the URL it gives you
// 4. Paste that URL below as SHEET_CSV_URL
//
// SHEET COLUMN FORMAT (first row = headers, exact names matter):
//   id | name | theme | subtheme | description | partners | status |
//   serviceLine | tier2 | tier3 | confidence
//
// For columns that hold MULTIPLE values (theme, subtheme, serviceLine,
// tier2, tier3), separate values with a comma inside the cell, e.g.:
//   Education, Health
//
// "id" can be left blank — it will be auto-generated from the name if
// missing. Leave any multi-value cell blank for "none".
// =====================================================================

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQdYWlEGCyStnO_miYtaTUCuPl0P1SDHTYgtZ8fc-1uZSJRAzNX08AJJJ9T4Ftq7QvFjGoIPsCd05MQ/pub?output=csv";

// Fields that should be split into arrays on commas
const LIST_FIELDS = ["theme", "subtheme", "serviceLine", "tier2", "tier3"];

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
