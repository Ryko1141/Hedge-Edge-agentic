#!/usr/bin/env python3
"""
ib_revenue_model.py

Models IB (Introducing Broker) commission revenue from broker partnerships.
Calculates per-user IB revenue, total IB contribution, and partnership ROI.

Usage:
    python ib_revenue_model.py --action model --users 500
    python ib_revenue_model.py --action broker-compare
    python ib_revenue_model.py --action optimize --target-ib-pct 0.40
"""

import json
import argparse
from datetime import datetime, timezone
from pathlib import Path


# ── Broker Partner Definitions ───────────────────────────────────────────────

BROKER_PARTNERS = {
    "vantage": {
        "name": "Vantage Markets",
        "status": "active",
        "commission_per_lot_usd": 4.0,  # Estimated standard IB rate
        "min_spread_markup_pips": 0,
        "avg_user_lots_per_month": 80,
        "referral_conversion_rate": 0.18,  # % of Hedge Edge users who open accounts
        "strengths": ["Low spreads", "Fast execution", "Full hedging support", "MT4/MT5"],
        "regions": ["Global", "APAC strong"],
    },
    "blackbull": {
        "name": "BlackBull Markets",
        "status": "active",
        "commission_per_lot_usd": 3.5,
        "min_spread_markup_pips": 0,
        "avg_user_lots_per_month": 70,
        "referral_conversion_rate": 0.12,
        "strengths": ["NZ regulated", "Institutional grade", "MT4/MT5/cTrader"],
        "regions": ["Global", "Oceania strong"],
    },
    "ic_markets": {
        "name": "IC Markets",
        "status": "potential",
        "commission_per_lot_usd": 5.0,
        "min_spread_markup_pips": 0,
        "avg_user_lots_per_month": 90,
        "referral_conversion_rate": 0.15,
        "strengths": ["Ultra-low spreads", "High volume", "ASIC regulated"],
        "regions": ["Global", "Popular with prop traders"],
    },
    "pepperstone": {
        "name": "Pepperstone",
        "status": "potential",
        "commission_per_lot_usd": 4.5,
        "min_spread_markup_pips": 0,
        "avg_user_lots_per_month": 85,
        "referral_conversion_rate": 0.14,
        "strengths": ["Premium execution", "FCA/ASIC", "cTrader support"],
        "regions": ["Global", "Europe/APAC"],
    },
    "vt_markets": {
        "name": "VT Markets",
        "status": "potential",
        "commission_per_lot_usd": 4.0,
        "min_spread_markup_pips": 0,
        "avg_user_lots_per_month": 75,
        "referral_conversion_rate": 0.10,
        "strengths": ["Competitive for IB programs", "Growing brand"],
        "regions": ["APAC", "Global"],
    },
}


def model_ib_revenue(total_users: int, brokers: dict = None) -> dict:
    """Model IB revenue across all broker partners."""
    if brokers is None:
        brokers = {k: v for k, v in BROKER_PARTNERS.items() if v["status"] == "active"}
    
    total_ib_monthly = 0
    broker_breakdown = []
    total_referred_users = 0
    
    for key, broker in brokers.items():
        referred_users = int(total_users * broker["referral_conversion_rate"])
        monthly_lots = referred_users * broker["avg_user_lots_per_month"]
        monthly_commission = monthly_lots * broker["commission_per_lot_usd"]
        per_user_ib = (
            broker["commission_per_lot_usd"]
            * broker["avg_user_lots_per_month"]
            * broker["referral_conversion_rate"]
        )
        
        total_ib_monthly += monthly_commission
        total_referred_users += referred_users
        
        broker_breakdown.append({
            "broker": broker["name"],
            "status": broker["status"],
            "referred_users": referred_users,
            "referral_rate": broker["referral_conversion_rate"],
            "monthly_lots": monthly_lots,
            "commission_per_lot": broker["commission_per_lot_usd"],
            "monthly_commission_usd": round(monthly_commission, 2),
            "per_user_contribution_usd": round(per_user_ib, 2),
        })
    
    saas_mrr_estimate = total_users * 35  # Estimated blended ARPU
    ib_as_pct_of_total = (
        total_ib_monthly / (total_ib_monthly + saas_mrr_estimate) * 100
        if (total_ib_monthly + saas_mrr_estimate) > 0 else 0
    )
    
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_users": total_users,
        "referred_users": total_referred_users,
        "overall_referral_rate": round(total_referred_users / total_users, 3) if total_users > 0 else 0,
        "total_ib_monthly_usd": round(total_ib_monthly, 2),
        "total_ib_annual_usd": round(total_ib_monthly * 12, 2),
        "saas_mrr_estimate_usd": saas_mrr_estimate,
        "ib_as_pct_of_total_revenue": round(ib_as_pct_of_total, 1),
        "ib_per_user_monthly_usd": round(total_ib_monthly / total_users, 2) if total_users > 0 else 0,
        "broker_breakdown": broker_breakdown,
    }


def compare_brokers() -> dict:
    """Compare all broker partners (active + potential)."""
    comparison = []
    
    for key, broker in BROKER_PARTNERS.items():
        # Revenue per referred user per month
        revenue_per_referred = broker["commission_per_lot_usd"] * broker["avg_user_lots_per_month"]
        # Revenue per Hedge Edge user per month (including non-converters)
        revenue_per_he_user = revenue_per_referred * broker["referral_conversion_rate"]
        
        comparison.append({
            "broker": broker["name"],
            "status": broker["status"],
            "commission_per_lot": broker["commission_per_lot_usd"],
            "avg_lots_per_month": broker["avg_user_lots_per_month"],
            "referral_conversion": broker["referral_conversion_rate"],
            "revenue_per_referred_user": round(revenue_per_referred, 2),
            "revenue_per_he_user": round(revenue_per_he_user, 2),
            "regions": broker["regions"],
            "strengths": broker["strengths"],
        })
    
    comparison.sort(key=lambda x: x["revenue_per_he_user"], reverse=True)
    
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "broker_comparison": comparison,
        "top_recommendation": comparison[0]["broker"] if comparison else None,
        "strategic_note": (
            "Diversify across 3+ brokers to reduce concentration risk. "
            "No single broker should represent >50% of IB revenue. "
            "Prioritize brokers popular with prop firm traders (IC Markets, Pepperstone are strong candidates)."
        ),
    }


def optimize_referral_rate(total_users: int, target_ib_pct: float = 0.40) -> dict:
    """Calculate required referral rate to hit IB revenue target."""
    saas_mrr = total_users * 35
    
    # Target: IB revenue = target_ib_pct of total
    # ib / (ib + saas) = target_pct
    # ib = target_pct * (ib + saas)
    # ib - target_pct * ib = target_pct * saas
    # ib (1 - target_pct) = target_pct * saas
    target_ib = (target_ib_pct * saas_mrr) / (1 - target_ib_pct)
    
    # Current active brokers
    active_brokers = {k: v for k, v in BROKER_PARTNERS.items() if v["status"] == "active"}
    avg_commission = sum(b["commission_per_lot_usd"] for b in active_brokers.values()) / len(active_brokers)
    avg_lots = sum(b["avg_user_lots_per_month"] for b in active_brokers.values()) / len(active_brokers)
    
    required_referred_users = target_ib / (avg_commission * avg_lots) if (avg_commission * avg_lots) > 0 else 0
    required_referral_rate = required_referred_users / total_users if total_users > 0 else 0
    
    current = model_ib_revenue(total_users)
    
    return {
        "target_ib_pct_of_total": target_ib_pct,
        "target_ib_monthly_usd": round(target_ib, 2),
        "current_ib_monthly_usd": current["total_ib_monthly_usd"],
        "gap_usd": round(target_ib - current["total_ib_monthly_usd"], 2),
        "current_referral_rate": current["overall_referral_rate"],
        "required_referral_rate": round(required_referral_rate, 3),
        "referral_rate_increase_needed": round(required_referral_rate - current["overall_referral_rate"], 3),
        "strategies_to_close_gap": [
            "Embed broker signup in app onboarding flow (expected +10% referral rate)",
            "Offer exclusive spreads for Hedge Edge users (+5% referral rate)",
            "Add more broker partners to give users choice (+8% referral rate from additional partners)",
            "Show IB broker as 'Recommended' in EA setup wizard (+3% referral rate)",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description="Hedge Edge IB revenue model")
    parser.add_argument("--action", required=True,
                       choices=["model", "broker-compare", "optimize"])
    parser.add_argument("--users", type=int, default=500)
    parser.add_argument("--target-ib-pct", type=float, default=0.40)
    parser.add_argument("--output", default=None)
    args = parser.parse_args()
    
    if args.action == "model":
        result = model_ib_revenue(args.users)
        print(f"\nIB Revenue Model ({args.users} users)")
        print(f"  Total IB Monthly:  ${result['total_ib_monthly_usd']:>10,.2f}")
        print(f"  Total IB Annual:   ${result['total_ib_annual_usd']:>10,.2f}")
        print(f"  SaaS MRR:          ${result['saas_mrr_estimate_usd']:>10,.2f}")
        print(f"  IB % of Total:     {result['ib_as_pct_of_total_revenue']:>9.1f}%")
        print(f"  IB per User:       ${result['ib_per_user_monthly_usd']:>10.2f}/mo")
        print(f"\nBroker Breakdown:")
        for b in result["broker_breakdown"]:
            print(f"  {b['broker']:20s} | {b['referred_users']:>4} referred | "
                  f"${b['monthly_commission_usd']:>8,.2f}/mo")
    
    elif args.action == "broker-compare":
        result = compare_brokers()
        print(f"\nBroker Comparison (sorted by revenue per Hedge Edge user):")
        for b in result["broker_comparison"]:
            status = "✓" if b["status"] == "active" else "○"
            print(f"  {status} {b['broker']:20s} | ${b['revenue_per_he_user']:>6.2f}/user/mo | "
                  f"${b['commission_per_lot']:.2f}/lot | {b['referral_conversion']:.0%} conv")
    
    elif args.action == "optimize":
        result = optimize_referral_rate(args.users, args.target_ib_pct)
        print(f"\nIB Revenue Optimization (Target: {args.target_ib_pct:.0%} of total)")
        print(f"  Current IB:        ${result['current_ib_monthly_usd']:>10,.2f}/mo")
        print(f"  Target IB:         ${result['target_ib_monthly_usd']:>10,.2f}/mo")
        print(f"  Gap:               ${result['gap_usd']:>10,.2f}/mo")
        print(f"  Current referral:  {result['current_referral_rate']:.1%}")
        print(f"  Required referral: {result['required_referral_rate']:.1%}")
    
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, default=str)
        print(f"\nSaved to {args.output}")


if __name__ == "__main__":
    main()
