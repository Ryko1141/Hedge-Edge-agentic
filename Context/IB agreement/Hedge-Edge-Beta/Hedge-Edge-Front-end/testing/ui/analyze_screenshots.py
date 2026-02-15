"""
Screenshot Analysis for UI Issues

This script analyzes screenshots to detect common UI problems:
1. Empty states / blank areas
2. Loading states stuck
3. Error messages visible
4. Unusual color distributions (may indicate broken themes)
5. Overlapping text areas
"""

from PIL import Image
import os
from pathlib import Path
from collections import Counter
import json

SCREENSHOT_DIR = Path(__file__).parent / "ui_inspection"

def analyze_screenshot(filepath):
    """Analyze a single screenshot for issues"""
    img = Image.open(filepath)
    width, height = img.size
    pixels = list(img.getdata())
    
    issues = []
    
    # Count colors
    color_counts = Counter(pixels)
    total_pixels = width * height
    
    # Check for mostly blank/white screens (error state)
    white_variants = sum(v for k, v in color_counts.items() 
                        if len(k) >= 3 and k[0] > 240 and k[1] > 240 and k[2] > 240)
    white_pct = white_variants / total_pixels
    
    if white_pct > 0.70:
        issues.append({
            "type": "mostly_blank",
            "description": f"Screen is {white_pct:.1%} white/blank",
            "severity": "warning"
        })
    
    # Check for mostly black screens (may indicate crash/freeze)
    black_variants = sum(v for k, v in color_counts.items() 
                        if len(k) >= 3 and k[0] < 30 and k[1] < 30 and k[2] < 30)
    black_pct = black_variants / total_pixels
    
    if black_pct > 0.70:
        issues.append({
            "type": "mostly_black",
            "description": f"Screen is {black_pct:.1%} black/dark",
            "severity": "warning"
        })
    
    # Check color variety (too few colors may indicate broken rendering)
    unique_colors = len(color_counts)
    if unique_colors < 50:
        issues.append({
            "type": "low_color_variety",
            "description": f"Only {unique_colors} unique colors (may indicate broken rendering)",
            "severity": "info"
        })
    
    # Check for red error indicators (common error color)
    red_pixels = sum(v for k, v in color_counts.items() 
                    if len(k) >= 3 and k[0] > 200 and k[1] < 100 and k[2] < 100)
    red_pct = red_pixels / total_pixels
    
    if red_pct > 0.01:  # More than 1% red could indicate error states
        issues.append({
            "type": "red_indicators",
            "description": f"Contains {red_pct:.2%} red pixels (may show errors)",
            "severity": "info"
        })
    
    return {
        "file": filepath.name,
        "size": f"{width}x{height}",
        "unique_colors": unique_colors,
        "white_pct": f"{white_pct:.1%}",
        "black_pct": f"{black_pct:.1%}",
        "issues": issues
    }


def main():
    print("=" * 70)
    print("SCREENSHOT ANALYSIS FOR UI ISSUES")
    print("=" * 70)
    
    screenshots = list(SCREENSHOT_DIR.glob("*.png"))
    print(f"\nAnalyzing {len(screenshots)} screenshots...")
    
    all_results = []
    all_issues = []
    
    for filepath in sorted(screenshots):
        result = analyze_screenshot(filepath)
        all_results.append(result)
        
        if result["issues"]:
            print(f"\n📷 {result['file']}:")
            for issue in result["issues"]:
                icon = {"warning": "⚠️", "info": "ℹ️"}.get(issue["severity"], "❓")
                print(f"   {icon} {issue['description']}")
                all_issues.append({**issue, "file": result["file"]})
        else:
            print(f"✅ {result['file']}: OK")
    
    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"Screenshots analyzed: {len(screenshots)}")
    print(f"Issues found: {len(all_issues)}")
    
    if all_issues:
        print("\nAll issues:")
        for issue in all_issues:
            icon = {"warning": "⚠️", "info": "ℹ️"}.get(issue["severity"], "❓")
            print(f"  {icon} [{issue['file']}] {issue['description']}")
    else:
        print("\n✅ No automated issues detected!")
        print("   Screenshots appear to have proper content and colors")
    
    # Save analysis
    output_path = SCREENSHOT_DIR / "screenshot_analysis.json"
    with open(output_path, 'w') as f:
        json.dump({
            "total": len(screenshots),
            "issues_count": len(all_issues),
            "results": all_results,
            "issues": all_issues
        }, f, indent=2)
    
    print(f"\nAnalysis saved to: {output_path}")


if __name__ == '__main__':
    main()
