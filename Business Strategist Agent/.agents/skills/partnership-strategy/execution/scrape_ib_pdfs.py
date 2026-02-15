#!/usr/bin/env python3
"""
scrape_ib_pdfs.py

Scrapes IB (Introducing Broker) agreement PDFs and converts them to
structured Markdown files for the Business Strategist Agent's reference.

Reads PDFs from:  Context/IB agreement/
Outputs to:       .agents/skills/partnership-strategy/resources/

Usage:
    python scrape_ib_pdfs.py
    python scrape_ib_pdfs.py --pdf "Vantage_IB_agreement.pdf"
    python scrape_ib_pdfs.py --output-dir "./custom/output"
"""

import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print("ERROR: pdfplumber not installed. Run: pip install pdfplumber")
    sys.exit(1)


# ---------- paths ----------
SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
RESOURCES_DIR = SKILL_DIR / "resources"
# Walk up to workspace root (Orchestrator Hedge Edge)
WORKSPACE_ROOT = SKILL_DIR.parents[3]  # .agents/skills/partnership-strategy -> Business Strategist Agent -> Orchestrator Hedge Edge
IB_PDF_DIR = WORKSPACE_ROOT / "Context" / "IB agreement"


def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extract all text from a PDF using pdfplumber."""
    pages_text = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            text = page.extract_text()
            if text:
                pages_text.append(f"<!-- Page {i} -->\n{text}")
            else:
                pages_text.append(f"<!-- Page {i} — [no extractable text] -->")
    return "\n\n".join(pages_text)


def extract_tables_from_pdf(pdf_path: Path) -> list[dict]:
    """Extract tables from a PDF, returning a list of {page, table_data}."""
    tables = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            page_tables = page.extract_tables()
            for t_idx, table in enumerate(page_tables):
                tables.append({
                    "page": i,
                    "table_index": t_idx,
                    "rows": table,
                })
    return tables


def table_to_markdown(table_data: list[list]) -> str:
    """Convert a 2D table (list of rows) into a Markdown table string."""
    if not table_data or not table_data[0]:
        return ""
    
    # Clean cells
    cleaned = []
    for row in table_data:
        cleaned.append([
            (cell or "").replace("\n", " ").strip() for cell in row
        ])
    
    # Header
    header = cleaned[0]
    md = "| " + " | ".join(header) + " |\n"
    md += "| " + " | ".join(["---"] * len(header)) + " |\n"
    
    # Body
    for row in cleaned[1:]:
        # Pad row if shorter than header
        padded = row + [""] * (len(header) - len(row))
        md += "| " + " | ".join(padded[:len(header)]) + " |\n"
    
    return md


def clean_text(raw_text: str) -> str:
    """Clean up OCR/extraction artefacts."""
    # Collapse multiple blank lines
    text = re.sub(r"\n{3,}", "\n\n", raw_text)
    # Fix common ligature issues
    text = text.replace("ﬁ", "fi").replace("ﬂ", "fl")
    # Fix broken hyphens
    text = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", text)
    return text.strip()


def identify_broker(filename: str) -> str:
    """Determine broker name from filename."""
    lower = filename.lower()
    if "vantage" in lower:
        return "Vantage Markets"
    elif "blackbull" in lower or "black" in lower:
        return "BlackBull Markets"
    else:
        # Use filename as fallback
        return filename.replace(".pdf", "").replace("_", " ").replace("-", " ").title()


def build_markdown(broker_name: str, raw_text: str, tables: list[dict], pdf_name: str) -> str:
    """Build a structured Markdown document from extracted content."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    md = f"""# {broker_name} — IB Agreement Summary

> **Source PDF**: `{pdf_name}`
> **Extracted**: {now}
> **Type**: Introducing Broker (IB) Agreement
> **Status**: Active partner

---

## Full Agreement Text

{clean_text(raw_text)}

"""
    
    # Append extracted tables if any
    if tables:
        md += "\n---\n\n## Extracted Tables\n\n"
        for t in tables:
            md += f"### Table (Page {t['page']}, #{t['table_index'] + 1})\n\n"
            md += table_to_markdown(t["rows"])
            md += "\n"
    
    md += f"""
---

## Quick Reference for Business Strategy Agent

### Key Questions to Answer from This Agreement

1. **Commission Structure**: What is the per-lot commission / revenue share?
2. **Payment Terms**: When and how are commissions paid?
3. **Obligations**: What must Hedge Edge do (and not do) as IB?
4. **Termination Clauses**: What triggers termination? Notice period?
5. **Exclusivity**: Is there an exclusivity requirement?
6. **Sub-IB Rights**: Can Hedge Edge appoint sub-IBs?
7. **Marketing Restrictions**: What marketing activities are permitted/prohibited?
8. **Compliance Requirements**: What regulatory obligations apply?
9. **Liability & Indemnification**: What risks does Hedge Edge carry?
10. **Data & Reporting**: What reporting does the broker provide?

> **Note**: Review the full text above to extract answers to these questions.
> The Business Strategist Agent should reference this document when evaluating
> partnership terms, negotiating renewals, or comparing broker deals.
"""
    
    return md


def scrape_single_pdf(pdf_path: Path, output_dir: Path) -> Path:
    """Scrape one PDF and write the markdown output."""
    broker_name = identify_broker(pdf_path.name)
    
    print(f"  [1/3] Extracting text from: {pdf_path.name}")
    raw_text = extract_text_from_pdf(pdf_path)
    
    print(f"  [2/3] Extracting tables...")
    tables = extract_tables_from_pdf(pdf_path)
    print(f"        Found {len(tables)} table(s)")
    
    print(f"  [3/3] Building markdown...")
    md_content = build_markdown(broker_name, raw_text, tables, pdf_path.name)
    
    # Output filename
    slug = re.sub(r"[^a-z0-9]+", "-", broker_name.lower()).strip("-")
    out_path = output_dir / f"{slug}-ib-agreement.md"
    out_path.write_text(md_content, encoding="utf-8")
    
    print(f"        ✓ Saved: {out_path.relative_to(SKILL_DIR)}")
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Scrape IB agreement PDFs to Markdown")
    parser.add_argument("--pdf", type=str, help="Specific PDF filename to scrape (default: all PDFs in IB folder)")
    parser.add_argument("--pdf-dir", type=str, default=str(IB_PDF_DIR), help="Directory containing IB PDFs")
    parser.add_argument("--output-dir", type=str, default=str(RESOURCES_DIR), help="Output directory for markdown files")
    args = parser.parse_args()
    
    pdf_dir = Path(args.pdf_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    if not pdf_dir.exists():
        print(f"ERROR: PDF directory not found: {pdf_dir}")
        sys.exit(1)
    
    # Discover PDFs
    if args.pdf:
        pdfs = [pdf_dir / args.pdf]
        if not pdfs[0].exists():
            print(f"ERROR: PDF not found: {pdfs[0]}")
            sys.exit(1)
    else:
        pdfs = sorted(pdf_dir.glob("*.pdf"))
    
    if not pdfs:
        print(f"No PDFs found in: {pdf_dir}")
        sys.exit(1)
    
    print(f"=== IB Agreement PDF Scraper ===")
    print(f"PDF directory : {pdf_dir}")
    print(f"Output dir    : {output_dir}")
    print(f"PDFs found    : {len(pdfs)}")
    print()
    
    outputs = []
    for pdf_path in pdfs:
        print(f"Processing: {pdf_path.name}")
        out = scrape_single_pdf(pdf_path, output_dir)
        outputs.append(out)
        print()
    
    # Write an index file
    index_path = output_dir / "ib-agreements-index.md"
    index_md = f"""# IB Agreement Resources Index

> **Generated**: {datetime.now(timezone.utc).strftime("%Y-%m-%d")}
> **Source**: `Context/IB agreement/`

## Available Agreements

"""
    for out in outputs:
        name = out.stem.replace("-", " ").title()
        index_md += f"- [{name}](./{out.name})\n"
    
    index_md += f"""
## Usage

These documents are automatically scraped from the IB agreement PDFs using
[scrape_ib_pdfs.py](../execution/scrape_ib_pdfs.py).

To re-scrape after PDF updates:
```bash
python .agents/skills/partnership-strategy/execution/scrape_ib_pdfs.py
```

The Business Strategist Agent references these when:
- Evaluating broker partnership terms
- Comparing commission structures across partners
- Preparing for IB agreement renewals or renegotiations
- Assessing compliance obligations
"""
    index_path.write_text(index_md, encoding="utf-8")
    print(f"Index written: {index_path.relative_to(SKILL_DIR)}")
    
    print(f"\n=== Complete. {len(outputs)} agreement(s) scraped. ===")
    
    return {
        "status": "success",
        "files_scraped": len(outputs),
        "outputs": [str(o) for o in outputs],
        "index": str(index_path),
    }


if __name__ == "__main__":
    result = main()
