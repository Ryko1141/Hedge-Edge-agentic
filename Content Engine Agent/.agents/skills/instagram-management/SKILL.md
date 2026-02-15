---
name: instagram-management
description: |
  Manages the Hedge Edge Instagram presence. Handles reels, carousels, stories,
  single-image posts, hashtag strategy, engagement tracking, and visual branding.
  Use when creating visual content, publishing posts, managing engagement, or
  building brand awareness for prop firm traders on Instagram.
---

# Instagram Management

## Objective

Build the Hedge Edge Instagram into a visually compelling, high-engagement brand presence that attracts prop firm traders through educational reels, data-driven carousels, and community-driven stories. Convert followers into Discord members, landing page visitors, and ultimately paying subscribers.

## When to Use This Skill

- When creating or publishing a reel, carousel, story, or single-image post
- When designing visual content templates for Hedge Edge's Instagram brand identity
- When developing hashtag strategies for prop firm and trading niches
- When analyzing Instagram engagement metrics (reach, impressions, saves, shares)
- When planning Instagram-specific content calendars
- When creating story sequences for product walkthroughs or user testimonials
- When managing DMs and comment engagement on posts
- When running A/B tests on post formats, captions, or hashtag sets
- When repurposing YouTube content into Instagram-native formats

## Input Specification

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| action | string | Yes | `publish-reel`, `publish-carousel`, `publish-story`, `publish-post`, `get-analytics`, `hashtag-research`, `engagement-management`, `design-template` |
| media_paths | list[string] | No | Paths to images or video files (required for publishing actions) |
| caption | string | No | Post caption text (for publishing actions) |
| hashtags | list[string] | No | Hashtags to append to caption |
| story_elements | object | No | Story configuration: stickers, polls, links, music |
| date_range | string | No | Analytics date range: `last_7_days`, `last_30_days` |
| template_type | string | No | `reel-cover`, `carousel-slide`, `story-frame`, `single-post` |

## Step-by-Step Process

### Phase 1: Content Format Strategy

Define the content mix optimized for Instagram's algorithm and the prop firm audience:

1. **Reels (50% of posts)**  Primary growth driver:
   - 15-30 second trading concept explainers (e.g., "What happens when you hedge a $200K FTMO account")
   - Sped-up MT5 EA setup walkthroughs with text overlays
   - Before/after equity curve animations showing hedge impact
   - "Day in the life of a hedged prop firm trader" POV content
   - Trending audio + prop firm caption hooks

2. **Carousels (30% of posts)**  Save-driven engagement:
   - "5 Rules Every Hedged Trader Follows" educational breakdowns
   - Step-by-step MT5 EA installation guides (screenshot per slide)
   - Prop firm comparison charts (FTMO vs The5%ers vs TopStep  fees, rules, payout splits)
   - Weekly market recaps with hedging angle
   - "Myth vs Reality" prop firm misconceptions series

3. **Stories (daily)**  Community and real-time engagement:
   - Polls: "Which prop firm are you trading with?" / "How many accounts are you managing?"
   - Q&A stickers: Answer hedging questions from DMs
   - Behind-the-scenes: Hedge Edge development updates, feature previews
   - User win reposts: Share screenshots from Discord (with permission)
   - Swipe-up/link stickers to landing page, Discord, and YouTube videos

4. **Single-Image Posts (20% of posts)**  Brand and authority:
   - Branded quote graphics ("Your challenge fee is not the cost  losing the funded account is")
   - Product screenshots with feature callouts
   - Partnership announcements (Vantage, BlackBull)
   - Milestone celebrations (user count, feature launches)

### Phase 2: Visual Brand Identity

1. **Color palette**: Consistent with Hedge Edge brand  primary colors from landing page, dark background for trading aesthetic
2. **Typography**: Bold, clean sans-serif for headlines; monospace for data/code elements
3. **Template system via Canva API**:
   - Reel cover template (title + Hedge Edge logo)
   - Carousel template (numbered slides with consistent header bar)
   - Story frame template (branded border with @hedgeedge handle)
   - Quote post template (gradient background with centered text)
4. **Visual motifs**: Chart patterns, equity curves, terminal screenshots, green/red P&L indicators

### Phase 3: Publishing Workflow

1. **Pre-publish checklist**:
   - Image dimensions correct: 1080x1080 (square), 1080x1350 (portrait), 1080x1920 (story/reel)
   - Caption includes: hook line, value content, CTA, line breaks for readability
   - Alt text added for accessibility
   - Hashtags researched and current (see Phase 4)
   - Location tag set if relevant
   - Tagged accounts (broker partners, featured users) confirmed

2. **Publish via Instagram Graph API**:
   - Authenticate with `INSTAGRAM_ACCESS_TOKEN`
   - Upload media container(s)
   - Attach caption with hashtags (first comment strategy for cleaner caption)
   - Set publish time or immediately publish
   - For carousels: upload all slides as children, then publish parent container

3. **Post-publish actions**:
   - Share post to Instagram Story with engagement sticker
   - Monitor first-hour engagement (likes, comments, saves, shares)
   - Respond to all comments within 2 hours of posting
   - Cross-reference in Notion content calendar as published

### Phase 4: Hashtag Strategy

1. **Research hashtag tiers**:
   - **Mega (1M+ posts)**: #trading, #forex, #daytrading  use 2-3 for reach
   - **Large (100K-1M)**: #propfirm, #fundedtrader, #forextrading  use 3-5 for discovery
   - **Medium (10K-100K)**: #propfirmchallenge, #ftmochallenge, #tradingtools  use 5-7 for targeted reach
   - **Niche (<10K)**: #hedgetrading, #propfirmhedging, #tradinghedge, #hedgeedge  use 5-8 for category ownership

2. **Hashtag sets** (rotate to avoid shadowban):
   - Set A: Education focus  #tradingeducation #propfirmtips #forexstrategy #tradingmentor
   - Set B: Product focus  #tradingsoftware #tradingtools #propfirmtools #automatedtrading
   - Set C: Community focus  #tradingcommunity #fundedtraders #propfirmlife #traderlifestyle
   - Set D: Platform focus  #mt5 #metatrader #ctrader #forexea

3. **Avoid**: Banned or spammy hashtags, more than 30 hashtags per post, identical hashtag sets on consecutive posts

### Phase 5: Analytics & Optimization

1. **Pull metrics via Instagram Graph API**:
   - Reach, impressions, engagement rate (likes + comments + saves + shares / reach)
   - Follower growth rate (weekly, monthly)
   - Top-performing posts by saves (saves = algorithmic signal for carousels)
   - Top-performing reels by shares and reach
   - Story completion rate and tap-forward/back ratio
   - Profile visits and link clicks (bio link, story links)

2. **Performance benchmarks**:
   - Reels: >5% engagement rate, >500 reach per 1K followers
   - Carousels: >3% save rate, >200 reach per 1K followers
   - Stories: >70% completion rate, >5% sticker interaction rate
   - Overall: >4% engagement rate on the account

3. **Optimization loops**:
   - Double down on post types with highest save rates
   - Adjust posting times based on follower active hours
   - Refresh underperforming hashtag sets
   - Test caption length (short hook vs. long educational)

## Output Specification

- **Publish**: Returns post ID, permalink, media type confirmation, and engagement baseline
- **Analytics**: Returns structured performance report with metrics, benchmarks, trends, and top/bottom performers
- **Hashtag Research**: Returns tiered hashtag sets with post volume, engagement estimates, and rotation schedule
- **Design Template**: Returns Canva design URL and preview image for review
- **Engagement Management**: Returns summary of comments replied, DMs addressed, and content ideas extracted

## API & Platform Requirements

| Platform | API/Tool | Env Variable | Purpose |
|----------|----------|--------------|---------|
| Instagram | Instagram Graph API | `INSTAGRAM_ACCESS_TOKEN` | Post publishing, story management, analytics, comment management |
| Canva | Canva API | `CANVA_API_KEY` | Template creation, graphic design, brand consistency |
| OpenAI | OpenAI API | `OPENAI_API_KEY` | Caption writing, hashtag expansion, content ideation |
| Notion | Notion API | `NOTION_API_KEY` | Content calendar sync, editorial tracking |

## Quality Checks

- Every post includes a CTA (bio link, Discord mention, or direct landing page reference)
- Hashtags are rotated across 4+ sets and never exceed 30 per post
- Reels have captions/text overlays (80%+ of Instagram users watch with sound off)
- Carousel slides are numbered and follow a logical educational progression
- Visual brand consistency is maintained across all post types (colors, fonts, logo placement)
- Stories are posted daily with at least one interactive element (poll, Q&A, quiz)
- No post published without prior caption review for spelling, tone, and compliance with trading content guidelines
- All user-generated content reshared with explicit permission documented
- Analytics reviewed weekly; underperforming content types flagged for adjustment
