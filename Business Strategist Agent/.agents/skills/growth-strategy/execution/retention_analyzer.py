#!/usr/bin/env python3
"""
retention_analyzer.py

Cohort analysis, churn prediction, and retention scoring for Hedge Edge.
Designed to work with Supabase user/subscription data exports.

Usage:
    python retention_analyzer.py --action cohort --data tmp/user_data.json
    python retention_analyzer.py --action health --mrr 17500 --users 500 --churn 0.08
    python retention_analyzer.py --action predict --months 12
"""

import json
import argparse
from datetime import datetime, timezone
from pathlib import Path


def calculate_retention_health(mrr: float, users: int, churn: float) -> dict:
    """Calculate overall retention health score."""
    
    # Benchmarks for early-stage SaaS ($10K-$100K MRR)
    benchmarks = {
        "monthly_churn": {"excellent": 0.03, "good": 0.06, "ok": 0.10, "bad": 0.15},
        "ndr": {"excellent": 1.20, "good": 1.10, "ok": 1.00, "bad": 0.90},
        "quick_ratio": {"excellent": 4.0, "good": 2.5, "ok": 1.5, "bad": 1.0},
    }
    
    arpu = mrr / users if users > 0 else 0
    ltv = arpu / churn if churn > 0 else 0
    lifetime_months = 1 / churn if churn > 0 else 0
    
    # Retention score (0-100)
    if churn <= benchmarks["monthly_churn"]["excellent"]:
        churn_score = 100
    elif churn <= benchmarks["monthly_churn"]["good"]:
        churn_score = 80
    elif churn <= benchmarks["monthly_churn"]["ok"]:
        churn_score = 60
    elif churn <= benchmarks["monthly_churn"]["bad"]:
        churn_score = 40
    else:
        churn_score = 20
    
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "metrics": {
            "mrr_usd": mrr,
            "active_users": users,
            "arpu_usd": round(arpu, 2),
            "monthly_churn": churn,
            "annual_churn": round(1 - (1 - churn) ** 12, 4),
            "ltv_usd": round(ltv, 2),
            "avg_lifetime_months": round(lifetime_months, 1),
        },
        "health_score": churn_score,
        "grade": (
            "A" if churn_score >= 90 else
            "B" if churn_score >= 75 else
            "C" if churn_score >= 55 else
            "D" if churn_score >= 35 else "F"
        ),
        "diagnosis": generate_retention_diagnosis(churn, arpu, users),
        "prescriptions": generate_retention_prescriptions(churn, arpu, users),
    }


def generate_retention_diagnosis(churn: float, arpu: float, users: int) -> list:
    """Diagnose retention issues based on metrics."""
    issues = []
    
    if churn > 0.10:
        issues.append({
            "severity": "critical",
            "issue": "Monthly churn exceeds 10%",
            "impact": f"Losing ~{int(users * churn)} users/month. At this rate, "
                     f"you'll need to acquire {int(users * churn * 1.3)} users/month just to grow 30%.",
            "likely_causes": [
                "Product doesn't deliver enough value relative to $29/mo cost",
                "Users solve their immediate problem (pass challenge) and churn",
                "Setup complexity causes early dropout",
                "Competitor offering better price/features",
            ]
        })
    
    if arpu < 30:
        issues.append({
            "severity": "moderate",
            "issue": f"ARPU (${arpu:.2f}) is low for the value delivered",
            "impact": "Low ARPU limits growth spend and makes unit economics fragile",
            "likely_causes": [
                "Most users on lowest tier (Starter $29/mo)",
                "No upsell path (Pro/Hedger tiers not yet launched)",
                "Free tier too generous — users don't need to upgrade",
            ]
        })
    
    if users < 1000:
        issues.append({
            "severity": "informational",
            "issue": "Small sample size limits cohort analysis reliability",
            "impact": "Churn and retention metrics may be noisy with <1000 users",
            "likely_causes": ["Early stage product — normal at beta"],
        })
    
    if not issues:
        issues.append({
            "severity": "healthy",
            "issue": "No critical retention issues detected",
            "impact": "Current metrics are within acceptable ranges",
            "likely_causes": [],
        })
    
    return issues


def generate_retention_prescriptions(churn: float, arpu: float, users: int) -> list:
    """Prescribe specific actions to improve retention."""
    prescriptions = []
    
    # Always applicable for prop firm traders
    prescriptions.append({
        "action": "Build the 'Monthly Savings Report'",
        "rationale": "Auto-calculate how much the user saved/recovered via hedging each month. "
                    "Make the value of the subscription viscerally obvious. "
                    "If hedge recovery > subscription cost, display: 'Hedge Edge paid for itself 3x this month.'",
        "expected_impact": "10-20% churn reduction",
        "effort": "medium",
        "priority": 1,
    })
    
    if churn > 0.08:
        prescriptions.append({
            "action": "Implement win-back email sequence",
            "rationale": "For churned users, send a 3-email sequence: "
                        "(1) 'We saved your settings' (Day 1), "
                        "(2) 'Here's what you missed' with P&L of users who stayed (Day 7), "
                        "(3) 'Come back for 50% off your first month back' (Day 14).",
            "expected_impact": "Recover 5-10% of churned users",
            "effort": "low",
            "priority": 2,
        })
    
    if arpu < 35:
        prescriptions.append({
            "action": "Launch Pro tier with higher-value features",
            "rationale": "Dynamic daily loss limits, visual hedge map, and unlimited groups "
                        "are high-value features that justify $49-59/mo for serious traders.",
            "expected_impact": "15-25% ARPU increase if 30% of users upgrade",
            "effort": "high",
            "priority": 3,
        })
    
    prescriptions.append({
        "action": "Add 'streak' gamification to daily usage",
        "rationale": "Show '12-day hedge streak' in the app. Prop traders are competitive — "
                    "streaks create psychological commitment. Breaking a streak feels like loss.",
        "expected_impact": "5-10% engagement increase → downstream retention improvement",
        "effort": "low",
        "priority": 4,
    })
    
    return prescriptions


def predict_growth(
    current_users: int,
    monthly_churn: float,
    monthly_new_users: int,
    months: int,
    arpu: float = 35,
) -> list:
    """Predict user count and MRR over time."""
    projections = []
    users = current_users
    
    for month in range(1, months + 1):
        churned = int(users * monthly_churn)
        users = users - churned + monthly_new_users
        mrr = users * arpu
        
        projections.append({
            "month": month,
            "users": users,
            "new_users": monthly_new_users,
            "churned_users": churned,
            "net_new": monthly_new_users - churned,
            "mrr_usd": round(mrr, 2),
            "arr_usd": round(mrr * 12, 2),
        })
    
    return projections


def main():
    parser = argparse.ArgumentParser(description="Hedge Edge retention analyzer")
    parser.add_argument("--action", required=True,
                       choices=["health", "predict", "diagnose"])
    parser.add_argument("--mrr", type=float, default=17500)
    parser.add_argument("--users", type=int, default=500)
    parser.add_argument("--churn", type=float, default=0.08)
    parser.add_argument("--new-users-monthly", type=int, default=80)
    parser.add_argument("--months", type=int, default=12)
    parser.add_argument("--output", default=None)
    args = parser.parse_args()
    
    if args.action == "health":
        result = calculate_retention_health(args.mrr, args.users, args.churn)
        print(f"\nRetention Health Score: {result['health_score']}/100 (Grade: {result['grade']})")
        print(f"  MRR: ${result['metrics']['mrr_usd']:,.2f}")
        print(f"  LTV: ${result['metrics']['ltv_usd']:,.2f}")
        print(f"  Avg Lifetime: {result['metrics']['avg_lifetime_months']:.1f} months")
        print(f"\nDiagnosis:")
        for issue in result["diagnosis"]:
            print(f"  [{issue['severity'].upper()}] {issue['issue']}")
        print(f"\nTop Prescriptions:")
        for rx in result["prescriptions"][:3]:
            print(f"  {rx['priority']}. {rx['action']} ({rx['expected_impact']})")
    
    elif args.action == "predict":
        arpu = args.mrr / args.users if args.users > 0 else 35
        projections = predict_growth(args.users, args.churn, args.new_users_monthly, args.months, arpu)
        result = {"projections": projections}
        print(f"\n12-Month Growth Projection:")
        print(f"  {'Month':>5} | {'Users':>7} | {'Net New':>8} | {'MRR':>12} | {'ARR':>12}")
        print(f"  {'-'*5}-+-{'-'*7}-+-{'-'*8}-+-{'-'*12}-+-{'-'*12}")
        for p in projections:
            print(f"  {p['month']:>5} | {p['users']:>7,} | {p['net_new']:>+8,} | "
                  f"${p['mrr_usd']:>10,.2f} | ${p['arr_usd']:>10,.2f}")
    
    elif args.action == "diagnose":
        arpu = args.mrr / args.users if args.users > 0 else 35
        result = {
            "diagnosis": generate_retention_diagnosis(args.churn, arpu, args.users),
            "prescriptions": generate_retention_prescriptions(args.churn, arpu, args.users),
        }
        for issue in result["diagnosis"]:
            print(f"\n[{issue['severity'].upper()}] {issue['issue']}")
            print(f"  Impact: {issue['impact']}")
    
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, default=str)
        print(f"\nSaved to {args.output}")


if __name__ == "__main__":
    main()
