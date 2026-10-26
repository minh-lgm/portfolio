"""Generate a fully synthetic retail sales dataset for the Power BI portfolio demo.

Everything here is fictional: company, products, sales reps and numbers.
"""
import numpy as np
import pandas as pd
from pathlib import Path

rng = np.random.default_rng(20261026)
OUT = Path(__file__).with_name("sales_orders.csv")

REGIONS = {
    "North":   {"share": 0.34, "provinces": ["Hanoi", "Hai Phong", "Quang Ninh"]},
    "Central": {"share": 0.21, "provinces": ["Da Nang", "Hue", "Khanh Hoa"]},
    "South":   {"share": 0.45, "provinces": ["Ho Chi Minh City", "Binh Duong", "Dong Nai", "Can Tho"]},
}
CHANNELS = {"Online": 0.46, "Store": 0.36, "Partner": 0.18}
# category -> (margin, products[(name, unit_price)])
CATALOG = {
    "Electronics": (0.17, [("Nova Wireless Earbuds", 59), ("Pulse Smart Speaker", 89),
                           ("Orbit 4K Action Cam", 219), ("Volt Power Bank 20K", 39)]),
    "Home & Kitchen": (0.31, [("Aurora Air Fryer", 129), ("Terra Cast-Iron Pan", 49),
                              ("Breeze Tower Fan", 79), ("Luma Desk Lamp", 35)]),
    "Apparel": (0.44, [("Trail Rain Jacket", 95), ("Everyday Linen Shirt", 42),
                       ("Motion Running Shorts", 29), ("Urban Canvas Sneakers", 68)]),
    "Sports & Outdoors": (0.36, [("Summit Trekking Pole", 45), ("Ridge 2P Tent", 159),
                                 ("Flow Yoga Mat", 32), ("Aero Water Bottle", 18)]),
    "Beauty & Health": (0.49, [("Glow Vitamin C Serum", 27), ("Calm Herbal Tea Set", 22),
                               ("Zen Massage Gun", 119), ("Pure Sunscreen SPF50", 19)]),
}
REPS = ["Linh Tran", "Minh Pham", "Hoa Nguyen", "Khoa Le", "Thao Vu",
        "Bao Hoang", "Quynh Dang", "Nam Bui", "Mai Do", "Tuan Ngo"]
REP_SKILL = rng.normal(1.0, 0.18, len(REPS)).clip(0.7, 1.4)

SEASON = [0.90, 0.80, 0.94, 1.00, 1.03, 1.00, 0.97, 1.02, 1.06, 1.12, 1.26, 1.42]
months = pd.period_range("2025-01", "2026-10", freq="M")

rows = []
order_id = 10000
for p in months:
    growth = 1.0 + 0.19 * (p.year - 2025) + 0.012 * (p.month - 1) / 12  # ~+19% YoY
    n_orders = int(round(132 * SEASON[p.month - 1] * growth))
    days = pd.date_range(p.start_time, p.end_time, freq="D")
    for _ in range(n_orders):
        order_id += 1
        date = pd.Timestamp(rng.choice(days.values))
        region = rng.choice(list(REGIONS), p=[v["share"] for v in REGIONS.values()])
        province = rng.choice(REGIONS[region]["provinces"])
        ch_w = np.array(list(CHANNELS.values()), dtype=float)
        if p.year == 2026:          # online keeps gaining share
            ch_w[0] *= 1.15
        channel = rng.choice(list(CHANNELS), p=ch_w / ch_w.sum())
        category = rng.choice(list(CATALOG), p=[0.30, 0.22, 0.20, 0.15, 0.13])
        margin, products = CATALOG[category]
        name, base_price = products[rng.integers(len(products))]
        qty = int(rng.integers(2, 13))
        price = round(base_price * rng.uniform(0.92, 1.08), 2)
        if channel == "Partner":
            price = round(price * 0.88, 2)   # wholesale discount
        revenue = round(qty * price, 2)
        m = np.clip(margin + rng.normal(0, 0.05) - (0.06 if channel == "Partner" else 0), 0.03, 0.7)
        cost = round(revenue * (1 - m), 2)
        rep_idx = rng.choice(len(REPS), p=REP_SKILL / REP_SKILL.sum())
        rows.append((f"SO-{order_id}", date.date(), region, province, channel, category, name,
                     REPS[rep_idx], qty, price, revenue, cost, round(revenue - cost, 2)))

df = pd.DataFrame(rows, columns=["OrderID", "OrderDate", "Region", "Province", "Channel",
                                 "ProductCategory", "Product", "SalesRep", "Quantity",
                                 "UnitPrice", "Revenue", "Cost", "Profit"])
# Calibrate each month's revenue to a seasonal growth curve (keeps Revenue = Qty x UnitPrice).
df["_m"] = pd.to_datetime(df["OrderDate"]).dt.to_period("M")
target = {p: 160_000 * SEASON[p.month - 1] * (1.0 + 0.19 * (p.year - 2025)) * rng.uniform(0.96, 1.04)
          for p in months}
scale = df.groupby("_m")["Revenue"].sum().rdiv(pd.Series(target))
df["UnitPrice"] = (df["UnitPrice"] * df["_m"].map(scale)).round(2)
df["Revenue"] = (df["Quantity"] * df["UnitPrice"]).round(2)
df["Cost"] = (df["Cost"] * df["_m"].map(scale)).round(2)
df["Profit"] = (df["Revenue"] - df["Cost"]).round(2)
df = df.drop(columns="_m").sort_values(["OrderDate", "OrderID"]).reset_index(drop=True)
df.to_csv(OUT, index=False, encoding="utf-8")
print(f"wrote {len(df):,} rows -> {OUT}")
