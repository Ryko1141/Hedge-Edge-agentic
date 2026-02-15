#!/usr/bin/env python3
"""
pricing_optimizer.py

Price sensitivity modeling, tier analysis, and revenue projection for Hedge Edge.
Models the impact of pricing changes on MRR, churn, and LTV.

Usage:
    python pricing_optimizer.py --action tier-analysis --output tmp/tier_analysis.json
    python pricing_optimizer.py --action project --months 12 --new-users 100
    python pricing_optimizer.py --action price-test --starter 29 --pro 59 --hedger 99
"""

import json
import argparse
from datetime import datetime, timezone
from pathlib import Path


# ── Current State ─────────────────────────────────────────────────────────────

CURRENT_TIERS = {
    "free": {"price": 0, "pct_users": 0.30, "churn": 0.15, "label": "Free Guide"},
    "starter": {"price": 29, "pct_users": 0.60, "churn": 0.08, "label": "Starter"},
    "pro": {"price": 30, "pct_users": 0.08, "churn": 0.06, "label": "Pro (Coming Soon)"},
    "hedger": {"price": 75, "pct_users": 0.02, "churn": 0.04, "label": "Hedger (Coming Soon)"},
}

PROPOSED_TIERS = {
    "free": {"price": 0, "pct_users": 0.25, "churn": 0.15, "label": "Free Guide"},
    "starter": {"price": 29, "pct_users": 0.40, "churn": 0.08, "label": "Starter"},
    "pro": {"price": 59, "pct_users": 0.25, "churn": 0.05, "label": "Pro"},
    "hedger": {"price": 99, "pct_users": 0.08, "churn": 0.03, "label": "Hedger"},
    "annual_starter": {"price": 20.75, "pct_users": 0.15, "churn": 0.015, "label": "Starter Annual"},
    "annual_pro": {"price": 41.58, "pct_users": 0.07, "churn": 0.01, "label": "Pro Annual"},
}


def calculate_blended_arpu(tiers: dict, total_users: int) -> dict:
    """Calculate blended ARPU across all tiers."""
    total_revenue = 0
    paying_users = 0
    tier_breakdown = []
    
    for key, tier in tiers.items():
        users_in_tier = int(total_users * tier["pct_users"])
        revenue = users_in_tier * tier["price"]
        total_revenue += revenue
        if tier["price"] > 0:
            paying_users += users_in_tier
        
        tier_breakdown.append({
            "tier": tier["label"],
            "price": tier["price"],
            "users": users_in_tier,
            "pct_of_total": tier["pct_users"],
            "mrr_contribution": round(revenue, 2),
            "monthly_churn": tier["churn"],
        })
    
    arpu_all = total_revenue / total_users if total_users > 0 else 0
    arpu_paying = total_revenue / paying_users if paying_users > 0 else 0
    
    # Blended churn (weighted by user count)
    blended_churn = sum(
        tier["churn"] * tier["pct_users"] for tier in tiers.values()
    )
    
    blended_ltv = arpu_all / blended_churn if blended_churn > 0 else 0
    
    return {
        "total_users": total_users,
        "paying_users": paying_users,
        "free_users": total_users - paying_users,
        "free_to_paid_ratio": round((total_users - paying_users) / paying_users, 2) if paying_users > 0 else float("inf"),
        "mrr_usd": round(total_revenue, 2),
        "arpu_all_usd": round(arpu_all, 2),
        "arpu_paying_usd": round(arpu_paying, 2),
        "blended_monthly_churn": round(blended_churn, 4),
        "blended_ltv_usd": round(blended_ltv, 2),
        "tier_breakdown": tier_breakdown,
    }


def compare_pricing_scenarios(total_users: int = 500) -> dict:
    """Compare current vs proposed pricing."""
    current = calculate_blended_arpu(CURRENT_TIERS, total_users)
    proposed = calculate_blended_arpu(PROPOSED_TIERS, total_users)
    
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_users": total_users,
        "current": current,
        "proposed": proposed,
        "delta": {
            "mrr_change_usd": round(proposed["mrr_usd"] - current["mrr_usd"], 2),
            "mrr_change_pct": round(
                (proposed["mrr_usd"] - current["mrr_usd"]) / current["mrr_usd"] * 100, 1
            ) if current["mrr_usd"] > 0 else 0,
            "arpu_change_usd": round(proposed["arpu_all_usd"] - current["arpu_all_usd"], 2),
            "ltv_change_usd": round(proposed["blended_ltv_usd"] - current["blended_ltv_usd"], 2),
            "churn_change": round(proposed["blended_monthly_churn"] - current["blended_monthly_churn"], 4),
        },
        "recommendation": (
            "IMPLEMENT proposed pricing. "
            f"MRR increases by ${proposed['mrr_usd'] - current['mrr_usd']:,.2f}/mo "
            f"({(proposed['mrr_usd'] - current['mrr_usd']) / current['mrr_usd'] * 100:.1f}%). "
            f"Blended churn improves due to annual plan adoption. "
            f"LTV increases from ${current['blended_ltv_usd']:,.2f} to ${proposed['blended_ltv_usd']:,.2f}."
        ) if proposed["mrr_usd"] > current["mrr_usd"] else "HOLD current pricing — proposed change does not improve revenue."
    }


def project_revenue(
    start_users: int = 500,
    monthly_new_users: int = 100,
    months: int = 12,
    tiers: dict = None,
    new_user_growth_rate: float = 0.05,  # Monthly increase in acquisition
) -> list:
    """Project revenue growth over time with tier mix and churn."""
    if tiers is None:
        tiers = PROPOSED_TIERS
    
    projections = []
    users = start_users
    monthly_acq = monthly_new_users
    
    for month in range(1, months + 1):
        # Calculate churn (blended across tiers)
        blended_churn = sum(t["churn"] * t["pct_users"] for t in tiers.values())
        churned = int(users * blended_churn)
        
        # Acquire new users (growing over time)
        users = users - churned + int(monthly_acq)
        monthly_acq *= (1 + new_user_growth_rate)
        
        # Revenue
        metrics = calculate_blended_arpu(tiers, users)
        
        projections.append({
            "month": month,
            "total_users": users,
            "paying_users": metrics["paying_users"],
            "new_users": int(monthly_acq),
            "churned_users": churned,
            "mrr_usd": metrics["mrr_usd"],
            "arr_usd": round(metrics["mrr_usd"] * 12, 2),
            "arpu_usd": metrics["arpu_all_usd"],
        })
    
    return projections


def price_sensitivity_test(
    base_price: float,
    elasticity: float = -0.3,  # Low elasticity — value product
    test_range: tuple = (0.7, 1.5),
    steps: int = 9,
) -> list:
    """Model price sensitivity for a given tier."""
    results = []
    step_size = (test_range[1] - test_range[0]) / (steps - 1)
    
    for i in range(steps):
        multiplier = test_range[0] + (i * step_size)
        test_price = base_price * multiplier
        
        # Demand change based on price elasticity
        price_change_pct = (test_price - base_price) / base_price
        demand_change_pct = price_change_pct * elasticity
        relative_demand = 1 + demand_change_pct
        
        # Revenue index (normalized to base = 1.0)
        revenue_index = multiplier * relative_demand
        
        results.append({
            "price_usd": round(test_price, 2),
            "price_multiplier": round(multiplier, 2),
            "relative_demand": round(relative_demand, 3),
            "revenue_index": round(revenue_index, 3),
            "is_revenue_maximizing": False,  # Set below
        })
    
    # Mark revenue-maximizing price
    max_rev = max(results, key=lambda x: x["revenue_index"])
    max_rev["is_revenue_maximizing"] = True
    
    return results


def main():
    parser = argparse.ArgumentParser(description="Hedge Edge pricing optimizer")
    parser.add_argument("--action", required=True,
                       choices=["tier-analysis", "project", "price-test", "compare"])
    parser.add_argument("--users", type=int, default=500)
    parser.add_argument("--new-users", type=int, default=100)
    parser.add_argument("--months", type=int, default=12)
    parser.add_argument("--starter", type=float, default=29)
    parser.add_argument("--pro", type=float, default=59)
    parser.add_argument("--hedger", type=float, default=99)
    parser.add_argument("--output", default=None)
    args = parser.parse_args()
    
    if args.action == "compare":
        result = compare_pricing_scenarios(args.users)
        print(f"\nPricing Comparison ({args.users} users)")
        print(f"  Current MRR:  ${result['current']['mrr_usd']:>10,.2f}  (ARPU: ${result['current']['arpu_all_usd']:.2f})")
        print(f"  Proposed MRR: ${result['proposed']['mrr_usd']:>10,.2f}  (ARPU: ${result['proposed']['arpu_all_usd']:.2f})")
        print(f"  Delta:        ${result['delta']['mrr_change_usd']:>+10,.2f}  ({result['delta']['mrr_change_pct']:+.1f}%)")
        print(f"\n  {result['recommendation']}")
    
    elif args.action == "tier-analysis":
        result = calculate_blended_arpu(PROPOSED_TIERS, args.users)
        print(f"\nTier Analysis ({args.users} users)")
        for tier in result["tier_breakdown"]:
            print(f"  {tier['tier']:20s} | ${tier['price']:>6.2f}/mo | "
                  f"{tier['users']:>5} users | ${tier['mrr_contribution']:>8,.2f} MRR")
        print(f"\n  Total MRR:     ${result['mrr_usd']:,.2f}")
        print(f"  ARPU (all):    ${result['arpu_all_usd']:.2f}")
        print(f"  ARPU (paying): ${result['arpu_paying_usd']:.2f}")
        print(f"  Blended LTV:   ${result['blended_ltv_usd']:,.2f}")
    
    elif args.action == "project":
        projections = project_revenue(args.users, args.new_users, args.months)
        result = {"projections": projections}
        print(f"\n{'Month':>5} | {'Users':>7} | {'Paying':>7} | {'MRR':>12} | {'ARR':>12}")
        print(f"{'-'*5}-+-{'-'*7}-+-{'-'*7}-+-{'-'*12}-+-{'-'*12}")
        for p in projections:
            print(f"{p['month']:>5} | {p['total_users']:>7,} | {p['paying_users']:>7,} | "
                  f"${p['mrr_usd']:>10,.2f} | ${p['arr_usd']:>10,.2f}")
    
    elif args.action == "price-test":
        result = {
            "starter_sensitivity": price_sensitivity_test(args.starter),
            "pro_sensitivity": price_sensitivity_test(args.pro),
            "hedger_sensitivity": price_sensitivity_test(args.hedger),
        }
        for tier_name, sensitivity in result.items():
            optimal = next(r for r in sensitivity if r["is_revenue_maximizing"])
            print(f"\n{tier_name}: Optimal price = ${optimal['price_usd']:.2f} "
                  f"(revenue index: {optimal['revenue_index']:.3f})")
    
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, default=str)
        print(f"\nSaved to {args.output}")


if __name__ == "__main__":
    main()
