/**
 * Deterministic PBIR generator for the RetailSalesDemo portfolio report.
 * Run: node build/build_report.js  (writes RetailSalesDemo.Report + RetailSalesDemo.pbip)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(ROOT, "RetailSalesDemo.Report");
const DEF = path.join(REPORT_DIR, "definition");

// ---------- design tokens ----------
const C = {
  accent: "#2563EB",
  accentDark: "#1E3A8A",
  accentLight: "#93C5FD",
  accentTint: "#DBEAFE",
  grey: "#9CA3AF",
  ink: "#111827",
  ink2: "#374151",
  ink3: "#6B7280",
  line: "#E5E7EB",
  canvas: "#F3F4F6",
  white: "#FFFFFF",
  bad: "#DC2626",
};
const FONT = "Segoe UI";
const FONT_SEMI = "Segoe UI Semibold";
const THEME_NAME = "PortfolioClean-7c3f91a2.json";
const SCHEMA = {
  visual: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.9.0/schema.json",
  page: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
  pages: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json",
  report: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.1.0/schema.json",
  version: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json",
  pbir: "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json",
  pbip: "https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json",
  platform: "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
  theme: "https://raw.githubusercontent.com/microsoft/powerbi-desktop-samples/main/Report%20Theme%20JSON%20Schema/reportThemeSchema-2.143.json",
};

// ---------- deterministic ids ----------
function hexId(seed, len = 20) {
  return crypto.createHash("sha1").update(seed).digest("hex").slice(0, len);
}
const PAGE1 = hexId("page:overview");
const PAGE2 = hexId("page:products");

// ---------- expression helpers ----------
const lit = (v) => ({ expr: { Literal: { Value: v } } });
const str = (s) => lit(`'${String(s).replace(/'/g, "''")}'`);
const num = (n) => lit(`${n}D`);
const int = (n) => lit(`${n}L`);
const bool = (b) => lit(b ? "true" : "false");
const fill = (hex) => ({ solid: { color: lit(`'${hex}'`) } });
const srcRef = (t) => ({ SourceRef: { Entity: t } });
const colExpr = (t, p) => ({ Column: { Expression: srcRef(t), Property: p } });
const measExpr = (t, p) => ({ Measure: { Expression: srcRef(t), Property: p } });
const col = (t, p, extra = {}) => ({ field: colExpr(t, p), queryRef: `${t}.${p}`, nativeQueryRef: p, ...extra });
const meas = (t, p, extra = {}) => ({ field: measExpr(t, p), queryRef: `${t}.${p}`, nativeQueryRef: p, ...extra });
const M = "_Measures";
const m = (p, extra) => meas(M, p, extra);
const sortBy = (field, direction = "Descending") => ({ sort: [{ field, direction }], isDefaultSort: false });

// ---------- visual container helpers ----------
function vco({ title, subtitle, background = true, border = true, padding = 8, extra = {} } = {}) {
  const o = {};
  if (title !== undefined) {
    o.title = [{ properties: { show: bool(!!title), ...(title ? { text: str(title), fontFamily: str(FONT_SEMI), fontSize: num(12), fontColor: fill(C.ink) } : {}) } }];
  }
  if (subtitle !== undefined) {
    o.subTitle = [{ properties: { show: bool(!!subtitle), ...(subtitle ? { text: str(subtitle), fontFamily: str(FONT), fontSize: num(9), fontColor: fill(C.ink3) } : {}) } }];
  }
  o.background = [{ properties: background ? { show: bool(true), color: fill(C.white), transparency: num(0) } : { show: bool(false) } }];
  o.border = [{ properties: border ? { show: bool(true), color: fill(C.line), radius: num(6), width: num(1) } : { show: bool(false) } }];
  o.padding = [{ properties: { top: num(padding), bottom: num(padding), left: num(padding), right: num(padding) } }];
  return { ...o, ...extra };
}

let zCounter = 0;
function visual({ id, x, y, w, h, type, query, objects, vcos, sort, syncGroup, filters }) {
  zCounter += 1000;
  const v = {
    $schema: SCHEMA.visual,
    name: id,
    position: { x, y, z: zCounter, height: h, width: w, tabOrder: zCounter },
    visual: { visualType: type },
  };
  if (syncGroup) v.visual.syncGroup = syncGroup;
  if (query) v.visual.query = { queryState: query, ...(sort ? { sortDefinition: sort } : {}) };
  if (objects) v.visual.objects = objects;
  if (vcos) v.visual.visualContainerObjects = vcos;
  if (filters) v.filterConfig = { filters };
  return v;
}

// Visual-level Top N filter on a column, ranked by Sum(<table>.<sumColumn>)
function topNFilter(seed, table, column, sumColumn, n) {
  const alias = "t";
  return {
    name: "Filter" + hexId(seed, 24),
    field: colExpr(table, column),
    type: "TopN",
    filter: {
      Version: 2,
      From: [
        {
          Name: "subquery",
          Expression: {
            Subquery: {
              Query: {
                Version: 2,
                From: [{ Name: alias, Entity: table, Type: 0 }],
                Select: [{ Column: { Expression: { SourceRef: { Source: alias } }, Property: column }, Name: "field" }],
                OrderBy: [{ Direction: 2, Expression: { Aggregation: { Expression: { Column: { Expression: { SourceRef: { Source: alias } }, Property: sumColumn } }, Function: 0 } } }],
                Top: n,
              },
            },
          },
          Type: 2,
        },
        { Name: alias, Entity: table, Type: 0 },
      ],
      Where: [{ Condition: { In: { Expressions: [{ Column: { Expression: { SourceRef: { Source: alias } }, Property: column } }], Table: { SourceRef: { Source: "subquery" } } } } }],
    },
    howCreated: "User",
  };
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

// ---------- reusable visuals ----------
function headerTextbox(pageKey, title, subtitle) {
  return visual({
    id: hexId(`${pageKey}:header`), x: 24, y: 14, w: 740, h: 60, type: "textbox",
    objects: {
      general: [{
        properties: {
          paragraphs: [
            { textRuns: [{ value: title, textStyle: { fontFamily: FONT_SEMI, fontSize: "18pt", color: C.ink } }], horizontalTextAlignment: "left" },
            { textRuns: [{ value: subtitle, textStyle: { fontFamily: FONT, fontSize: "9pt", color: C.ink3 } }], horizontalTextAlignment: "left" },
          ],
        },
      }],
    },
    vcos: vco({ background: false, border: false, padding: 0 }),
  });
}

function slicer(pageKey, { key, x, table, column, label, selected }) {
  const objects = {
    data: [{ properties: { mode: str("Dropdown") } }],
    header: [{ properties: { show: bool(true), text: str(label), fontFamily: str(FONT_SEMI), textSize: num(9), fontColor: fill(C.ink3) } }],
    items: [{ properties: { fontFamily: str(FONT), textSize: num(10), fontColor: fill(C.ink) } }],
    selection: [{ properties: { selectAllCheckboxEnabled: bool(true), singleSelect: bool(false) } }],
  };
  if (selected !== undefined) {
    objects.general = [{
      properties: {
        filter: {
          filter: {
            Version: 2,
            From: [{ Name: "s", Entity: table, Type: 0 }],
            Where: [{
              Condition: {
                In: {
                  Expressions: [{ Column: { Expression: { SourceRef: { Source: "s" } }, Property: column } }],
                  Values: [[{ Literal: { Value: selected } }]],
                },
              },
            }],
          },
        },
      },
    }];
  }
  return visual({
    id: hexId(`${pageKey}:slicer:${key}`), x, y: 8, w: 144, h: 76, type: "slicer",
    syncGroup: { groupName: `${key}Sync`, fieldChanges: true, filterChanges: true },
    query: { Values: { projections: [col(table, column)] } },
    objects,
    vcos: vco({ padding: 0 }),
  });
}

function slicerRow(pageKey) {
  return [
    slicer(pageKey, { key: "Year", x: 800, table: "Date", column: "Year", label: "Year", selected: "2026L" }),
    slicer(pageKey, { key: "Region", x: 956, table: "Sales", column: "Region", label: "Region" }),
    slicer(pageKey, { key: "Channel", x: 1112, table: "Sales", column: "Channel", label: "Channel" }),
  ];
}

// KPI tile = a bordered single-value card (headline) + a transparent single-value card
// overlaid on its right half (YoY delta, green/red). Two visuals, one visual tile.
function kpiCard(pageKey, { key, x, measure, delta, deltaLabel = "vs. prior year", units = 0, precision = 1 }) {
  const main = visual({
    id: hexId(`${pageKey}:kpi:${key}`), x, y: 96, w: 296, h: 100, type: "cardVisual",
    query: { Data: { projections: [m(measure)] } },
    objects: {
      value: [{ properties: { fontFamily: str(FONT_SEMI), fontSize: num(24), bold: bool(true), fontColor: fill(C.ink), horizontalAlignment: str("left"), labelDisplayUnits: num(units), labelPrecision: int(precision) }, selector: { id: "default" } }],
      label: [{ properties: { show: bool(true), fontFamily: str(FONT), fontSize: num(9), fontColor: fill(C.ink3), position: str("aboveValue"), horizontalAlignment: str("left") }, selector: { id: "default" } }],
      outline: [{ properties: { show: bool(false) }, selector: { id: "default" } }],
      accentBar: [{ properties: { show: bool(true), position: str("Left"), width: num(4), color: fill(C.accent) }, selector: { id: "default" } }],
      layout: [{ properties: { topOuterMargin: int(6), bottomOuterMargin: int(6), leftOuterMargin: int(14), rightOuterMargin: int(0), paddingUniform: int(0) }, selector: { id: "default" } }],
    },
    vcos: vco({ padding: 0 }),
  });
  const deltaColor = {
    solid: {
      color: {
        expr: {
          Conditional: {
            Cases: [{
              Condition: { Comparison: { ComparisonKind: 2, Left: measExpr(M, delta), Right: { Literal: { Value: "0D" } } } },
              Value: { Literal: { Value: "'#15803D'" } },
            }],
            DefaultValue: { Literal: { Value: `'${C.bad}'` } },
          },
        },
      },
    },
  };
  const overlay = visual({
    id: hexId(`${pageKey}:kpi:${key}:delta`), x: x + 160, y: 96, w: 130, h: 100, type: "cardVisual",
    query: { Data: { projections: [m(delta)] } },
    objects: {
      value: [{ properties: { fontFamily: str(FONT_SEMI), fontSize: num(15), bold: bool(true), fontColor: deltaColor, horizontalAlignment: str("left") }, selector: { id: "default" } }],
      label: [{ properties: { show: bool(true), text: str(deltaLabel), fontFamily: str(FONT), fontSize: num(9), fontColor: fill(C.ink3), position: str("aboveValue"), horizontalAlignment: str("left") }, selector: { id: "default" } }],
      outline: [{ properties: { show: bool(false) }, selector: { id: "default" } }],
      accentBar: [{ properties: { show: bool(false) }, selector: { id: "default" } }],
      layout: [{ properties: { topOuterMargin: int(6), bottomOuterMargin: int(20), leftOuterMargin: int(0), rightOuterMargin: int(0), paddingUniform: int(0) }, selector: { id: "default" } }],
    },
    vcos: vco({ background: false, border: false, padding: 0 }),
  });
  return [main, overlay];
}

const axisFont = { fontFamily: str(FONT), fontSize: num(9), labelColor: fill(C.ink3) };
const gridlines = { gridlineShow: bool(true), gridlineColor: fill(C.canvas), gridlineThickness: num(1), gridlineStyle: str("solid") };

// ---------- Page 1: Sales Overview ----------
function page1Visuals() {
  const P = "p1";
  const vis = [];
  vis.push(headerTextbox(P, "Sales Overview", "Synthetic retail dataset  |  Jan 2025 - Oct 2026  |  USD  |  Use the slicers to change year, region and channel"));
  vis.push(...slicerRow(P));
  vis.push(...kpiCard(P, { key: "rev", x: 24, measure: "Total Revenue", delta: "Revenue YoY %", units: 1000000, precision: 2 }));
  vis.push(...kpiCard(P, { key: "profit", x: 336, measure: "Total Profit", delta: "Profit YoY %", units: 1000, precision: 0 }));
  vis.push(...kpiCard(P, { key: "margin", x: 648, measure: "Margin %", delta: "Margin vs PY (pts)", deltaLabel: "pts vs. prior year", units: 1, precision: 1 }));
  vis.push(...kpiCard(P, { key: "orders", x: 960, measure: "Orders", delta: "Orders YoY %", units: 1, precision: 0 }));

  // Monthly revenue vs prior year (columns + dashed line)
  vis.push(visual({
    id: hexId(`${P}:combo`), x: 24, y: 208, w: 808, h: 288, type: "lineClusteredColumnComboChart",
    query: {
      Category: { projections: [col("Date", "Month")] },
      Y: { projections: [m("Total Revenue")] },
      Y2: { projections: [m("Revenue PY")] },
    },
    objects: {
      dataPoint: [
        { properties: { fill: fill(C.accent) }, selector: { metadata: `${M}.Total Revenue` } },
        { properties: { fill: fill(C.grey) }, selector: { metadata: `${M}.Revenue PY` } },
      ],
      lineStyles: [{ properties: { strokeWidth: num(2), lineStyle: str("dashed"), showMarker: bool(true), markerShape: str("circle"), markerSize: num(4) }, selector: { metadata: `${M}.Revenue PY` } }],
      legend: [{ properties: { show: bool(true), position: str("Top"), showTitle: bool(false), fontFamily: str(FONT), fontSize: num(9), labelColor: fill(C.ink2), legendMarkerRendering: str("lineAndMarker") }, selector: { metadata: `${M}.Revenue PY` } },
        { properties: { show: bool(true), position: str("Top"), showTitle: bool(false), fontFamily: str(FONT), fontSize: num(9), labelColor: fill(C.ink2) } }],
      categoryAxis: [{ properties: { show: bool(true), showAxisTitle: bool(false), ...axisFont } }],
      valueAxis: [{ properties: { show: bool(true), showAxisTitle: bool(false), labelDisplayUnits: num(1000), labelPrecision: int(0), sharedAxis: bool(true), secShow: bool(false), ...axisFont, ...gridlines } }],
      labels: [{ properties: { show: bool(false) } }],
    },
    vcos: vco({ title: "Monthly revenue vs. prior year", subtitle: "2026 runs ahead of 2025 in every month, with Q4 seasonality building from September" }),
  }));

  // Revenue by region
  vis.push(visual({
    id: hexId(`${P}:region`), x: 848, y: 208, w: 408, h: 288, type: "clusteredBarChart",
    query: {
      Category: { projections: [col("Sales", "Region")] },
      Y: { projections: [m("Total Revenue")] },
      Tooltips: { projections: [m("Margin %"), m("Orders")] },
    },
    sort: sortBy(measExpr(M, "Total Revenue")),
    objects: {
      dataPoint: [{ properties: { defaultColor: fill(C.accent) } }],
      labels: [{ properties: { show: bool(true), labelDisplayUnits: num(1000), labelPrecision: int(0), fontFamily: str(FONT), fontSize: num(9), color: fill(C.ink2), labelPosition: str("OutsideEnd") } }],
      categoryAxis: [{ properties: { show: bool(true), showAxisTitle: bool(false), ...axisFont, fontSize: num(10), labelColor: fill(C.ink) } }],
      valueAxis: [{ properties: { show: bool(false), showAxisTitle: bool(false), gridlineShow: bool(false) } }],
      legend: [{ properties: { show: bool(false) } }],
    },
    vcos: vco({ title: "Revenue by region", subtitle: "South contributes about 44% of revenue; Central is the smallest market" }),
  }));

  // Revenue mix by category (donut)
  vis.push(visual({
    id: hexId(`${P}:donut`), x: 24, y: 512, w: 520, h: 192, type: "donutChart",
    query: {
      Category: { projections: [col("Sales", "ProductCategory")] },
      Y: { projections: [m("Total Revenue")] },
      Tooltips: { projections: [m("Margin %")] },
    },
    sort: sortBy(measExpr(M, "Total Revenue")),
    objects: {
      legend: [{ properties: { show: bool(true), position: str("Right"), showTitle: bool(false), fontFamily: str(FONT), fontSize: num(9), labelColor: fill(C.ink2) } }],
      labels: [{ properties: { show: bool(true), labelStyle: str("Percent of total"), position: str("preferOutside"), fontFamily: str(FONT), fontSize: num(9), color: fill(C.ink2), percentageLabelPrecision: int(0), background: str("off") } }],
      slices: [{ properties: { innerRadiusRatio: int(60) } }],
    },
    vcos: vco({ title: "Revenue mix by category", subtitle: "Electronics is ~43% of sales but the lowest-margin line" }),
  }));

  // Revenue growth vs PY by month
  vis.push(visual({
    id: hexId(`${P}:yoy`), x: 560, y: 512, w: 696, h: 192, type: "clusteredColumnChart",
    query: {
      Category: { projections: [col("Date", "Month")] },
      Y: { projections: [m("Revenue YoY %")] },
      Tooltips: { projections: [m("Total Revenue"), m("Revenue PY")] },
    },
    objects: {
      dataPoint: [{
        properties: {
          fill: {
            solid: {
              color: {
                expr: {
                  Conditional: {
                    Cases: [{
                      Condition: { Comparison: { ComparisonKind: 2, Left: measExpr(M, "Revenue YoY %"), Right: { Literal: { Value: "0D" } } } },
                      Value: { Literal: { Value: `'${C.accent}'` } },
                    }],
                    DefaultValue: { Literal: { Value: `'${C.bad}'` } },
                  },
                },
              },
            },
          },
        },
      }],
      labels: [{ properties: { show: bool(true), fontFamily: str(FONT), fontSize: num(9), color: fill(C.ink2), labelPosition: str("OutsideEnd") } }],
      categoryAxis: [{ properties: { show: bool(true), showAxisTitle: bool(false), ...axisFont } }],
      valueAxis: [{ properties: { show: bool(false), showAxisTitle: bool(false), gridlineShow: bool(false) } }],
      legend: [{ properties: { show: bool(false) } }],
    },
    vcos: vco({ title: "Revenue growth vs. prior year, by month", subtitle: "Double-digit growth in every month of 2026; September is the softest at +10%" }),
  }));
  return vis;
}

// ---------- Page 2: Product & Rep Performance ----------
function page2Visuals() {
  const P = "p2";
  const vis = [];
  vis.push(headerTextbox(P, "Product & Rep Performance", "Which products and sales reps drive profit, not just revenue  |  Same slicers as the overview page"));
  vis.push(...slicerRow(P));

  // Product matrix with data bars + margin heat
  const revRef = `${M}.Total Revenue`;
  const marginRef = `${M}.Margin %`;
  vis.push(visual({
    id: hexId(`${P}:matrix`), x: 24, y: 92, w: 600, h: 404, type: "pivotTable",
    query: {
      Rows: { projections: [col("Sales", "Product")] },
      Values: { projections: [m("Total Revenue"), m("Total Profit"), m("Margin %"), m("Units Sold")] },
    },
    sort: sortBy(measExpr(M, "Total Revenue")),
    filters: [topNFilter("p2:matrix:top15", "Sales", "Product", "Revenue", 15)],
    objects: {
      grid: [{ properties: { gridHorizontal: bool(true), gridHorizontalColor: fill(C.canvas), gridHorizontalWeight: num(1), gridVertical: bool(false), rowPadding: num(1), textSize: num(9) } }],
      columnHeaders: [{ properties: { fontFamily: str(FONT_SEMI), fontSize: num(9), bold: bool(true), fontColor: fill(C.ink2), backColor: fill("#F9FAFB"), alignment: str("Right"), autoSizeColumnWidth: bool(true), columnAdjustment: str("growToFit"), wordWrap: bool(false) } }],
      rowHeaders: [{ properties: { fontFamily: str(FONT), fontSize: num(9), fontColor: fill(C.ink), backColor: fill(C.white), alignment: str("Left") } }],
      values: [
        { properties: { fontFamily: str(FONT), fontSize: num(9), fontColorPrimary: fill(C.ink), fontColorSecondary: fill(C.ink), backColorPrimary: fill(C.white), backColorSecondary: fill(C.white) } },
        {
          properties: {
            backColor: {
              solid: {
                color: {
                  expr: {
                    FillRule: {
                      Input: { SelectRef: { ExpressionName: marginRef } },
                      FillRule: {
                        linearGradient2: {
                          min: { color: { Literal: { Value: "'#F8FAFF'" } } },
                          max: { color: { Literal: { Value: `'${C.accentLight}'` } } },
                          nullColoringStrategy: { strategy: { Literal: { Value: "'noColor'" } } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          selector: { data: [{ dataViewWildcard: { matchingOption: 1 } }], metadata: marginRef },
        },
      ],
      columnFormatting: [{
        properties: {
          dataBars: {
            positiveColor: fill(C.accentTint),
            negativeColor: fill(C.bad),
            axisColor: fill(C.grey),
            reverseDirection: bool(false),
            hideText: bool(false),
          },
        },
        selector: { metadata: revRef },
      }],
      rowTotal: [{ properties: { fontFamily: str(FONT_SEMI), fontSize: num(9), bold: bool(true), fontColor: fill(C.ink), backColor: fill("#F3F4F6") } }],
      subTotals: [{ properties: { rowSubtotals: bool(false) }, selector: { id: "Row" } }, { properties: { columnSubtotals: bool(false) }, selector: { id: "Column" } }],
    },
    vcos: vco({ title: "Top 15 products by revenue", subtitle: "Best sellers are low-margin electronics (~16%); apparel and beauty earn 43-49% margins", extra: { stylePreset: [{ properties: { name: str("None") } }] } }),
  }));

  // Sales reps ranked by revenue
  vis.push(visual({
    id: hexId(`${P}:reps`), x: 640, y: 92, w: 616, h: 296, type: "clusteredBarChart",
    query: {
      Category: { projections: [col("Sales", "SalesRep")] },
      Y: { projections: [m("Total Revenue")] },
      Tooltips: { projections: [m("Total Profit"), m("Margin %"), m("Orders")] },
    },
    sort: sortBy(measExpr(M, "Total Revenue")),
    objects: {
      dataPoint: [{ properties: { defaultColor: fill(C.accent) } }],
      labels: [{ properties: { show: bool(true), labelDisplayUnits: num(1000), labelPrecision: int(0), fontFamily: str(FONT), fontSize: num(9), color: fill(C.ink2), labelPosition: str("OutsideEnd") } }],
      categoryAxis: [{ properties: { show: bool(true), showAxisTitle: bool(false), ...axisFont, labelColor: fill(C.ink), maxMarginFactor: int(35) } }],
      valueAxis: [{ properties: { show: bool(false), showAxisTitle: bool(false), gridlineShow: bool(false) } }],
      legend: [{ properties: { show: bool(false) } }],
    },
    vcos: vco({ title: "Sales reps ranked by revenue (top 10)", subtitle: "The top three reps generate ~37% of revenue; the gap to the tail is almost 2x" }),
  }));

  // Volume vs margin bubble chart
  vis.push(visual({
    id: hexId(`${P}:scatter`), x: 640, y: 404, w: 616, h: 300, type: "scatterChart",
    query: {
      Category: { projections: [col("Sales", "Product")] },
      Series: { projections: [col("Sales", "ProductCategory")] },
      X: { projections: [m("Units Sold")] },
      Y: { projections: [m("Margin %")] },
      Size: { projections: [m("Total Revenue")] },
    },
    objects: {
      legend: [{ properties: { show: bool(true), position: str("Top"), showTitle: bool(false), fontFamily: str(FONT), fontSize: num(9), labelColor: fill(C.ink2) } }],
      categoryAxis: [{ properties: { show: bool(true), showAxisTitle: bool(true), titleText: str("Units sold"), titleFontSize: num(9), titleColor: fill(C.ink3), ...axisFont, ...gridlines } }],
      valueAxis: [{ properties: { show: bool(true), showAxisTitle: bool(true), titleText: str("Margin %"), titleFontSize: num(9), titleColor: fill(C.ink3), ...axisFont, ...gridlines } }],
      categoryLabels: [{ properties: { show: bool(false) } }],
      bubbles: [{ properties: { bubbleSize: int(-10) } }],
      fillPoint: [{ properties: { style: str("Fill only") } }],
    },
    vcos: vco({ title: "Volume vs. margin by product (bubble = revenue)", subtitle: "Electronics move the most units at the thinnest margin; beauty and apparel sit top-left" }),
  }));

  // Channel mix by region (stacked bar)
  vis.push(visual({
    id: hexId(`${P}:channel`), x: 24, y: 512, w: 600, h: 192, type: "barChart",
    query: {
      Category: { projections: [col("Sales", "Region")] },
      Series: { projections: [col("Sales", "Channel")] },
      Y: { projections: [m("Total Revenue")] },
      Tooltips: { projections: [m("Margin %")] },
    },
    sort: sortBy(measExpr(M, "Total Revenue")),
    objects: {
      legend: [{ properties: { show: bool(true), position: str("Top"), showTitle: bool(false), fontFamily: str(FONT), fontSize: num(9), labelColor: fill(C.ink2) } }],
      labels: [{ properties: { show: bool(true), labelDisplayUnits: num(1000), labelPrecision: int(0), fontFamily: str(FONT), fontSize: num(8), color: fill(C.white), labelPosition: str("InsideCenter") } }],
      categoryAxis: [{ properties: { show: bool(true), showAxisTitle: bool(false), ...axisFont, fontSize: num(10), labelColor: fill(C.ink) } }],
      valueAxis: [{ properties: { show: bool(false), showAxisTitle: bool(false), gridlineShow: bool(false) } }],
    },
    vcos: vco({ title: "Channel mix by region", subtitle: "Online is half of revenue in every region; Partner is the smallest but fastest-growing channel" }),
  }));
  return vis;
}

// ---------- pages ----------
function pageJson(name, displayName, visuals) {
  return {
    $schema: SCHEMA.page,
    name,
    displayName,
    displayOption: "FitToPage",
    height: 720,
    width: 1280,
    objects: {
      background: [{ properties: { color: fill(C.canvas), transparency: num(0) } }],
      outspace: [{ properties: { color: fill("#E5E7EB"), transparency: num(0) } }],
    },
  };
}

// ---------- theme ----------
function theme() {
  return {
    name: THEME_NAME,
    $schema: SCHEMA.theme,
    dataColors: [C.accent, C.accentLight, C.accentDark, "#60A5FA", "#64748B", "#BFDBFE", "#0F172A", "#CBD5E1"],
    foreground: C.ink,
    background: C.white,
    tableAccent: C.accent,
    good: "#16A34A",
    neutral: "#F59E0B",
    bad: C.bad,
    maximum: C.accent,
    center: C.accentLight,
    minimum: C.accentTint,
    null: C.grey,
    textClasses: {
      callout: { fontFace: FONT_SEMI, fontSize: 22, color: C.ink },
      title: { fontFace: FONT_SEMI, fontSize: 12, color: C.ink },
      header: { fontFace: FONT_SEMI, fontSize: 12, color: C.ink },
      label: { fontFace: FONT, fontSize: 10, color: C.ink2 },
    },
    visualStyles: {
      "*": {
        "*": {
          title: [{ show: true, fontFamily: FONT_SEMI, fontSize: 12, fontColor: { solid: { color: C.ink } } }],
          subTitle: [{ show: false, fontFamily: FONT, fontSize: 9, fontColor: { solid: { color: C.ink3 } } }],
          background: [{ show: true, color: { solid: { color: C.white } }, transparency: 0 }],
          border: [{ show: true, color: { solid: { color: C.line } }, radius: 6, width: 1 }],
          padding: [{ top: 8, bottom: 8, left: 8, right: 8 }],
          dropShadow: [{ show: false }],
          visualHeader: [{ show: true, transparency: 100 }],
        },
      },
      slicer: {
        "*": {
          header: [{ show: true, fontFamily: FONT_SEMI, textSize: 9, fontColor: { solid: { color: C.ink3 } } }],
          items: [{ fontFamily: FONT, textSize: 10, fontColor: { solid: { color: C.ink } }, padding: 4 }],
        },
      },
      pivotTable: { "*": { columnHeaders: [{ autoSizeColumnWidth: true, columnAdjustment: "growToFit" }] } },
      tableEx: { "*": { columnHeaders: [{ autoSizeColumnWidth: true, columnAdjustment: "growToFit" }] } },
    },
  };
}

// ---------- write everything ----------
function build() {
  fs.rmSync(REPORT_DIR, { recursive: true, force: true });
  fs.mkdirSync(DEF, { recursive: true });

  writeJson(path.join(REPORT_DIR, ".platform"), {
    $schema: SCHEMA.platform,
    metadata: { type: "Report", displayName: "RetailSalesDemo" },
    config: { version: "2.0", logicalId: "9b4c2a1d-3e5f-4a6b-8c7d-0e1f2a3b4c5d" },
  });
  writeJson(path.join(REPORT_DIR, "definition.pbir"), {
    $schema: SCHEMA.pbir,
    version: "4.0",
    datasetReference: { byPath: { path: "../RetailSalesDemo.SemanticModel" } },
  });
  writeJson(path.join(DEF, "version.json"), { $schema: SCHEMA.version, version: "2.0.0" });
  writeJson(path.join(DEF, "report.json"), {
    $schema: SCHEMA.report,
    themeCollection: {
      customTheme: { name: THEME_NAME, reportVersionAtImport: { visual: "2.9.0", report: "3.1.0", page: "2.1.0" }, type: "RegisteredResources" },
    },
    resourcePackages: [
      { name: "RegisteredResources", type: "RegisteredResources", items: [{ name: THEME_NAME, path: THEME_NAME, type: "CustomTheme" }] },
    ],
    settings: {
      useStylableVisualContainerHeader: true,
      defaultFilterActionIsDataFilter: true,
      hideVisualContainerHeader: false,
      filterPaneHiddenInEditMode: true,
    },
  });
  writeJson(path.join(REPORT_DIR, "StaticResources", "RegisteredResources", THEME_NAME), theme());
  writeJson(path.join(DEF, "pages", "pages.json"), { $schema: SCHEMA.pages, pageOrder: [PAGE1, PAGE2], activePageName: PAGE1 });

  const pages = [
    [PAGE1, "Sales Overview", page1Visuals()],
    [PAGE2, "Product & Rep Performance", page2Visuals()],
  ];
  for (const [name, displayName, visuals] of pages) {
    const pdir = path.join(DEF, "pages", name);
    writeJson(path.join(pdir, "page.json"), pageJson(name, displayName, visuals));
    for (const v of visuals) writeJson(path.join(pdir, "visuals", v.name, "visual.json"), v);
    console.log(`${displayName}: ${visuals.length} visuals`);
  }

  writeJson(path.join(ROOT, "RetailSalesDemo.pbip"), {
    $schema: SCHEMA.pbip,
    version: "1.0",
    artifacts: [{ report: { path: "RetailSalesDemo.Report" } }],
    settings: { enableAutoRecovery: true },
  });
  console.log("Pages:", PAGE1, PAGE2);
}

build();
