#!/usr/bin/env python3
"""Generate Privta's deterministic USD demo dataset as JSON.

The browser uses the equivalent generator in js/data.js so the static demo has
no loading dependency. This script is useful for inspecting or exporting the
same fictional seed during development.
"""
from __future__ import annotations

import json
import random
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "seed.json"


def month_date(year: int, month: int, day: int) -> str:
    return date(year, month, day).isoformat()


def make_transaction(identifier: int, account_id: str, when: str, amount: float, merchant: str, category: str, **extra: object) -> dict[str, object]:
    return {
        "id": f"tx-{identifier}", "account_id": account_id, "date": when,
        "amount": round(amount, 2), "currency": "USD", "merchant": merchant,
        "category": category, "channel": "Card", "installments": 0,
        "is_recurring": False, **extra,
    }


def generate() -> list[dict[str, object]]:
    rng = random.Random(81427)
    rows: list[dict[str, object]] = []
    identifier = 1
    categories = ["Groceries", "Dining", "Transport", "Health", "Home", "Entertainment", "Education", "Clothing", "Transfers"]
    merchants = {
        "Groceries": ["North Market", "Freshway", "Maple Grocer"],
        "Dining": ["Nomad Cafe", "Pasta House", "QuickBite"],
        "Transport": ["Harbor Fuel", "RideNow", "MetroPass"],
        "Health": ["Central Pharmacy", "North Clinic"],
        "Home": ["Homecraft", "Clearwater Utility", "Northstar Energy"],
        "Entertainment": ["Cinepolis", "Spotify", "Netflix"],
        "Education": ["SkillForge", "Technical Books"],
        "Clothing": ["Nomad Apparel", "Urban Store"],
        "Transfers": ["Emma Williams", "Noah Carter"],
    }
    for index in range(18):
        year, month = divmod(2 + index, 12)
        year += 2025
        month += 1
        seasonal = 1.55 if month in (7, 12) else 1
        salary = 17500 if index >= 10 else 13200
        special = [
            ("checking", 1, salary, "ACME Services", "Income", {"channel": "Bank transfer", "is_recurring": True}),
            ("checking", 5, -4250, "Emma Williams", "Transfers", {"channel": "Bank transfer", "is_recurring": True}),
            ("checking", 8, -8.4, "Spotify", "Entertainment", {"is_recurring": True}),
            ("checking", 9, -9.9, "Spotify Premium", "Entertainment", {"is_recurring": True}),
            ("checking", 10, -(3.1 + index * .42 if index < 12 else 13.6), "Clearwater Utility", "Home", {"channel": "Auto-debit", "is_recurring": True}),
            ("checking", 16, -23.45, "GAMERX ONLINE", "Entertainment", {"is_recurring": True}),
        ]
        for account_id, day, amount, merchant, category, extra in special:
            rows.append(make_transaction(identifier, account_id, month_date(year, month, day), amount, merchant, category, **extra)); identifier += 1
        if index >= 11:
            rows.append(make_transaction(identifier, "checking", month_date(year, month, 18), -75.4, f"Northstar Laptop — installment {index - 10}/12", "Education", installments=12)); identifier += 1
        for _ in range(127):
            category = rng.choice(categories)
            rows.append(make_transaction(identifier, "checking", month_date(year, month, rng.randint(2, 27)), -(7 + rng.random() * (780 if category == "Groceries" else 240) * seasonal), rng.choice(merchants[category]), category, channel="Card" if rng.random() > .55 else "QR")); identifier += 1
    return sorted(rows[:2400], key=lambda row: str(row["date"]), reverse=True)


if __name__ == "__main__":
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps(generate(), indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}")
