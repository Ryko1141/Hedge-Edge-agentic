#!/usr/bin/env python3
"""
strategic_scorecard.py

Strategic health scorecard for Hedge Edge. Tracks key metrics against targets,
scores strategic initiatives, and models scenarios.

Usage:
    python strategic_scorecard.py --action scorecard
    python strategic_scorecard.py --action initiatives --output tmp/initiatives.json
    python strategic_scorecard.py --action scenario --name "prop-firms-ban-hedging"
"""

import json
import argparse
from datetime import datetime, timezone
from pathlib import Path


# ── Strategic Targets ─────────────────────────────────────────────────────────

TARGETS = {
    "6mo": {
        "paying_users": 1000,
        "mrr_usd": 40000,
        "platforms_supported": 3,  # MT4, MT5, cTrader
        "broker_partners": 4,
        "monthly_churn": 0.07,
        "affiliate_count": 30,
    },
    "18mo": {
        "paying_users": 5000,
        "mrr_usd": 200000,
        "platforms_supported": 3,
        "broker_partners": 6,
        "monthly_churn": 0.05,
        "affiliate_count": 200,
    },
    "36mo": {
        "paying_users": 20000,
        "mrr_usd": 1000000,
        "platforms_supported": 5,
        "broker_partners": 10,
        "monthly_churn": 0.03,
        "affiliate_count": 1000,
    },
}


def calculate_scorecard(current: dict = None) -> dict:
    """
    Calculate strategic health scorecard.
    Compares current metrics against phase targets.
    """
    if current is None:
        current = {
            "paying_users": 500,
            "mrr_usd": 17500,
            "platforms_supported": 1,
            "broker_partners": 2,
            "monthly_churn": 0.08,
            "affiliate_count": 0,
        }
    
    scorecard = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "current_metrics": current,
        "phase_progress": {},
    }
    
    for phase, targets in TARGETS.items():
        metrics = {}
        total_score = 0
        count = 0
        
        for key, target in targets.items():
            actual = current.get(key, 0)
            
            if key == "monthly_churn":
                # Lower is better for churn
                progress = min(1.0, (target / actual) if actual > 0 else 0)
            else:
                progress = min(1.0, actual / target if target > 0 else 0)
            
            metrics[key] = {
                "actual": actual,
                "target": target,
                "progress_pct": round(progress * 100, 1),
                "status": (
                    "ON_TRACK" if progress >= 0.7 else
                    "AT_RISK" if progress >= 0.4 else
                    "OFF_TRACK"
                ),
            }
            total_score += progress
            count += 1
        
        scorecard["phase_progress"][phase] = {
            "metrics": metrics,
            "overall_score": round((total_score / count) * 100, 1) if count > 0 else 0,
            "overall_status": (
                "ON_TRACK" if (total_score / count) >= 0.7 else
                "AT_RISK" if (total_score / count) >= 0.4 else
                "OFF_TRACK"
            ) if count > 0 else "NO_DATA",
        }
    
    # Strategic health indicators
    scorecard["health_indicators"] = calculate_health_indicators(current)
    
    return scorecard


def calculate_health_indicators(metrics: dict) -> dict:
    """Calculate qualitative strategic health indicators."""
    indicators = {}
    
    # Moat strength
    moat_score = 0
    if metrics.get("platforms_supported", 0) >= 2:
        moat_score += 2  # Product moat
    if metrics.get("broker_partners", 0) >= 3:
        moat_score += 2  # Network moat
    if metrics.get("affiliate_count", 0) >= 10:
        moat_score += 2  # Distribution moat
    if metrics.get("paying_users", 0) >= 1000:
        moat_score += 2  # Data moat (enough users for meaningful data)
    if metrics.get("monthly_churn", 1) <= 0.06:
        moat_score += 2  # Stickiness moat
    
    indicators["moat_strength"] = {
        "score": moat_score,
        "max": 10,
        "grade": (
            "Strong" if moat_score >= 8 else
            "Building" if moat_score >= 5 else
            "Weak" if moat_score >= 2 else
            "None"
        ),
    }
    
    # Revenue diversification
    ib_pct = 40  # Estimate — IB as % of total revenue
    saas_pct = 60
    diversification = 100 - abs(ib_pct - saas_pct)  # Closer to 50/50 = better
    indicators["revenue_diversification"] = {
        "saas_pct": saas_pct,
        "ib_pct": ib_pct,
        "diversification_score": diversification,
        "grade": (
            "Well diversified" if diversification >= 80 else
            "Moderately diversified" if diversification >= 60 else
            "Concentrated" if diversification >= 40 else
            "Single source"
        ),
    }
    
    # Execution velocity
    indicators["execution_velocity"] = {
        "note": "Track sprint completion rate and feature shipping cadence here",
        "recommendation": "Ship one meaningful feature every 2 weeks during Foundation phase",
    }
    
    return indicators


def evaluate_initiative(
    name: str,
    description: str,
    moat_layer: str = "none",
    estimated_impact: dict = None,
    effort_weeks: int = 4,
    risk: str = "medium",
) -> dict:
    """Score a strategic initiative."""
    
    if estimated_impact is None:
        estimated_impact = {"mrr_change_pct": 0, "churn_change_pct": 0, "users_change_pct": 0}
    
    # Impact score (0-10)
    impact = 0
    impact += min(5, abs(estimated_impact.get("mrr_change_pct", 0)) / 10)
    impact += min(3, abs(estimated_impact.get("churn_change_pct", 0)) / 5)
    impact += min(2, abs(estimated_impact.get("users_change_pct", 0)) / 10)
    
    # Effort score (inverse — lower effort = higher score)
    effort_score = max(1, 10 - (effort_weeks / 2))
    
    # Moat bonus
    moat_bonus = {"product": 2, "data": 3, "network": 3, "brand": 1, "none": 0}.get(moat_layer, 0)
    
    # Risk penalty
    risk_penalty = {"low": 0, "medium": 1, "high": 3}.get(risk, 1)
    
    total_score = impact + effort_score + moat_bonus - risk_penalty
    
    return {
        "initiative": name,
        "description": description,
        "scores": {
            "impact": round(impact, 1),
            "effort": round(effort_score, 1),
            "moat_bonus": moat_bonus,
            "risk_penalty": risk_penalty,
            "total": round(total_score, 1),
        },
        "priority": (
            "P0 — Do Now" if total_score >= 12 else
            "P1 — Next Sprint" if total_score >= 9 else
            "P2 — This Quarter" if total_score >= 6 else
            "P3 — Backlog"
        ),
        "moat_layer": moat_layer,
    }


def model_scenario(scenario_name: str) -> dict:
    """Model a strategic scenario and its implications."""
    
    scenarios = {
        "prop-firms-ban-hedging": {
            "name": "Prop Firms Ban Hedging",
            "probability": "medium",
            "timeline": "6-18 months",
            "impact": {
                "revenue_impact_pct": -40,
                "user_impact_pct": -30,
                "description": "Core use case threatened. 30-40% of users may churn if their prop firm bans hedging.",
            },
            "leading_indicators": [
                "FTMO updates terms to explicitly ban hedging",
                "Multiple prop firms add IP/trade pattern detection",
                "Reddit/Discord discussions about hedging bans increasing",
            ],
            "response_plan": [
                "Pivot messaging to 'multi-account risk management' (broader positioning)",
                "Build features with standalone value (portfolio analytics, drawdown alerts)",
                "Accelerate funded-account management features (post-challenge value)",
                "Diversify to retail traders (non-prop use case for the copier)",
            ],
        },
        "major-competitor-raises": {
            "name": "Major Competitor Raises $5M+",
            "probability": "medium",
            "timeline": "3-12 months",
            "impact": {
                "revenue_impact_pct": -15,
                "user_impact_pct": -10,
                "description": "Well-funded competitor outspends on ads, partnerships, and features.",
            },
            "leading_indicators": [
                "Crunchbase/Twitter announcements",
                "Competitor suddenly increases ad spend",
                "Competitor poaches broker partnerships",
            ],
            "response_plan": [
                "Lock in broker exclusivity deals immediately (pre-emptive)",
                "Double down on community (can't be bought with money)",
                "Speed up multi-platform launch (feature parity defense)",
                "Focus on retention over acquisition (keep existing users loyal)",
            ],
        },
        "platform-shift": {
            "name": "MT4/MT5 Loses Market Share to DXtrade/Match-Trader",
            "probability": "medium-low",
            "timeline": "12-36 months",
            "impact": {
                "revenue_impact_pct": -20,
                "user_impact_pct": -15,
                "description": "If traders migrate to new platforms, Hedge Edge must follow or lose relevance.",
            },
            "leading_indicators": [
                "Top prop firms switching to DXtrade/Match-Trader",
                "MetaQuotes licensing changes",
                "Trader sentiment shifting away from MetaTrader",
            ],
            "response_plan": [
                "Build platform-agnostic trade execution layer",
                "Invest in DXtrade connector as exploratory (10% allocation)",
                "Monitor platform adoption monthly",
                "Build relationships with DXtrade/Match-Trader for API access",
            ],
        },
        "regulatory-crackdown": {
            "name": "Regulatory Crackdown on Prop Firms",
            "probability": "low-medium",
            "timeline": "12-36 months",
            "impact": {
                "revenue_impact_pct": -60,
                "user_impact_pct": -50,
                "description": "If prop firms are regulated out of major markets, TAM shrinks dramatically.",
            },
            "leading_indicators": [
                "ESMA, FCA, or CFTC announcements about prop trading",
                "Major prop firm fined or shut down by regulators",
                "Media coverage escalates about prop firm complaints",
            ],
            "response_plan": [
                "Diversify to retail multi-account management (platform survives)",
                "IB revenue becomes primary (brokers survive regulation)",
                "Build fund management features (regulated hedge fund use case)",
                "Geographic diversification to favorable jurisdictions",
            ],
        },
    }
    
    scenario = scenarios.get(scenario_name)
    if not scenario:
        return {
            "error": f"Unknown scenario: {scenario_name}",
            "available": list(scenarios.keys()),
        }
    
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scenario": scenario,
        "preparedness_checklist": [
            {"action": step, "status": "not_started"}
            for step in scenario["response_plan"]
        ],
    }


def main():
    parser = argparse.ArgumentParser(description="Strategic scorecard")
    parser.add_argument("--action", required=True,
                       choices=["scorecard", "initiatives", "scenario"])
    parser.add_argument("--name", default=None, help="Initiative or scenario name")
    parser.add_argument("--output", default=None)
    args = parser.parse_args()
    
    if args.action == "scorecard":
        result = calculate_scorecard()
        print(f"\nStrategic Scorecard")
        for phase, data in result["phase_progress"].items():
            print(f"\n  Phase: {phase} — {data['overall_status']} ({data['overall_score']:.0f}/100)")
            for key, metric in data["metrics"].items():
                print(f"    {key:25s}: {metric['actual']:>8} / {metric['target']:>8} "
                      f"({metric['progress_pct']:5.1f}%) [{metric['status']}]")
        
        moat = result["health_indicators"]["moat_strength"]
        print(f"\n  Moat Strength: {moat['grade']} ({moat['score']}/{moat['max']})")
    
    elif args.action == "initiatives":
        # Score the standard initiative backlog
        initiatives = [
            evaluate_initiative("Launch MT4 Support", "Extend EA to MT4 platform", "product",
                              {"mrr_change_pct": 30, "users_change_pct": 40}, effort_weeks=6),
            evaluate_initiative("Launch cTrader Support", "Build cBot for cTrader", "product",
                              {"mrr_change_pct": 15, "users_change_pct": 20}, effort_weeks=8),
            evaluate_initiative("Launch Pro Tier at $59", "New tier with advanced features", "none",
                              {"mrr_change_pct": 25, "churn_change_pct": -10}, effort_weeks=3),
            evaluate_initiative("Affiliate Program", "Launch tiered affiliate program", "network",
                              {"users_change_pct": 30, "mrr_change_pct": 20}, effort_weeks=4),
            evaluate_initiative("Sign IC Markets IB", "New broker partnership", "network",
                              {"mrr_change_pct": 15}, effort_weeks=2, risk="low"),
            evaluate_initiative("Annual Pricing", "Add annual subscription option", "none",
                              {"churn_change_pct": -30, "mrr_change_pct": -5}, effort_weeks=2, risk="low"),
            evaluate_initiative("Mobile Companion App", "Portfolio monitoring on mobile", "product",
                              {"churn_change_pct": -10, "users_change_pct": 5}, effort_weeks=16, risk="high"),
        ]
        
        initiatives.sort(key=lambda x: x["scores"]["total"], reverse=True)
        result = {"initiatives": initiatives}
        
        print(f"\nStrategic Initiative Prioritization:")
        for init in initiatives:
            print(f"  {init['priority']:20s} | {init['initiative']:30s} | "
                  f"Score: {init['scores']['total']:5.1f} | Moat: {init['moat_layer']}")
    
    elif args.action == "scenario":
        result = model_scenario(args.name or "prop-firms-ban-hedging")
        if "error" in result:
            print(f"\nError: {result['error']}")
            print(f"Available: {result['available']}")
        else:
            s = result["scenario"]
            print(f"\nScenario: {s['name']}")
            print(f"  Probability: {s['probability']}")
            print(f"  Timeline: {s['timeline']}")
            print(f"  Revenue Impact: {s['impact']['revenue_impact_pct']:+d}%")
            print(f"\n  Response Plan:")
            for i, step in enumerate(s["response_plan"], 1):
                print(f"    {i}. {step}")
    
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, default=str)
        print(f"\nSaved to {args.output}")


if __name__ == "__main__":
    main()
