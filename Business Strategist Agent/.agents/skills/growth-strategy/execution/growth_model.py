#!/usr/bin/env python3
"""
growth_model.py

Models customer acquisition funnels, CAC/LTV calculations,
and channel comparison for Hedge Edge.

Usage:
    python growth_model.py --action funnel --output tmp/funnel_model.json
    python growth_model.py --action channels --budget 5000
    python growth_model.py --action ltv-cac --churn 0.08 --arpu 35
"""

import json
import argparse
from datetime import datetime, timezone
from pathlib import Path


# ── Channel Definitions ──────────────────────────────────────────────────────

CHANNELS = {
    "discord_organic": {
        "name": "Discord Community (Organic)",
        "monthly_reach": 5000,
        "conversion_rate": 0.04,
        "monthly_cost_usd": 200,  # Community manager time, bots, giveaways
        "scalability": "medium",
        "compounding": True,
        "time_to_results_weeks": 4,
        "notes": "Builds owned audience. Slow start, compounds heavily over 6+ months.",
    },
    "youtube_partnerships": {
        "name": "YouTube Influencer Partnerships",
        "monthly_reach": 20000,
        "conversion_rate": 0.015,
        "monthly_cost_usd": 2000,  # Sponsorship fees
        "scalability": "high",
        "compounding": True,  # Videos stay up forever (SEO)
        "time_to_results_weeks": 2,
        "notes": "Best for education-first positioning. Evergreen content.",
    },
    "youtube_owned": {
        "name": "YouTube (Own Channel)",
        "monthly_reach": 2000,
        "conversion_rate": 0.03,
        "monthly_cost_usd": 500,  # Production costs
        "scalability": "high",
        "compounding": True,
        "time_to_results_weeks": 12,
        "notes": "Slow to build, but owned distribution. Extremely compounding.",
    },
    "reddit_organic": {
        "name": "Reddit (r/Forex, r/PropFirm)",
        "monthly_reach": 8000,
        "conversion_rate": 0.01,
        "monthly_cost_usd": 100,
        "scalability": "low",
        "compounding": False,
        "time_to_results_weeks": 2,
        "notes": "Good for authority building. Low conversion but high trust traffic.",
    },
    "affiliate_program": {
        "name": "Affiliate / Referral Program",
        "monthly_reach": 3000,
        "conversion_rate": 0.06,
        "monthly_cost_usd": 0,  # Revenue share only
        "cpa_usd": 15,  # Per acquisition cost
        "scalability": "high",
        "compounding": True,
        "time_to_results_weeks": 6,
        "notes": "Zero upfront cost. Affiliates are prop firm traders themselves.",
    },
    "telegram_groups": {
        "name": "Telegram Trading Groups",
        "monthly_reach": 10000,
        "conversion_rate": 0.02,
        "monthly_cost_usd": 500,  # Sponsorships, group management
        "scalability": "medium",
        "compounding": False,
        "time_to_results_weeks": 1,
        "notes": "Strong in SEA/MENA regions. Fast results but transient.",
    },
    "tiktok_content": {
        "name": "TikTok / Short-Form Video",
        "monthly_reach": 50000,
        "conversion_rate": 0.005,
        "monthly_cost_usd": 800,
        "scalability": "high",
        "compounding": False,
        "time_to_results_weeks": 3,
        "notes": "Massive reach, low conversion. Good for brand awareness in younger demographic.",
    },
    "prop_firm_partnerships": {
        "name": "Prop Firm Direct Partnerships",
        "monthly_reach": 15000,
        "conversion_rate": 0.03,
        "monthly_cost_usd": 0,  # Revenue share
        "scalability": "high",
        "compounding": True,
        "time_to_results_weeks": 12,
        "notes": "Distribution through prop firm dashboards. Slow to close, massive if landed.",
    },
    "seo_content": {
        "name": "SEO / Blog Content",
        "monthly_reach": 3000,
        "conversion_rate": 0.025,
        "monthly_cost_usd": 600,
        "scalability": "high",
        "compounding": True,
        "time_to_results_weeks": 16,
        "notes": "Targets 'how to pass prop firm challenge' type searches. Slow but compounding.",
    },
}


def calculate_channel_economics(channel: dict, arpu: float = 35, churn: float = 0.08) -> dict:
    """Calculate unit economics for a single channel."""
    monthly_acquisitions = channel["monthly_reach"] * channel["conversion_rate"]
    
    if "cpa_usd" in channel:
        cac = channel["cpa_usd"]
        monthly_cost = monthly_acquisitions * cac
    else:
        monthly_cost = channel["monthly_cost_usd"]
        cac = monthly_cost / monthly_acquisitions if monthly_acquisitions > 0 else float("inf")
    
    ltv = arpu / churn  # Simplified LTV
    ltv_cac_ratio = ltv / cac if cac > 0 else float("inf")
    payback_months = cac / arpu if arpu > 0 else float("inf")
    
    return {
        "channel": channel["name"],
        "monthly_reach": channel["monthly_reach"],
        "conversion_rate": channel["conversion_rate"],
        "monthly_acquisitions": round(monthly_acquisitions, 1),
        "cac_usd": round(cac, 2),
        "ltv_usd": round(ltv, 2),
        "ltv_cac_ratio": round(ltv_cac_ratio, 2),
        "payback_months": round(payback_months, 1),
        "monthly_cost_usd": round(monthly_cost, 2),
        "scalable": channel["scalability"],
        "compounding": channel["compounding"],
        "time_to_results_weeks": channel["time_to_results_weeks"],
        "verdict": "INVEST" if ltv_cac_ratio >= 3 else ("TEST" if ltv_cac_ratio >= 1.5 else "AVOID"),
    }


def model_funnel(users: int = 500, arpu: float = 35, churn: float = 0.08) -> dict:
    """Model the full AARRR funnel with current estimates."""
    
    funnel = {
        "awareness": {
            "description": "Prop firm traders who encounter Hedge Edge",
            "monthly_visitors": users * 20,  # Estimate: 20x current users = total aware
        },
        "acquisition": {
            "description": "Visitors who sign up (free or paid)",
            "signup_rate": 0.08,
            "monthly_signups": round(users * 20 * 0.08),
        },
        "activation": {
            "description": "Signups who complete first hedged trade",
            "activation_rate": 0.35,
            "monthly_activated": round(users * 20 * 0.08 * 0.35),
        },
        "retention": {
            "description": "Activated users still active after 30 days",
            "retention_30d": 1 - churn,
            "monthly_retained": round(users * (1 - churn)),
        },
        "revenue": {
            "description": "Paying subscribers",
            "paid_conversion": 0.25,  # Free → paid
            "mrr_usd": round(users * arpu, 2),
            "arpu_usd": arpu,
        },
        "referral": {
            "description": "Users who refer others",
            "referral_rate": 0.10,
            "monthly_referrals": round(users * 0.10),
            "viral_coefficient": 0.10 * 0.5,  # Referral rate × conversion of referred
        },
    }
    
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "current_users": users,
        "funnel": funnel,
        "key_metrics": {
            "mrr_usd": funnel["revenue"]["mrr_usd"],
            "monthly_churn": churn,
            "ltv_usd": round(arpu / churn, 2),
            "viral_coefficient": funnel["referral"]["viral_coefficient"],
        },
        "bottleneck": identify_bottleneck(funnel),
    }


def identify_bottleneck(funnel: dict) -> dict:
    """Identify the biggest drop-off in the funnel."""
    rates = {
        "signup_rate": funnel["acquisition"]["signup_rate"],
        "activation_rate": funnel["activation"]["activation_rate"],
        "retention_30d": funnel["retention"]["retention_30d"],
        "paid_conversion": funnel["revenue"]["paid_conversion"],
        "referral_rate": funnel["referral"]["referral_rate"],
    }
    
    # Find the worst rate relative to benchmarks
    benchmarks = {
        "signup_rate": 0.10,
        "activation_rate": 0.50,
        "retention_30d": 0.90,
        "paid_conversion": 0.30,
        "referral_rate": 0.15,
    }
    
    worst_gap = 0
    bottleneck = None
    for key, actual in rates.items():
        gap = (benchmarks[key] - actual) / benchmarks[key]
        if gap > worst_gap:
            worst_gap = gap
            bottleneck = key
    
    return {
        "metric": bottleneck,
        "current": rates.get(bottleneck, 0),
        "benchmark": benchmarks.get(bottleneck, 0),
        "gap_pct": round(worst_gap * 100, 1),
        "recommendation": f"Improving {bottleneck} from {rates.get(bottleneck, 0):.0%} to "
                         f"{benchmarks.get(bottleneck, 0):.0%} would have the largest impact on growth."
    }


def compare_channels(budget: float = 5000, arpu: float = 35, churn: float = 0.08) -> dict:
    """Compare all channels and allocate budget optimally."""
    results = []
    for key, channel in CHANNELS.items():
        econ = calculate_channel_economics(channel, arpu, churn)
        econ["channel_key"] = key
        results.append(econ)
    
    # Sort by LTV:CAC ratio
    results.sort(key=lambda x: x["ltv_cac_ratio"], reverse=True)
    
    # Budget allocation (proportional to LTV:CAC, weighted toward compounding)
    invest_channels = [r for r in results if r["verdict"] in ("INVEST", "TEST")]
    total_weight = sum(
        r["ltv_cac_ratio"] * (1.5 if r["compounding"] else 1.0)
        for r in invest_channels
    )
    
    allocation = []
    for r in invest_channels:
        weight = r["ltv_cac_ratio"] * (1.5 if r["compounding"] else 1.0)
        pct = weight / total_weight if total_weight > 0 else 0
        allocated = budget * pct
        allocation.append({
            "channel": r["channel"],
            "allocated_usd": round(allocated, 2),
            "pct_of_budget": round(pct * 100, 1),
            "expected_acquisitions": round(allocated / r["cac_usd"]) if r["cac_usd"] > 0 else 0,
            "ltv_cac_ratio": r["ltv_cac_ratio"],
            "verdict": r["verdict"],
        })
    
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "budget_usd": budget,
        "channel_rankings": results,
        "recommended_allocation": allocation,
        "total_expected_acquisitions": sum(a["expected_acquisitions"] for a in allocation),
    }


def main():
    parser = argparse.ArgumentParser(description="Hedge Edge growth model")
    parser.add_argument("--action", required=True,
                       choices=["funnel", "channels", "ltv-cac"],
                       help="Analysis type")
    parser.add_argument("--users", type=int, default=500, help="Current active users")
    parser.add_argument("--arpu", type=float, default=35, help="Average revenue per user (monthly)")
    parser.add_argument("--churn", type=float, default=0.08, help="Monthly churn rate")
    parser.add_argument("--budget", type=float, default=5000, help="Monthly growth budget")
    parser.add_argument("--output", default=None, help="Output file path")
    args = parser.parse_args()
    
    if args.action == "funnel":
        result = model_funnel(args.users, args.arpu, args.churn)
        print(f"\n📊 Funnel Model (Current: {args.users} users)")
        print(f"  MRR: ${result['key_metrics']['mrr_usd']:,.2f}")
        print(f"  LTV: ${result['key_metrics']['ltv_usd']:,.2f}")
        print(f"  Bottleneck: {result['bottleneck']['metric']} "
              f"({result['bottleneck']['current']:.0%} vs {result['bottleneck']['benchmark']:.0%})")
    
    elif args.action == "channels":
        result = compare_channels(args.budget, args.arpu, args.churn)
        print(f"\n📊 Channel Comparison (Budget: ${args.budget:,.0f}/mo)")
        print(f"\nTop Channels by LTV:CAC:")
        for r in result["channel_rankings"][:5]:
            print(f"  {r['verdict']:6s} | {r['channel']:35s} | LTV:CAC {r['ltv_cac_ratio']:5.1f}x | "
                  f"CAC ${r['cac_usd']:6.2f} | {r['monthly_acquisitions']:5.1f} acq/mo")
        print(f"\nTotal expected acquisitions: {result['total_expected_acquisitions']}/mo")
    
    elif args.action == "ltv-cac":
        ltv = args.arpu / args.churn
        print(f"\n📊 Unit Economics")
        print(f"  ARPU: ${args.arpu:.2f}/mo")
        print(f"  Churn: {args.churn:.1%}/mo")
        print(f"  LTV: ${ltv:,.2f}")
        print(f"  Avg Lifetime: {1/args.churn:.1f} months")
        result = {"arpu": args.arpu, "churn": args.churn, "ltv": round(ltv, 2)}
    
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)
        print(f"\nSaved to {args.output}")


if __name__ == "__main__":
    main()
