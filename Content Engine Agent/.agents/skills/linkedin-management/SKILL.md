---
name: linkedin-management
description: |
  Manages the Hedge Edge LinkedIn presence. Handles article publishing, post
  creation, professional thought leadership, B2B engagement, partnership
  announcements, and industry analysis content. Use when building professional
  credibility, engaging with fintech/prop firm industry stakeholders, or
  distributing long-form business insights.
---

# LinkedIn Management

## Objective

Position Hedge Edge's founder and brand as the definitive voice in prop firm hedging technology on LinkedIn. Build professional credibility with broker partners, prop firm operators, fintech investors, and sophisticated traders through thought leadership, industry analysis, and transparent company building narratives.

## When to Use This Skill

- When publishing a LinkedIn article or post on behalf of Hedge Edge or its founder
- When crafting thought leadership content about the prop firm industry, hedging technology, or fintech SaaS
- When announcing partnerships (broker IB agreements), product milestones, or fundraising updates
- When engaging with LinkedIn connections (commenting, responding, sharing relevant content)
- When analyzing LinkedIn post performance and optimizing content strategy
- When building a content series (e.g., "Building a Fintech in Public" weekly updates)
- When repurposing YouTube or blog content into LinkedIn-native articles
- When targeting B2B audiences: broker business development, prop firm partnerships, affiliate recruiters

## Input Specification

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| action | string | Yes | `publish-post`, `publish-article`, `get-analytics`, `engagement-management`, `content-series`, `repurpose` |
| post_text | string | No | Text content for LinkedIn post (required for `publish-post`) |
| article_title | string | No | Title for LinkedIn article (required for `publish-article`) |
| article_body | string | No | Full article body in HTML (required for `publish-article`) |
| media_paths | list[string] | No | Images or documents to attach to a post |
| source_content | string | No | Original content to repurpose for LinkedIn (for `repurpose`) |
| source_platform | string | No | Origin platform of content to repurpose: `youtube`, `blog`, `discord` |
| date_range | string | No | Analytics date range: `last_7_days`, `last_30_days`, `last_90_days` |
| series_name | string | No | Name of content series (for `content-series`) |

## Step-by-Step Process

### Phase 1: Content Strategy for LinkedIn

LinkedIn content for Hedge Edge serves three distinct audiences:

1. **Traders (B2C)**  Sophisticated prop firm traders who use LinkedIn for professional networking:
   - Educational content: "Why 85% of prop firm traders fail  and how hedging changes the math"
   - Personal trading journey stories with data-driven insights
   - Product walkthroughs showing Hedge Edge in action

2. **Broker Partners (B2B)**  Business development contacts at Vantage, BlackBull, and prospective broker partners:
   - Volume metrics: "Our users generated X lots last month across Y broker accounts"
   - Partnership value propositions: how Hedge Edge drives sticky, high-volume traders to brokers
   - Industry analysis: prop firm growth trends and their impact on retail brokerage

3. **Industry & Investors (B2B)**  Fintech observers, potential investors, prop firm operators:
   - "Building in public" updates: MRR milestones, user growth, technical decisions
   - Market analysis: the prop firm economy, regulatory landscape, competitive dynamics
   - Fintech SaaS insights: lessons learned on acquisition, retention, pricing

Content mix: 40% educational/thought leadership, 30% building-in-public, 20% partnership/product, 10% engagement/reshares.

### Phase 2: Post Creation

1. **Post structure** (optimized for LinkedIn algorithm):
   - **Hook** (first 2 lines, visible before "see more"): Bold claim, surprising stat, or contrarian take
     - Example: "Prop firm traders lose $2.3 billion in challenge fees annually. Most of it is preventable."
   - **Body** (3-8 short paragraphs):
     - Use single-line paragraphs for readability
     - Include data points, personal experience, or specific examples
     - Reference Hedge Edge naturally (not salesy  show, don't tell)
   - **CTA** (final line):
     - Soft CTA: "What's your experience with hedging? Drop a comment."
     - Medium CTA: "I wrote a full breakdown  link in comments"
     - Hard CTA: "Try Hedge Edge free  [link in comments]"
   - **Hashtags** (3-5 max): #propfirm #hedging #fintech #tradingtools #SaaS

2. **Post types**:
   - **Text-only**: Personal stories, hot takes, industry commentary (highest organic reach)
   - **Image + text**: Product screenshots, data visualizations, infographics
   - **Carousel (PDF)**: Step-by-step guides, comparison frameworks, educational decks
   - **Video**: Short clips (<90 sec) from YouTube content, product demos
   - **Poll**: "Which prop firm has the best payout model?" (drives engagement metrics)

3. **Posting cadence**: 4-5 posts per week, Mon-Fri, between 7-9am or 12-1pm in target timezones (EST/GMT)

### Phase 3: Article Publishing

1. **Article use cases**:
   - Deep-dive industry analysis: "The Economics of Prop Firm Hedging  A Complete Breakdown"
   - Product philosophy: "Why We Built Hedge Edge as a Desktop App (Not a Cloud Service)"
   - Educational long-form: "The Complete Guide to Multi-Account Hedge Management for Prop Traders"
   - Partnership announcements: "Hedge Edge Partners with Vantage: What This Means for Traders"

2. **Article structure**:
   - Title: SEO-optimized, keyword-rich, under 100 characters
   - Header image: Branded, consistent with Hedge Edge visual identity
   - Body: 800-2000 words, subheadings every 200-300 words, embedded images/screenshots
   - Internal links: Reference previous articles, YouTube videos, landing page
   - CTA section at end: Clear next step (download app, join Discord, follow for more)

3. **Publishing via LinkedIn API**:
   - Authenticate with `LINKEDIN_ACCESS_TOKEN`
   - Create article as UGC post with articleContent type
   - Set visibility to `PUBLIC`
   - Add relevant hashtags and mentions

### Phase 4: Engagement Management

1. **Proactive engagement** (30 min/day):
   - Comment thoughtfully on posts from prop firm operators, broker partners, and trading influencers
   - Share relevant industry news with Hedge Edge's perspective added
   - Respond to every comment on Hedge Edge posts within 4 hours
   - Connect with new followers who match target audience profile

2. **Comment strategy on own posts**:
   - First comment: Add the link (keeps it out of the post text, avoids algorithm penalty)
   - Respond to every genuine comment with a substantive reply (not just "thanks!")
   - Ask follow-up questions to drive thread depth (LinkedIn rewards comment threads)

3. **DM management**:
   - Respond to partnership inquiries within 24 hours
   - Route product questions to appropriate support channel (Discord)
   - Flag investor or media inquiries for founder review

### Phase 5: Analytics & Optimization

1. **Pull metrics via LinkedIn API**:
   - Impressions, clicks, engagement rate, follower growth
   - Post-level performance: reactions, comments, shares, click-through rate
   - Article views, read time, reader demographics
   - Follower demographics: job titles, industries, locations
   - Profile views trend

2. **Performance benchmarks**:
   - Posts: >3% engagement rate, >1000 impressions per post
   - Articles: >500 views, >3 min average read time
   - Follower growth: >5% month-over-month
   - Profile views: trending upward week-over-week

3. **Optimization loops**:
   - Identify top-performing post formats and double down
   - Test hook styles: question, stat, bold claim, story opener
   - Adjust posting time based on analytics
   - Track which topics drive follower growth vs. engagement vs. link clicks

## Output Specification

- **Publish Post**: Returns post URN, permalink, and initial visibility metrics
- **Publish Article**: Returns article URL, publishing confirmation, and distribution status
- **Analytics**: Returns structured performance report with per-post metrics, trends, audience insights, and recommendations
- **Engagement**: Returns summary of comments made, DMs addressed, connections sent, and opportunities flagged
- **Content Series**: Returns series plan with titles, hooks, scheduled dates, and theme progression
- **Repurpose**: Returns LinkedIn-adapted content draft with platform-specific formatting and CTA

## API & Platform Requirements

| Platform | API/Tool | Env Variable | Purpose |
|----------|----------|--------------|---------|
| LinkedIn | LinkedIn API (v2) | `LINKEDIN_ACCESS_TOKEN` | Post/article publishing, analytics, engagement |
| Canva | Canva API | `CANVA_API_KEY` | Carousel PDFs, post images, article headers |
| OpenAI | OpenAI API | `OPENAI_API_KEY` | Content drafting, hook generation, repurposing |
| Notion | Notion API | `NOTION_API_KEY` | Content calendar sync, idea tracking |

## Quality Checks

- Every post has a hook in the first 2 lines that creates curiosity or delivers immediate value
- Links are placed in the first comment, not in the post body (algorithm optimization)
- Hashtags are limited to 3-5 relevant tags; no spammy or generic tags
- Articles include at least 2 internal references (other content, landing page, Discord)
- Professional tone maintained  no hype language, no guaranteed-profit claims
- All posts reviewed for compliance with financial content guidelines (no specific profit promises, "not financial advice" where appropriate)
- Building-in-public posts include real metrics, not vanity numbers
- Partnership announcements cleared with partner before publishing
- Engagement responses are substantive and advance the conversation, not generic
- Analytics reviewed bi-weekly with content strategy adjustments documented
