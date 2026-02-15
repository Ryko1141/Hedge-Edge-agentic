#!/usr/bin/env python3
"""
competitor_tracker.py

Tracks and profiles competitors in the prop firm hedging / trade copier space.
Maintains a structured competitor database and generates comparison reports.

Usage:
    python competitor_tracker.py --action profile --competitor "Duplikium"
    python competitor_tracker.py --action landscape --output tmp/competitive_landscape.json
    python competitor_tracker.py --action compare --features "hedging,multi-platform,local-execution"
"""

import json
import argparse
from datetime import datetime, timezone
from pathlib import Path


def load_competitor_profiles() -> dict:
    """Load competitor profiles from resources."""
    resources_dir = Path(__file__).parent.parent / "resources"
    path = resources_dir / "competitor-profiles.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"competitors": [], "last_updated": None}


def save_competitor_profiles(data: dict):
    """Persist updated competitor profiles."""
    resources_dir = Path(__file__).parent.parent / "resources"
    resources_dir.mkdir(parents=True, exist_ok=True)
    path = resources_dir / "competitor-profiles.json"
    data["last_updated"] = datetime.now(timezone.utc).isoformat()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"[CompIntel] Saved {len(data['competitors'])} profiles to {path}")


def generate_feature_matrix(competitors: list) -> dict:
    """
    Generate weighted feature comparison matrix.
    
    Scoring: 0 (absent) to 10 (best-in-class)
    Weights reflect Hedge Edge's strategic priorities.
    """
    features = {
        "reverse_copy_hedging":     {"weight": 0.25, "description": "Automated reverse/hedge copy trading"},
        "multi_platform":           {"weight": 0.15, "description": "MT4 + MT5 + cTrader support"},
        "local_execution":          {"weight": 0.15, "description": "Runs locally (not cloud) for low latency"},
        "multi_account_mgmt":       {"weight": 0.10, "description": "Manage many accounts in one dashboard"},
        "drawdown_protection":      {"weight": 0.10, "description": "Daily loss / drawdown monitoring & auto-stop"},
        "visual_hedge_map":         {"weight": 0.05, "description": "Visual representation of hedged positions"},
        "ease_of_setup":            {"weight": 0.10, "description": "Time from download to first hedged trade"},
        "pricing_value":            {"weight": 0.10, "description": "Feature density per dollar"},
    }
    
    matrix = {
        "features": features,
        "scores": {},
        "weighted_totals": {},
    }
    
    for competitor in competitors:
        name = competitor["name"]
        scores = competitor.get("feature_scores", {})
        weighted = 0
        for feature_key, feature_def in features.items():
            score = scores.get(feature_key, 0)
            weighted += score * feature_def["weight"]
        matrix["scores"][name] = scores
        matrix["weighted_totals"][name] = round(weighted, 2)
    
    # Sort by weighted total
    matrix["ranking"] = sorted(
        matrix["weighted_totals"].items(),
        key=lambda x: x[1],
        reverse=True
    )
    
    return matrix


def assess_threats(competitors: list) -> list:
    """Classify competitor threat levels."""
    threat_levels = []
    
    for comp in competitors:
        ring = comp.get("competitive_ring", 3)
        momentum = comp.get("momentum", "stable")  # growing, stable, declining
        feature_overlap = comp.get("feature_overlap_pct", 0)
        
        # Threat scoring
        score = 0
        score += {1: 30, 2: 15, 3: 5}.get(ring, 0)
        score += {"growing": 30, "stable": 10, "declining": 0}.get(momentum, 0)
        score += feature_overlap * 0.4  # 0-40 points based on 0-100% overlap
        
        if score >= 60:
            level = "Critical"
        elif score >= 40:
            level = "High"
        elif score >= 25:
            level = "Medium"
        elif score >= 10:
            level = "Low"
        else:
            level = "Noise"
        
        threat_levels.append({
            "competitor": comp["name"],
            "threat_level": level,
            "threat_score": round(score, 1),
            "ring": ring,
            "momentum": momentum,
            "feature_overlap_pct": feature_overlap,
            "key_risk": comp.get("key_risk", ""),
            "our_advantage": comp.get("our_advantage", ""),
        })
    
    return sorted(threat_levels, key=lambda x: x["threat_score"], reverse=True)


def generate_landscape_report(data: dict) -> dict:
    """Full competitive landscape report."""
    competitors = data.get("competitors", [])
    
    matrix = generate_feature_matrix(competitors)
    threats = assess_threats(competitors)
    
    # Segment by ring
    ring_1 = [c for c in competitors if c.get("competitive_ring") == 1]
    ring_2 = [c for c in competitors if c.get("competitive_ring") == 2]
    ring_3 = [c for c in competitors if c.get("competitive_ring") == 3]
    
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_tracked": len(competitors),
            "ring_1_direct": len(ring_1),
            "ring_2_adjacent": len(ring_2),
            "ring_3_substitutes": len(ring_3),
            "critical_threats": len([t for t in threats if t["threat_level"] == "Critical"]),
            "high_threats": len([t for t in threats if t["threat_level"] == "High"]),
        },
        "feature_matrix": matrix,
        "threat_assessment": threats,
        "hedge_edge_position": {
            "weighted_score": matrix["weighted_totals"].get("Hedge Edge", 0),
            "rank": next(
                (i + 1 for i, (name, _) in enumerate(matrix["ranking"]) if name == "Hedge Edge"),
                None
            ),
            "total_competitors": len(matrix["ranking"]),
        }
    }


def main():
    parser = argparse.ArgumentParser(description="Competitive intelligence tracker")
    parser.add_argument("--action", required=True,
                       choices=["profile", "landscape", "compare", "threats"],
                       help="Action to perform")
    parser.add_argument("--competitor", default=None, help="Specific competitor name")
    parser.add_argument("--features", default=None, help="Comma-separated features to compare")
    parser.add_argument("--output", default=None, help="Output file path")
    args = parser.parse_args()
    
    data = load_competitor_profiles()
    
    if args.action == "landscape":
        result = generate_landscape_report(data)
    elif args.action == "threats":
        result = {"threats": assess_threats(data.get("competitors", []))}
    elif args.action == "compare":
        result = generate_feature_matrix(data.get("competitors", []))
    elif args.action == "profile":
        comp = next(
            (c for c in data.get("competitors", [])
             if c["name"].lower() == (args.competitor or "").lower()),
            None
        )
        result = comp if comp else {"error": f"Competitor '{args.competitor}' not found in database"}
    else:
        result = {"error": f"Unknown action: {args.action}"}
    
    output_json = json.dumps(result, indent=2)
    
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(output_json)
        print(f"[CompIntel] Results saved to {args.output}")
    else:
        print(output_json)


if __name__ == "__main__":
    main()
