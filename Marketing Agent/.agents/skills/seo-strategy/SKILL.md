---
name: seo-strategy
description: |
  Plan and execute an organic search strategy for Hedge Edge targeting prop-firm traders
  searching for hedging tools, drawdown protection, multi-account management, and funded
  account risk management. Covers keyword research, on-page optimization, technical SEO,
  content briefs for the Content Engine Agent, backlink opportunity identification, and
  ongoing rank tracking via Google Search Console.
---

# SEO Strategy

## Objective

Rank Hedge Edge in the top 3 organic positions for 20+ high-intent prop-firm hedging keywords within 12 months, driving 5,000+ monthly organic visitors with a 4%+ visitor-to-trial conversion rate. Build topical authority around "prop firm hedging" and "funded account risk management" through strategic content production and technical excellence.

## When to Use This Skill

- Monthly SEO review cycle  keyword ranking assessment, content gap analysis, technical audit.
- A new content piece is planned  generate an SEO-optimised brief for Content Engine Agent.
- Search Console shows a ranking drop for a target keyword  diagnose and remediate.
- A new product feature launches  create/update landing page with optimised copy.
- Competitor analysis reveals a content gap or backlink opportunity.
- Quarterly technical SEO audit is due.
- Google algorithm update impacts rankings  assess and respond.

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| task_type | enum | Yes | keyword_research, content_brief, on_page_audit, 	echnical_audit, acklink_analysis, ank_tracking, competitor_analysis |
| target_keywords | string[] | No | Specific keywords to analyse (required for content_brief and on_page_audit) |
| target_url | URL | No | Specific page to audit (required for on_page_audit and 	echnical_audit) |
| competitor_domains | string[] | No | Competitor sites to analyse (default: propfirmhedge.com, hedgebuddy.io, myfxbook.com, ftmo.com/blog) |
| content_type | enum | No | log_post, landing_page, guide, comparison, glossary  for content briefs |
| priority | enum | No | high, medium, low  default: medium |

## Step-by-Step Process

### 1. Keyword Research & Mapping

#### Seed Keyword Clusters

**Cluster 1  Core Product (highest intent)**:
| Keyword | Est. Monthly Volume | Difficulty | Intent |
|---|---|---|---|
| prop firm hedging tool | 320 | Medium | Transactional |
| hedge funded accounts | 210 | Low | Transactional |
| multi account hedge EA | 170 | Low | Transactional |
| drawdown protection software | 140 | Low | Transactional |
| automated hedging MT5 | 110 | Low | Transactional |
| prop firm risk management tool | 260 | Medium | Transactional |
| hedge EA for FTMO | 90 | Low | Transactional |

**Cluster 2  Problem-aware (educational)**:
| Keyword | Est. Monthly Volume | Difficulty | Intent |
|---|---|---|---|
| how to hedge prop firm accounts | 480 | Medium | Informational |
| prop firm challenge drawdown rules | 720 | Medium | Informational |
| why prop firm challenges fail | 590 | Low | Informational |
| how to manage multiple funded accounts | 430 | Medium | Informational |
| prop firm correlated exposure risk | 150 | Low | Informational |
| FTMO drawdown calculator | 1,200 | High | Informational |

**Cluster 3  Comparison/alternative (competitive)**:
| Keyword | Est. Monthly Volume | Difficulty | Intent |
|---|---|---|---|
| best prop firm tools 2026 | 880 | High | Commercial |
| FTMO vs The5ers hedging rules | 340 | Medium | Commercial |
| prop firm hedging allowed | 510 | Medium | Informational |
| copy trading vs hedging for prop firms | 220 | Low | Commercial |

**Cluster 4  Broker/IB (partnership leverage)**:
| Keyword | Est. Monthly Volume | Difficulty | Intent |
|---|---|---|---|
| vantage markets prop firm | 290 | Medium | Commercial |
| blackbull markets funded accounts | 240 | Medium | Commercial |
| best broker for prop firm hedging | 360 | Medium | Commercial |

- Map each keyword cluster to a target page (landing page, blog post, or guide).
- Identify keyword cannibalisation  ensure no two pages target the same primary keyword.

### 2. Content Brief Generation (for Content Engine Agent)

For each target keyword, produce a structured brief:

`
## Content Brief: [Primary Keyword]
- **Target keyword**: [primary] + [3-5 secondary keywords]
- **Search intent**: [informational / transactional / commercial]
- **Content type**: [blog / guide / landing page / comparison]
- **Target word count**: [1,200-2,500 words depending on type]
- **Title tag**: [50-60 chars, keyword-front-loaded]
- **Meta description**: [150-160 chars, includes CTA]
- **H1**: [Matches title tag or close variant]
- **Required H2 sections**: [List of subheadings covering subtopics]
- **Internal links**: [2-3 links to other Hedge Edge pages]
- **External links**: [1-2 authoritative references  prop firm sites, broker docs]
- **CTA placement**: [After intro, mid-content, conclusion  trial signup]
- **Competitor content to beat**: [Top 3 ranking URLs + word count + content gaps]
- **Unique angle**: [What Hedge Edge can say that competitors cannot  first-hand product integration, real user data, prop-firm-specific hedging mechanics]
`

### 3. On-Page Optimization

For each target page, audit and optimise:

- **Title tag**: Primary keyword within first 30 characters. Max 60 chars. Include brand: "| Hedge Edge".
- **Meta description**: Action-oriented, includes primary keyword, ends with CTA. Max 160 chars.
- **URL structure**: Short, keyword-rich, lowercase, hyphens only. E.g., /prop-firm-hedging-tool.
- **H1**: One per page, matches or closely mirrors title tag.
- **Header hierarchy**: Logical H2  H3 nesting. Every H2 targets a secondary keyword or subtopic.
- **Content quality**: Minimum 1,200 words for blog posts, 800 for landing pages. Answer the search intent completely.
- **Internal linking**: Every page links to at least 2 other Hedge Edge pages. Use descriptive anchor text (not "click here").
- **Image optimization**: Alt text includes keywords where natural. WebP format. Compressed < 100KB.
- **Schema markup**:
  - SoftwareApplication schema on product/landing pages.
  - FAQPage schema on guides with Q&A sections.
  - Article schema on blog posts with datePublished and uthor.
  - Organization schema site-wide with London address.
- **CTA integration**: Non-intrusive trial signup CTA after introduction, within content (contextual), and at conclusion.

### 4. Technical SEO Audit (Quarterly)

Check via Google Search Console (SEARCH_CONSOLE_KEY) and Lighthouse:

- **Indexing**: All target pages indexed. No important pages blocked by robots.txt or noindex.
- **Sitemap**: XML sitemap at /sitemap.xml  includes all target pages, excludes utility pages. Submitted to Search Console.
- **Robots.txt**: Allows Googlebot full access to content pages. Blocks admin, API, and auth routes.
- **Canonical tags**: Every page has a self-referencing canonical. No duplicate content issues.
- **Core Web Vitals**:
  - LCP < 2.5s (Vercel edge hosting should achieve < 1.5s).
  - FID < 100ms.
  - CLS < 0.1.
- **Mobile usability**: No mobile usability errors in Search Console. Responsive design passes on all breakpoints.
- **HTTPS**: All pages served over HTTPS. No mixed content.
- **Structured data validation**: Test all schema markup via Google Rich Results Test.
- **404 monitoring**: No broken internal links. Redirect chains limited to 1 hop.
- **Page speed**: Lighthouse Performance  90 on all target pages.

### 5. Backlink Strategy

- **Identify opportunities**:
  - Prop-firm education blogs (FTMO blog, The5%ers blog, trading educator sites).
  - Forex/trading tool directories and comparison sites.
  - Trading community forums (ForexFactory, BabyPips, Reddit r/Forex, r/proptrading).
  - Broker partner content (Vantage/BlackBull blog  leverage IB relationship).
- **Link-worthy assets to create** (brief to Content Engine Agent):
  - "The Complete Guide to Prop Firm Hedging Rules (2026)"  comprehensive, regularly updated.
  - "Prop Firm Challenge Failure Rate Study"  original data from Hedge Edge user base (anonymised).
  - "Multi-Account Drawdown Calculator"  interactive tool on hedge-edge.com.
  - Infographic: "The Anatomy of a Failed Prop Firm Challenge".
- **Outreach**: Coordinate with Business Strategist Agent for partnership-based link opportunities.
- **Avoid**: Paid link schemes, PBNs, low-quality directory submissions, reciprocal link farms.

### 6. Rank Tracking & Reporting (Monthly)

- Pull ranking data from Google Search Console:
  - Impressions, clicks, CTR, average position for all target keywords.
  - Page-level performance  which pages are gaining/losing.
- Track month-over-month trends for top 30 target keywords.
- Identify keywords in positions 4-10 (striking distance)  prioritise for quick-win optimization.
- Flag any keyword drops > 5 positions  investigate (algorithm update, content decay, competitor gain).
- Report format:

| Keyword | Current Rank | Prev Rank | Change | Impressions | Clicks | CTR | Target Page |
|---|---|---|---|---|---|---|---|
| prop firm hedging tool | 5 | 8 | +3 | 1,200 | 84 | 7.0% | /prop-firm-hedging-tool |

- Calculate organic traffic contribution to overall trial signups (GA4 attribution).
- Log report in Notion SEO dashboard via NOTION_API_KEY.

### 7. Competitor Monitoring

- Monthly check of competitor ranking movements for shared keywords.
- Identify new content published by competitors  assess whether Hedge Edge needs to respond.
- Monitor competitor backlink profiles for new link opportunities.
- Track competitor domain authority trends.

## Output Specification

| Output | Format | Destination |
|---|---|---|
| Keyword research | JSON [{ keyword, volume, difficulty, intent, target_page, current_rank }] | Notion SEO dashboard |
| Content brief | Markdown document | Content Engine Agent |
| On-page audit | JSON { url, title_tag, meta_desc, h1, word_count, schema, issues[], recommendations[] } | Notion + Vercel deployment (fixes) |
| Technical audit | JSON { indexing_status, sitemap_ok, cwv_scores, mobile_ok, https_ok, issues[] } | Notion + Vercel (fixes) |
| Rank tracking report | JSON [{ keyword, rank, prev_rank, change, impressions, clicks, ctr }] | Notion + Google Sheets |
| Backlink opportunities | JSON [{ domain, da, relevance, contact, approach }] | Business Strategist Agent |

## API & Platform Requirements

| Platform | Variable | Operations Used |
|---|---|---|
| Google Search Console | SEARCH_CONSOLE_KEY | Keyword rankings, impressions, clicks, CTR, Core Web Vitals, indexing status |
| GA4 | GA4_MEASUREMENT_ID | Organic traffic analysis, conversion attribution, landing page behaviour |
| Vercel | VERCEL_TOKEN | Deploy on-page fixes, update meta tags, add schema markup |
| Notion | NOTION_API_KEY | SEO dashboard, content briefs, audit logs, rank tracking reports |
| Supabase | SUPABASE_URL, SUPABASE_KEY | Organic-originated trial events for conversion attribution |
| n8n | N8N_WEBHOOK_URL | Automate monthly rank tracking pulls, alert on ranking drops |

## Quality Checks

- [ ] Every target page has unique title tag, meta description, and H1 (no duplication)
- [ ] No keyword cannibalisation  each primary keyword maps to exactly one page
- [ ] All content briefs include competitor analysis and unique angle
- [ ] Technical audit runs quarterly with all issues resolved within 14 days
- [ ] Core Web Vitals in "Good" range for all target pages
- [ ] Sitemap is up-to-date and submitted to Search Console
- [ ] Schema markup validates without errors in Rich Results Test
- [ ] Rank tracking report is produced monthly and logged in Notion
- [ ] Keywords in positions 4-10 are prioritised for quick-win optimization each month
- [ ] No broken internal links (404 check runs weekly via n8n automation)
- [ ] Backlink acquisition uses only white-hat methods
- [ ] Content briefs are delivered to Content Engine Agent within 48h of keyword approval
- [ ] Organic traffic month-over-month growth  10% (ramp phase)
