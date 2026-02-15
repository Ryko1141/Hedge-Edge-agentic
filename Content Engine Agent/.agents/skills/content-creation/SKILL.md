---
name: content-creation
description: |
  Handles content ideation, scripting, copywriting, and educational material
  creation for all Hedge Edge platforms. Generates video scripts, social media
  captions, blog outlines, educational guides, and marketing copy tailored to
  prop firm traders. Use when generating any written content for the Content Engine.
---

# Content Creation

## Objective

Produce a continuous stream of high-quality, educational, and conversion-optimized content that positions Hedge Edge as the authority on prop firm hedging. Every piece of content must teach something valuable, speak directly to prop firm trader pain points, and move the audience one step closer to using Hedge Edge.

## When to Use This Skill

- When generating video script ideas or full scripts for YouTube
- When writing social media captions for Instagram, LinkedIn, or any platform
- When creating educational guides or how-to documentation
- When developing a content series or thematic content campaign
- When writing email sequences, landing page copy, or Discord announcements
- When brainstorming content ideas based on trending topics, user questions, or competitor gaps
- When repurposing existing content into new formats (video  carousel, article  thread)
- When creating lead magnets (free hedge guide, cheat sheets, templates)
- When writing ad copy for paid promotions

## Input Specification

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| action | string | Yes | `ideate`, `script`, `caption`, `article`, `guide`, `email`, `ad-copy`, `repurpose`, `lead-magnet` |
| topic | string | No | Subject matter or theme (e.g., "FTMO hedging strategy", "MT5 EA setup") |
| platform | string | No | Target platform: `youtube`, `instagram`, `linkedin`, `email`, `landing-page`, `discord` |
| format | string | No | Output format: `long-form-video`, `short-form-video`, `carousel`, `thread`, `article`, `guide` |
| tone | string | No | Content tone: `educational`, `conversational`, `authoritative`, `urgent`. Default: `educational` |
| word_count | integer | No | Target word/duration count (words for text, seconds for video) |
| source_content | string | No | Existing content to repurpose or expand upon |
| audience_segment | string | No | `beginner-trader`, `experienced-hedger`, `broker-partner`, `general` |
| cta_type | string | No | `soft` (engage), `medium` (click), `hard` (sign up). Default: `medium` |

## Step-by-Step Process

### Phase 1: Content Ideation Engine

Generate content ideas from five sources:

1. **Pain-point mining**:
   - "I lost my FTMO challenge because of one bad trade"  Video: "How One Hedge Could Have Saved This $100K FTMO Challenge"
   - "Managing 5 prop accounts manually is impossible"  Carousel: "5 Accounts, 1 App: How Hedge Edge Automates Multi-Account Hedging"
   - "I passed the challenge but lost money on the funded phase"  Article: "Why Passing the Challenge is Only Half the Battle"
   - "What happens if my hedge account loses?"  Explainer: "The Math Behind Capital Preservation with Hedging"

2. **Keyword-driven topics**:
   - YouTube search: "how to hedge prop firm", "FTMO hedging strategy", "prop firm drawdown protection"
   - Google trends: rising queries around prop firm challenges, hedging, automated trading
   - Reddit/forum mining: r/Forex, r/proptrading, Forex Factory threads on hedging

3. **Discord community signals**:
   - Frequently asked questions become tutorial content
   - User success stories become case study content
   - Feature requests become "coming soon" teaser content
   - Bug reports and troubleshooting become help content

4. **Competitor content gaps**:
   - What topics are competitors covering poorly or not at all?
   - What questions do commenters ask on competitor videos that go unanswered?
   - Where is the misinformation that Hedge Edge can correct?

5. **Seasonal and event-driven**:
   - Prop firm promotional periods (FTMO sales, new challenges launched)
   - Broker promotions or new instrument launches
   - Trading events (NFP, FOMC  "How to hedge before high-impact news")
   - Hedge Edge milestones (user count, feature launches, platform expansions)

### Phase 2: Video Scripting

Structure every video script using the **HBES framework** (Hook, Bridge, Educate, Sell):

1. **Hook (0-15 seconds)**:
   - Open with the strongest claim, question, or visual
   - Examples:
     - "What if I told you that you could profit from your prop firm challenge even if you fail?"
     - "This one setting in Hedge Edge saved a trader $4,200 last week."
     - "85% of prop firm traders fail. Here's the strategy the other 15% are using."

2. **Bridge (15-45 seconds)**:
   - Establish credibility and context
   - "I've been building Hedge Edge for the last year  a tool that automatically hedges your prop firm positions. Today I'll show you exactly how it works."

3. **Educate (main body  60-80% of video)**:
   - Deliver on the hook's promise with structured teaching
   - Use screen recordings of MT5/Hedge Edge for demonstrations
   - Include concrete examples with real numbers:
     - "Let's say you have a $100K FTMO challenge with a 10% max drawdown  that's $10,000..."
     - "You open a 1-lot EURUSD long on your FTMO account. Hedge Edge instantly opens a 1-lot EURUSD short on your Vantage account..."
   - Visual aids: equity curve overlays, trade journal screenshots, diagram animations

4. **Sell (final 15-30 seconds)**:
   - Soft CTA: "If you found this helpful, subscribe and join our Discord community."
   - Medium CTA: "Download Hedge Edge free from the link in the description."
   - Hard CTA: "Start your 14-day free trial  link below."

Script length guide:
- YouTube Short: 100-200 words (30-60 seconds)
- Standard video: 1500-2500 words (8-15 minutes)
- Deep dive: 3000-5000 words (20-30 minutes)

### Phase 3: Social Media Copywriting

**Instagram captions**:
- Hook line (first sentence visible in feed)  question, stat, or bold claim
- 2-4 short paragraphs of value
- CTA: "Save this for later " or "Link in bio to try Hedge Edge free"
- Hashtags in first comment or at end (see instagram-management skill)
- Emoji usage: moderate, purposeful (  ), not excessive

**LinkedIn posts**:
- Professional but not corporate  the founder's authentic voice
- Data-driven claims with sources where possible
- Story arc: problem  insight  solution  invitation to discuss
- No hashtag spam  3-5 relevant tags max

**Discord announcements**:
- Direct, community-first tone
- Lead with what's new or what they can do
- Tag relevant roles (@Starter, @Pro, @Hedger)
- Include screenshots or GIFs for visual impact

### Phase 4: Educational Guide Creation

Create comprehensive guides for lead generation and user education:

1. **Free Hedge Guide** (primary lead magnet):
   - Title: "The Complete Guide to Prop Firm Hedging"
   - Chapters: What is hedging  Why hedge prop accounts  The math  Manual vs. automated  Getting started with Hedge Edge
   - Format: PDF (designed in Canva), 15-25 pages, visual-heavy
   - CTA: "Download Hedge Edge to automate everything in this guide"

2. **Platform Setup Guides**:
   - "MT5 EA Installation: Zero to Hedging in 10 Minutes"
   - "Setting Up Your Vantage IB Account for Hedge Edge"
   - "BlackBull Hedge Account Configuration Guide"
   - "Connecting Multiple Prop Firm Accounts to Hedge Edge"

3. **Strategy Guides**:
   - "Hedging a $100K FTMO Challenge: Step-by-Step"
   - "Capital Preservation Math: How Hedging Protects Your Challenge Fee"
   - "Multi-Account Hedge Management: Running 5 Prop Challenges Simultaneously"
   - "When NOT to Hedge: Scenarios Where Full Exposure is Better"

### Phase 5: Content Repurposing Chain

Every long-form piece generates derivative content:

**YouTube video (source)**:
 YouTube Short (best 30-60 sec clip)
 Instagram Reel (vertical reformat with captions)
 Instagram Carousel (key takeaways as slides)
 LinkedIn Post (text summary with personal angle)
 Discord Announcement (new content alert with embed)
 Email Newsletter Segment (key insight with link to video)
 Blog Post (transcript + screenshots, SEO optimized)

Repurposing rules:
- Never copy-paste across platforms  adapt format, tone, and length
- Each derivative should standalone as valuable content even without the original
- Space derivative posts 2-3 days apart to maximize content lifespan
- Track which derivative format performs best per platform

## Output Specification

- **Ideate**: Returns 10-20 content ideas ranked by estimated impact, with titles, formats, platforms, and brief descriptions
- **Script**: Returns full video script with timestamps, visual cues, and CTA variations
- **Caption**: Returns platform-specific caption with hook, body, CTA, and hashtag suggestions
- **Article**: Returns full article with title, meta description, headers, body, and CTA section
- **Guide**: Returns guide outline with chapter structure, key points per chapter, and visual asset requirements
- **Email**: Returns email sequence with subject lines, preview text, body, and CTA buttons
- **Ad Copy**: Returns ad variations (3-5) with headlines, body text, and CTA for specified platform
- **Repurpose**: Returns adapted content for target platform with format-specific adjustments
- **Lead Magnet**: Returns complete lead magnet content with design specifications

## API & Platform Requirements

| Platform | API/Tool | Env Variable | Purpose |
|----------|----------|--------------|---------|
| OpenAI | OpenAI API | `OPENAI_API_KEY` | Content drafting, ideation, scriptwriting, caption generation |
| Notion | Notion API | `NOTION_API_KEY` | Content idea backlog, editorial calendar, guide drafts |
| Canva | Canva API | `CANVA_API_KEY` | Guide design, carousel design, visual asset creation |
| YouTube | YouTube Data API v3 | `YOUTUBE_API_KEY` | Keyword research, competitor video analysis |

## Quality Checks

- Every piece of content includes at least one concrete, Hedge Edge-specific example (not generic trading advice)
- Video scripts follow the HBES framework (Hook, Bridge, Educate, Sell) with timestamps
- Captions for each platform follow platform-specific formatting (line breaks, emoji density, hashtag placement)
- Educational content is accurate  hedging math, prop firm rules, and platform behavior must be factual
- No guaranteed-profit claims, no "get rich quick" framing, no misleading success rates
- CTAs are clear and match the content's funnel position (awareness  soft CTA, consideration  medium, decision  hard)
- Repurposed content is genuinely adapted, not just reformatted  each platform version adds unique value
- Content ideas are tracked in Notion with status (ideated  drafted  reviewed  published)
- All content aligns with Hedge Edge brand voice: knowledgeable, direct, trader-to-trader, never salesy or hype-driven
- Lead magnets include proper disclaimers and avoid financial advice language where required
