---
name: youtube-management
description: |
  Manages the Hedge Edge YouTube channel end-to-end. Handles video uploads,
  metadata optimization (titles, descriptions, tags), analytics retrieval,
  comment moderation, community tab posts, shorts strategy, and channel SEO.
  Use when publishing videos, analyzing performance, or optimizing discoverability
  for prop firm hedging content.
---

# YouTube Management

## Objective

Grow the Hedge Edge YouTube channel into the authoritative source for prop firm hedging education. Maximize watch time, subscriber growth, and click-through rate while driving qualified traffic to the Hedge Edge landing page and Discord community.

## When to Use This Skill

- When uploading a new video or short to the Hedge Edge YouTube channel
- When optimizing metadata (title, description, tags, thumbnail) for an existing video
- When retrieving analytics to evaluate content performance
- When managing comments (responding to questions, moderating spam, identifying content ideas)
- When posting to the Community tab to engage subscribers
- When planning a YouTube Shorts strategy for quick-win engagement
- When conducting keyword research for video SEO in the prop firm/trading niche
- When analyzing retention curves to improve future video structure
- When setting up playlists for onboarding sequences (e.g., "Hedging 101" series)

## Input Specification

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| action | string | Yes | `upload`, `optimize-metadata`, `get-analytics`, `manage-comments`, `community-post`, `keyword-research`, `playlist-management`, `shorts-strategy` |
| video_file_path | string | No | Local path to video file (required for `upload`) |
| video_id | string | No | YouTube video ID (required for `optimize-metadata`, `get-analytics`, `manage-comments`) |
| title | string | No | Video title (for `upload` or `optimize-metadata`) |
| description | string | No | Video description (for `upload` or `optimize-metadata`) |
| tags | list[string] | No | Video tags for SEO (for `upload` or `optimize-metadata`) |
| thumbnail_path | string | No | Path to custom thumbnail image |
| date_range | string | No | Analytics date range, e.g., `last_7_days`, `last_30_days`, `last_90_days` |
| community_post_text | string | No | Text content for Community tab post |
| keyword | string | No | Seed keyword for YouTube keyword research |

## Step-by-Step Process

### Phase 1: Video Upload & Publishing

1. **Pre-upload checklist**:
   - Verify video file exists and is in supported format (MP4, MOV, WebM)
   - Confirm thumbnail is 1280x720px, <2MB, high contrast with readable text
   - Validate title is under 100 characters, front-loaded with primary keyword
   - Ensure description contains: hook (first 2 lines), key timestamps, CTA links (landing page, Discord, broker signup), relevant hashtags

2. **Upload via YouTube Data API v3**:
   - Authenticate with `YOUTUBE_API_KEY`
   - Set privacy status (`private` for review, `public` for publish, `unlisted` for embed-only)
   - Attach metadata: title, description, tags, category (Education or Science & Technology)
   - Upload custom thumbnail
   - Add to relevant playlist (e.g., "MT5 Tutorials", "Hedging Strategies", "Prop Firm Tips")

3. **Post-upload optimization**:
   - Add end screens (subscribe CTA + next video suggestion)
   - Add info cards at key moments (link to related videos or landing page)
   - Pin a comment with CTA: "Download Hedge Edge free  [link] | Join Discord  [link]"
   - Schedule Community tab post announcing the new video

### Phase 2: Metadata Optimization

1. **Title optimization**:
   - Primary keyword within first 5 words (e.g., "How to Hedge a $100K FTMO Challenge")
   - Include emotional hook or number (e.g., "3 Mistakes That Blow Prop Firm Challenges")
   - A/B test titles using YouTube's built-in test feature when available

2. **Description optimization**:
   - First 2 lines are the hook (visible before "Show More")  include primary keyword and CTA
   - Full description structure:
     `
     [Hook + keyword-rich summary]

      Links:
     Download Hedge Edge  [landing page URL]
     Join Discord  [Discord invite URL]
     Open Vantage Account  [IB link]
     Open BlackBull Account  [IB link]

      Timestamps:
     0:00 - Introduction
     [...]

     #propfirm #hedging #FTMO #tradingtools #hedgeedge
     `

3. **Tag strategy**:
   - 15-25 tags per video
   - Mix of broad ("prop firm trading", "forex hedging") and long-tail ("how to hedge FTMO challenge MT5", "prop firm drawdown protection tool")
   - Include competitor names as tags where relevant ("FTMO", "The5ers", "TopStep")
   - Include platform tags ("MT5", "MetaTrader 5", "cTrader")

### Phase 3: Analytics Retrieval & Analysis

1. **Pull key metrics via YouTube Data API v3**:
   - Views, watch time (hours), average view duration, CTR (click-through rate)
   - Subscriber delta (gained vs. lost)
   - Traffic sources (search, suggested, browse, external)
   - Audience retention curve (identify drop-off points)
   - Top-performing videos by watch time in period
   - Revenue (if monetized)

2. **Retention curve analysis**:
   - Flag videos with >40% drop-off in first 30 seconds (hook problem)
   - Flag videos with <50% retention at midpoint (pacing problem)
   - Identify "re-watch peaks"  topics that resonate strongly
   - Compare retention curves across video types (tutorial vs. walkthrough vs. commentary)

3. **Content performance classification**:
   - **Winner** (top 20% by watch time)  Create follow-up content, repurpose to shorts
   - **Average** (middle 60%)  Optimize metadata, re-thumbnail
   - **Underperformer** (bottom 20%)  Analyze why, avoid similar format/topic

### Phase 4: Comment Management

1. **Respond to questions**  especially about Hedge Edge setup, MT5 EA configuration, or broker selection
2. **Identify content ideas**  recurring questions become future video topics
3. **Moderate spam**  remove bot comments, scam links, and competitor self-promotion
4. **Heart genuine engagement**  reward users who share results or tag @HedgeEdge
5. **Pin strategic comments**  pin the CTA comment or a user testimonial

### Phase 5: Shorts Strategy

1. **Source shorts from long-form**:
   - Extract the single most compelling 30-60 second segment from each long-form video
   - Add vertical formatting (9:16), captions, and hook text overlay
2. **Create standalone shorts**:
   - "Did you know?" prop firm facts (e.g., "85% of prop firm traders fail their challenge. Here's why hedging changes that.")
   - Quick MT5 EA setup demos (sped up, captioned)
   - Before/after equity curves showing hedge impact
   - User testimonials or Discord win screenshots (with permission)
3. **Posting cadence**: 3-5 shorts per week, posted at peak engagement times (weekday mornings EST)

## Output Specification

- **Upload**: Returns video ID, URL, processing status, and publishing confirmation
- **Optimize**: Returns updated metadata confirmation and before/after comparison
- **Analytics**: Returns structured performance report with metrics, trends, and recommendations
- **Comments**: Returns moderation summary (replied, deleted, pinned) and extracted content ideas
- **Community Post**: Returns post ID and engagement baseline
- **Keyword Research**: Returns keyword list with search volume estimates, competition scores, and recommended titles

## API & Platform Requirements

| Platform | API/Tool | Env Variable | Purpose |
|----------|----------|--------------|---------|
| YouTube | YouTube Data API v3 | `YOUTUBE_API_KEY` | Upload, metadata, analytics, comments, community posts |
| Canva | Canva API | `CANVA_API_KEY` | Thumbnail generation |
| OpenAI | OpenAI API | `OPENAI_API_KEY` | Title/description generation, keyword expansion |
| FFmpeg | FFmpeg CLI | N/A | Shorts extraction, format conversion |

## Quality Checks

- Every video title contains a primary keyword relevant to prop firm trading or hedging
- Every description includes CTA links to landing page, Discord, and broker IB links
- Thumbnails use consistent Hedge Edge brand colors, high contrast, and readable text at mobile size
- Tags include at least 3 long-tail prop firm keywords and 2 platform keywords (MT5, cTrader)
- Analytics reports include actionable next steps, not just raw numbers
- Shorts are under 60 seconds with hook in the first 2 seconds and captions enabled
- No video published without being added to at least one playlist
- Community tab posts scheduled within 24 hours of every new video upload
