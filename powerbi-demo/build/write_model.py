"""Write the TMDL semantic model for the RetailSalesDemo PBIP project."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
root = ROOT / "RetailSalesDemo.SemanticModel"
d = root / "definition"
(d / "tables").mkdir(parents=True, exist_ok=True)


def w(path: Path, text: str) -> None:
    text = text.replace("    ", "\t")  # 4 spaces -> tab for TMDL indentation
    path.write_text(text.lstrip("\n"), encoding="utf-8")


(root / "definition.pbism").write_text(
    """{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json",
  "version": "4.2",
  "settings": {
    "qnaEnabled": true
  }
}
""",
    encoding="utf-8",
)
(root / ".platform").write_text(
    """{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
  "metadata": {
    "type": "SemanticModel",
    "displayName": "RetailSalesDemo"
  },
  "config": {
    "version": "2.0",
    "logicalId": "2f1b0d3e-7c4a-4b8e-9a6d-5e2c1f0a9b71"
  }
}
""",
    encoding="utf-8",
)

w(d / "database.tmdl", """
database
    compatibilityLevel: 1601
""")

w(d / "model.tmdl", """
model Model
    culture: en-US
    defaultPowerBIDataSourceVersion: powerBI_V3
    sourceQueryCulture: en-US
    dataAccessOptions
        legacyRedirects
        returnErrorValuesAsNull

annotation PBI_QueryOrder = ["Sales","Date","_Measures"]

annotation __PBI_TimeIntelligenceEnabled = 0

ref table Sales
ref table Date
ref table _Measures
""")

w(d / "relationships.tmdl", """
relationship Sales_OrderDate_to_Date
    fromColumn: Sales.OrderDate
    toColumn: Date.Date
""")

csv_path = str(ROOT / "data" / "sales_orders.csv")

w(d / "tables" / "Sales.tmdl", f"""
/// Synthetic order lines for the retail demo. One row per order line.
table Sales

    column OrderID
        dataType: string
        summarizeBy: none
        sourceColumn: OrderID

    column OrderDate
        dataType: dateTime
        formatString: yyyy-mm-dd
        summarizeBy: none
        sourceColumn: OrderDate

        annotation UnderlyingDateTimeDataType = Date

    column Region
        dataType: string
        summarizeBy: none
        sourceColumn: Region

    column Province
        dataType: string
        summarizeBy: none
        sourceColumn: Province

    column Channel
        dataType: string
        summarizeBy: none
        sourceColumn: Channel

    column ProductCategory
        dataType: string
        summarizeBy: none
        sourceColumn: ProductCategory

    column Product
        dataType: string
        summarizeBy: none
        sourceColumn: Product

    column SalesRep
        dataType: string
        summarizeBy: none
        sourceColumn: SalesRep

    column Quantity
        dataType: int64
        formatString: #,0
        summarizeBy: sum
        sourceColumn: Quantity

    column UnitPrice
        dataType: double
        formatString: $#,##0.00
        summarizeBy: none
        sourceColumn: UnitPrice

    column Revenue
        dataType: double
        formatString: $#,##0.00
        summarizeBy: sum
        sourceColumn: Revenue

    column Cost
        dataType: double
        formatString: $#,##0.00
        summarizeBy: sum
        sourceColumn: Cost

    column Profit
        dataType: double
        formatString: $#,##0.00
        summarizeBy: sum
        sourceColumn: Profit

    partition Sales = m
        mode: import
        source =
                let
                    Source = Csv.Document(File.Contents("{csv_path}"), [Delimiter = ",", Columns = 13, Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
                    Promoted = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),
                    Typed = Table.TransformColumnTypes(Promoted, {{{{"OrderID", type text}}, {{"OrderDate", type date}}, {{"Region", type text}}, {{"Province", type text}}, {{"Channel", type text}}, {{"ProductCategory", type text}}, {{"Product", type text}}, {{"SalesRep", type text}}, {{"Quantity", Int64.Type}}, {{"UnitPrice", type number}}, {{"Revenue", type number}}, {{"Cost", type number}}, {{"Profit", type number}}}}, "en-US")
                in
                    Typed
""")

w(d / "tables" / "Date.tmdl", """
/// Calendar table covering the order history (contiguous days).
table Date
    dataCategory: Time

    column Date
        dataType: dateTime
        isKey
        formatString: yyyy-mm-dd
        summarizeBy: none
        sourceColumn: Date

        annotation UnderlyingDateTimeDataType = Date

    column Year
        dataType: int64
        formatString: 0
        summarizeBy: none
        sourceColumn: Year

    column 'Month Number'
        dataType: int64
        isHidden
        formatString: 0
        summarizeBy: none
        sourceColumn: Month Number

    column Month
        dataType: string
        summarizeBy: none
        sourceColumn: Month
        sortByColumn: 'Month Number'

    column Quarter
        dataType: string
        summarizeBy: none
        sourceColumn: Quarter

    column 'Year Month'
        dataType: string
        summarizeBy: none
        sourceColumn: Year Month

    partition Date = m
        mode: import
        source =
                let
                    StartDate = #date(2025, 1, 1),
                    EndDate = #date(2026, 10, 31),
                    Dates = List.Dates(StartDate, Duration.Days(EndDate - StartDate) + 1, #duration(1, 0, 0, 0)),
                    AsTable = Table.FromList(Dates, Splitter.SplitByNothing(), {"Date"}),
                    Typed = Table.TransformColumnTypes(AsTable, {{"Date", type date}}),
                    AddYear = Table.AddColumn(Typed, "Year", each Date.Year([Date]), Int64.Type),
                    AddMonthNumber = Table.AddColumn(AddYear, "Month Number", each Date.Month([Date]), Int64.Type),
                    AddMonth = Table.AddColumn(AddMonthNumber, "Month", each Date.ToText([Date], [Format = "MMM", Culture = "en-US"]), type text),
                    AddQuarter = Table.AddColumn(AddMonth, "Quarter", each "Q" & Text.From(Date.QuarterOfYear([Date])), type text),
                    AddYearMonth = Table.AddColumn(AddQuarter, "Year Month", each Date.ToText([Date], [Format = "yyyy-MM", Culture = "en-US"]), type text)
                in
                    AddYearMonth
""")

w(d / "tables" / "_Measures.tmdl", """
/// Measure table: all KPIs used by the report live here.
table _Measures

    /// Sum of order-line revenue
    measure 'Total Revenue' = SUM(Sales[Revenue])
        formatString: $#,##0

    /// Sum of order-line cost of goods
    measure 'Total Cost' = SUM(Sales[Cost])
        formatString: $#,##0

    /// Revenue minus cost
    measure 'Total Profit' = SUM(Sales[Profit])
        formatString: $#,##0

    /// Profit as a share of revenue
    measure 'Margin %' = DIVIDE([Total Profit], [Total Revenue])
        formatString: 0.0%

    /// Distinct order count
    measure Orders = DISTINCTCOUNT(Sales[OrderID])
        formatString: #,##0

    /// Units shipped
    measure 'Units Sold' = SUM(Sales[Quantity])
        formatString: #,##0

    /// Revenue per order
    measure 'Avg Order Value' = DIVIDE([Total Revenue], [Orders])
        formatString: $#,##0

    /// Revenue for the same period one year earlier
    measure 'Revenue PY' = CALCULATE([Total Revenue], SAMEPERIODLASTYEAR('Date'[Date]))
        formatString: $#,##0

    /// Year-over-year revenue growth
    measure 'Revenue YoY %' = DIVIDE([Total Revenue] - [Revenue PY], [Revenue PY])
        formatString: +0.0%;-0.0%;0.0%

    /// Profit for the same period one year earlier
    measure 'Profit PY' = CALCULATE([Total Profit], SAMEPERIODLASTYEAR('Date'[Date]))
        formatString: $#,##0

    /// Year-over-year profit growth
    measure 'Profit YoY %' = DIVIDE([Total Profit] - [Profit PY], [Profit PY])
        formatString: +0.0%;-0.0%;0.0%

    /// Margin % for the same period one year earlier
    measure 'Margin % PY' = DIVIDE([Profit PY], [Revenue PY])
        formatString: 0.0%

    /// Margin change versus prior year, in percentage points
    measure 'Margin vs PY (pts)' = ([Margin %] - [Margin % PY]) * 100
        formatString: +0.0;-0.0;0.0

    /// Orders for the same period one year earlier
    measure 'Orders PY' = CALCULATE([Orders], SAMEPERIODLASTYEAR('Date'[Date]))
        formatString: #,##0

    /// Year-over-year growth in order count
    measure 'Orders YoY %' = DIVIDE([Orders] - [Orders PY], [Orders PY])
        formatString: +0.0%;-0.0%;0.0%

    column Value
        dataType: string
        isHidden
        summarizeBy: none
        sourceColumn: Value

    partition _Measures = m
        mode: import
        source =
                let
                    Source = #table(type table [Value = text], {})
                in
                    Source
""")
print("TMDL written to", root)
