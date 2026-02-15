#!/usr/bin/env python3
"""
partnership_evaluator.py

Evaluates partnership opportunities, models ROI, and compares deals
for Hedge Edge's broker IB, affiliate, and influencer partnerships.

Usage:
    python partnership_evaluator.py --action evaluate-broker --broker "IC Markets" --commission 5.0
    python partnership_evaluator.py --action affiliate-model --affiliates 50 --avg-referrals 5
    python partnership_evaluator.py --action roi --partner "Vantage" --months 12
"""

import json
import argparse
from datetime import datetime, timezone
from pathlib import Path


def evaluate_broker_partnership(
    broker_name: str,
    commission_per_lot: float,
    estimated_referral_rate: float = 0.15,
    avg_lots_per_user: float = 80,
    platform_support: list = None,
    regulation: str = "unknown",
    geographic_fit: float = 0.7,
    onboarding_friction: str = "medium",
) -> dict:
    """Evaluate a broker IB partnership opportunity."""
    
    if platform_support is None:
        platform_support = ["MT5"]
    
    # Scoring (0-10 per criterion)
    scores = {}
    
    # Commission rate scoring
    if commission_per_lot >= 6:
        scores["commission_rate"] = 10
    elif commission_per_lot >= 5:
        scores["commission_rate"] = 8
    elif commission_per_lot >= 4:
        scores["commission_rate"] = 6
    elif commission_per_lot >= 3:
        scores["commission_rate"] = 4
    else:
        scores["commission_rate"] = 2
    
    # Platform coverage
    supported = set(p.upper() for p in platform_support)
    target = {"MT4", "MT5", "CTRADER"}
    scores["platform_support"] = round(len(supported & target) / len(target) * 10)
    
    # Regulation
    reg_scores = {
        "fca": 10, "asic": 10, "cysec": 8, "fsca": 6,
        "fsa": 5, "offshore": 3, "unknown": 1,
    }
    scores["regulation"] = reg_scores.get(regulation.lower(), 3)
    
    # Geographic fit
    scores["geographic_fit"] = round(geographic_fit * 10)
    
    # Onboarding friction (inverse)
    friction_scores = {"low": 9, "medium": 6, "high": 3}
    scores["onboarding_friction"] = friction_scores.get(onboarding_friction.lower(), 5)
    
    # Prop trader popularity (estimated from platform + commission)
    scores["prop_trader_popularity"] = min(10, round(
        (scores["platform_support"] + scores["commission_rate"]) / 2
    ))
    
    # Weighted total
    weights = {
        "commission_rate": 0.25,
        "platform_support": 0.20,
        "prop_trader_popularity": 0.20,
        "regulation": 0.15,
        "onboarding_friction": 0.10,
        "geographic_fit": 0.10,
    }
    
    weighted_total = sum(scores[k] * weights[k] for k in weights)
    
    # Revenue projection (per 100 Hedge Edge users)
    users_ref = 100
    referred = int(users_ref * estimated_referral_rate)
    monthly_revenue = referred * avg_lots_per_user * commission_per_lot
    annual_revenue = monthly_revenue * 12
    
    # Decision
    if weighted_total >= 7.5:
        recommendation = "STRONG PURSUE"
    elif weighted_total >= 6.0:
        recommendation = "PURSUE"
    elif weighted_total >= 4.5:
        recommendation = "CONSIDER (conditional)"
    else:
        recommendation = "PASS"
    
    return {
        "broker": broker_name,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "scores": scores,
        "weighted_total": round(weighted_total, 2),
        "recommendation": recommendation,
        "revenue_projection": {
            "per_100_users": {
                "referred_users": referred,
                "monthly_lots": referred * avg_lots_per_user,
                "monthly_revenue_usd": round(monthly_revenue, 2),
                "annual_revenue_usd": round(annual_revenue, 2),
            },
        },
        "negotiation_targets": {
            "min_acceptable_commission": round(commission_per_lot * 0.85, 2),
            "target_commission": commission_per_lot,
            "stretch_commission": round(commission_per_lot * 1.20, 2),
            "ask_for": [
                f"${commission_per_lot}/lot base with tiered increases at volume milestones",
                "Exclusive spread discount for Hedge Edge referred accounts",
                "Co-marketing budget ($500-2000/month)",
                "Sub-IB capability for Hedge Edge affiliate program",
                "Dedicated account manager for referred traders",
                "Fast-track KYC for Hedge Edge referrals (reduce onboarding friction)",
            ],
        },
    }


def model_affiliate_program(
    num_affiliates: int = 50,
    avg_referrals_per_affiliate: float = 5,
    avg_subscription_usd: float = 35,
    commission_pct: float = 0.25,
    churn_rate: float = 0.08,
) -> dict:
    """Model the affiliate program's financial impact."""
    
    total_referred_users = num_affiliates * avg_referrals_per_affiliate
    
    # Revenue from referred users
    gross_mrr = total_referred_users * avg_subscription_usd
    affiliate_cost = gross_mrr * commission_pct
    net_mrr = gross_mrr - affiliate_cost
    
    # LTV per referred user
    ltv_gross = avg_subscription_usd / churn_rate
    ltv_net = ltv_gross * (1 - commission_pct)
    
    # Affiliate tiers
    tiers = {
        "standard": {"min_refs": 0, "pct": 0.20, "estimated_affiliates": int(num_affiliates * 0.60)},
        "ambassador": {"min_refs": 10, "pct": 0.25, "estimated_affiliates": int(num_affiliates * 0.25)},
        "partner": {"min_refs": 50, "pct": 0.30, "estimated_affiliates": int(num_affiliates * 0.10)},
        "elite": {"min_refs": 200, "pct": 0.35, "estimated_affiliates": int(num_affiliates * 0.05)},
    }
    
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "program_metrics": {
            "total_affiliates": num_affiliates,
            "total_referred_users": int(total_referred_users),
            "gross_mrr_usd": round(gross_mrr, 2),
            "affiliate_cost_usd": round(affiliate_cost, 2),
            "net_mrr_usd": round(net_mrr, 2),
            "effective_cac_usd": round(affiliate_cost / total_referred_users, 2) if total_referred_users > 0 else 0,
            "ltv_gross_usd": round(ltv_gross, 2),
            "ltv_net_usd": round(ltv_net, 2),
        },
        "tier_structure": tiers,
        "scaling_projection": {
            "at_100_affiliates": round(100 * avg_referrals_per_affiliate * avg_subscription_usd * (1 - commission_pct), 2),
            "at_500_affiliates": round(500 * avg_referrals_per_affiliate * avg_subscription_usd * (1 - commission_pct), 2),
            "at_1000_affiliates": round(1000 * avg_referrals_per_affiliate * avg_subscription_usd * (1 - commission_pct), 2),
        },
        "key_insight": (
            f"At {num_affiliates} affiliates, the program generates ${net_mrr:.2f}/mo net MRR "
            f"with zero upfront spend. Effective CAC is ${affiliate_cost / total_referred_users:.2f} "
            f"(paid only on success). This is the most capital-efficient growth channel."
        ),
    }


def calculate_partnership_roi(
    partner_name: str,
    monthly_revenue_attributed: float,
    monthly_cost: float,
    months: int = 12,
    setup_cost: float = 0,
) -> dict:
    """Calculate ROI for an existing partnership over time."""
    
    cumulative_revenue = 0
    cumulative_cost = setup_cost
    roi_timeline = []
    
    for month in range(1, months + 1):
        cumulative_revenue += monthly_revenue_attributed
        cumulative_cost += monthly_cost
        roi = (cumulative_revenue - cumulative_cost) / cumulative_cost if cumulative_cost > 0 else 0
        
        roi_timeline.append({
            "month": month,
            "cumulative_revenue": round(cumulative_revenue, 2),
            "cumulative_cost": round(cumulative_cost, 2),
            "cumulative_profit": round(cumulative_revenue - cumulative_cost, 2),
            "roi_pct": round(roi * 100, 1),
        })
    
    breakeven_month = next(
        (t["month"] for t in roi_timeline if t["cumulative_profit"] >= 0),
        None
    )
    
    return {
        "partner": partner_name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "setup_cost_usd": setup_cost,
        "monthly_revenue_usd": monthly_revenue_attributed,
        "monthly_cost_usd": monthly_cost,
        "breakeven_month": breakeven_month,
        "final_roi_pct": roi_timeline[-1]["roi_pct"],
        "total_profit_usd": roi_timeline[-1]["cumulative_profit"],
        "timeline": roi_timeline,
        "verdict": (
            f"PROFITABLE — breaks even in month {breakeven_month}, "
            f"{roi_timeline[-1]['roi_pct']:.0f}% ROI over {months} months."
            if breakeven_month else
            f"NOT PROFITABLE within {months} months. Renegotiate or terminate."
        ),
    }


def main():
    parser = argparse.ArgumentParser(description="Partnership evaluator")
    parser.add_argument("--action", required=True,
                       choices=["evaluate-broker", "affiliate-model", "roi"])
    parser.add_argument("--broker", default="Unknown Broker")
    parser.add_argument("--commission", type=float, default=4.0)
    parser.add_argument("--affiliates", type=int, default=50)
    parser.add_argument("--avg-referrals", type=float, default=5)
    parser.add_argument("--partner", default="Partner")
    parser.add_argument("--revenue", type=float, default=5000)
    parser.add_argument("--cost", type=float, default=1500)
    parser.add_argument("--months", type=int, default=12)
    parser.add_argument("--output", default=None)
    args = parser.parse_args()
    
    if args.action == "evaluate-broker":
        result = evaluate_broker_partnership(args.broker, args.commission)
        print(f"\nBroker Evaluation: {args.broker}")
        print(f"  Score: {result['weighted_total']}/10")
        print(f"  Recommendation: {result['recommendation']}")
        print(f"  Monthly Revenue (per 100 users): "
              f"${result['revenue_projection']['per_100_users']['monthly_revenue_usd']:,.2f}")
    
    elif args.action == "affiliate-model":
        result = model_affiliate_program(args.affiliates, args.avg_referrals)
        m = result["program_metrics"]
        print(f"\nAffiliate Program Model ({args.affiliates} affiliates)")
        print(f"  Referred Users: {m['total_referred_users']}")
        print(f"  Gross MRR:  ${m['gross_mrr_usd']:>10,.2f}")
        print(f"  Aff. Cost:  ${m['affiliate_cost_usd']:>10,.2f}")
        print(f"  Net MRR:    ${m['net_mrr_usd']:>10,.2f}")
        print(f"  Eff. CAC:   ${m['effective_cac_usd']:>10.2f}")
    
    elif args.action == "roi":
        result = calculate_partnership_roi(args.partner, args.revenue, args.cost, args.months)
        print(f"\nPartnership ROI: {args.partner}")
        print(f"  {result['verdict']}")
        print(f"  12-month profit: ${result['total_profit_usd']:,.2f}")
    
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, default=str)
        print(f"\nSaved to {args.output}")


if __name__ == "__main__":
    main()
