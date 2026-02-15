#!/usr/bin/env python3
"""
Example script demonstrating resource inclusion in Agent Skills.

This script is referenced from SKILL.md using a relative path:
[example-script.py](./execution/example-script.py)

Copilot can read and execute this script when the skill is activated.
"""

def main():
    """Sample function demonstrating skill script structure."""
    print("Sample skill script executed successfully!")
    
    # Your skill logic goes here
    # This could be:
    # - Data processing
    # - File generation
    # - API calls
    # - Analysis routines
    
    return {"status": "success", "message": "Skill completed"}


if __name__ == "__main__":
    result = main()
    print(result)
