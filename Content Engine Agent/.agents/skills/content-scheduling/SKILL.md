---
name: content-scheduling
description: |
  Manages cross-platform content calendar, batch scheduling, editorial workflows,
  and publishing coordination via Notion. Ensures consistent posting cadence across
  YouTube, Instagram, and LinkedIn with proper spacing, repurposing chains, and
  campaign alignment. Use when planning, scheduling, or tracking content publishing.
---

# Content Scheduling

## Objective

Maintain a disciplined, data-driven content publishing cadence across all Hedge Edge channels. Ensure no platform goes dark, content is properly spaced for maximum reach, repurposing chains are executed on schedule, and the editorial pipeline always has a 2-week buffer of ready-to-publish content.

## When to Use This Skill

- When building or updating the weekly/monthly content calendar
- When scheduling posts across YouTube, Instagram, and LinkedIn
- When coordinating repurposing chains (long-form  derivative content timeline)
- When managing the editorial pipeline (idea  draft  review  publish)
- When planning content around events, launches, or campaigns
- When auditing publishing consistency and identifying gaps
- When batch-scheduling a week's worth of content in one session
- When syncing content status between Notion calendar and platform publishing queues

## Input Specification

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| action | string | Yes | `build-calendar`, `schedule-post`, `batch-schedule`, `audit-calendar`, `plan-campaign`, `sync-status`, `manage-pipeline` |
| time_range | string | No | Calendar range: `this_week`, `next_week`, `this_month`, `next_month`, `custom` |
| platform | string | No | Filter by platform: `youtube`, `instagram`, `linkedin`, `all`. Default: `all` |
| content_items | list[object] | No | List of content items to schedule, each with: title, platform, format, publish_date, status |
| campaign_name | string | No | Name of campaign or content series to plan (for `plan-campaign`) |
| campaign_dates | object | No | Start and end dates for campaign (for `plan-campaign`) |
| pipeline_stage | string | No | Filter pipeline by stage: `ideated`, `drafted`, `in-review`, `approved`, `scheduled`, `published` |

## Step-by-Step Process

### Phase 1: Content Calendar Architecture

The Hedge Edge content calendar lives in Notion and follows this structure:

**Notion Database Schema**:

| Property | Type | Options | Description |
|----------|------|---------|-------------|
| Title | Title |  | Content piece title |
| Platform | Select | YouTube, Instagram, LinkedIn, Discord, Email | Target platform |
| Format | Select | Long-form Video, Short/Reel, Carousel, Post, Article, Story, Guide | Content format |
| Status | Select | Idea, Scripted, In Production, In Review, Approved, Scheduled, Published | Pipeline stage |
| Publish Date | Date |  | Scheduled publish date and time |
| Author | Person |  | Content creator/owner |
| Campaign | Relation |  | Links to campaign/series if applicable |
| Topic Cluster | Select | Hedging Education, MT5 Tutorials, Prop Firm Tips, Product Updates, Community, Industry Analysis | Content pillar |
| Repurpose Parent | Relation |  | Links to the source content this was derived from |
| Performance Score | Number |  | Post-publish engagement score (filled after analytics) |
| Notes | Rich Text |  | Production notes, links, feedback |

**Calendar Views**:
- **Weekly Board**: Kanban by day of week, filtered to current/next week
- **Monthly Timeline**: Gantt-style view of all scheduled content
- **Pipeline Board**: Kanban by status (Idea  Published)
- **Platform Filter**: Filtered views per platform for platform-specific managers
- **Campaign View**: Grouped by campaign/series

### Phase 2: Publishing Cadence

**Default weekly cadence** (minimum viable consistency):

| Day | YouTube | Instagram | LinkedIn |
|-----|---------|-----------|----------|
| Monday |  | Carousel (educational) | Post (thought leadership) |
| Tuesday | Long-form video | Reel (derived from video) |  |
| Wednesday |  | Story sequence | Post (building in public) |
| Thursday | Short | Carousel or single post | Article (bi-weekly) |
| Friday |  | Reel (standalone) | Post (industry/community) |
| Saturday |  | Story (community engagement) |  |
| Sunday |  |  |  |

**Posting time optimization** (based on prop firm trader activity patterns):
- **YouTube**: Tuesday/Thursday 10:00 AM EST (traders reviewing before market open)
- **Instagram**: Mon/Tue/Thu/Fri 8:00 AM EST (morning scroll), Saturday 11:00 AM (weekend catch-up)
- **LinkedIn**: Mon/Wed/Fri 7:30 AM EST (professional morning routine)

**Cadence rules**:
- Never post more than once per day per platform (except Instagram Stories)
- Space derivative content at least 48 hours after the source piece
- Leave Sunday as a rest day (no scheduled posts)
- Maintain a 2-week buffer: at least 14 days of approved content in the queue at all times
- If buffer drops below 7 days, trigger emergency batch production session

### Phase 3: Repurposing Chain Scheduling

When a long-form YouTube video is published, schedule the full derivative chain:

**Day 0 (Tuesday)**: YouTube long-form video published
**Day 1 (Wednesday)**: Instagram Story announcing new video + link
**Day 2 (Thursday)**: YouTube Short (best clip from video)
**Day 3 (Friday)**: Instagram Reel (vertical reformat of short)
**Day 5 (Sunday)**:  (rest)
**Day 6 (Monday)**: Instagram Carousel (key takeaways as slides)
**Day 7 (Tuesday)**: LinkedIn Post (text summary with personal angle)
**Day 10 (Friday)**: LinkedIn Article (expanded deep-dive, if topic warrants)

Each derivative is created in the Notion database as a separate entry with the `Repurpose Parent` field linked to the source video.

### Phase 4: Campaign Planning

Campaigns are coordinated content pushes around a theme or event:

**Campaign types**:
1. **Product Launch Campaign** (e.g., MT4 support launch):
   - Pre-launch: 3 teaser posts across platforms (1 week before)
   - Launch day: YouTube walkthrough + Instagram Reel + LinkedIn announcement + Discord @everyone
   - Post-launch: Tutorial carousel, user feedback roundup, FAQ video (1 week after)

2. **Educational Series** (e.g., "Hedging 101" 5-part series):
   - Weekly video release for 5 weeks
   - Each video generates full repurposing chain
   - Series playlist on YouTube, highlight on Instagram, article compilation on LinkedIn
   - Discord discussion thread per episode

3. **Partnership Announcement** (e.g., new broker IB deal):
   - LinkedIn article + post (professional credibility)
   - YouTube explainer ("How to set up your [Broker] hedge account")
   - Instagram carousel (step-by-step signup with IB link)
   - Discord announcement with exclusive setup support channel

4. **Seasonal Campaign** (e.g., "New Year, New Challenge" January push):
   - 2-week themed content across all platforms
   - Content aligned to prop firm resolution/signup spike in January
   - Special Discord event (live hedging Q&A)

### Phase 5: Pipeline Management

Track all content through the production pipeline:

**Pipeline stages**:
1. **Idea**  Content is proposed but not yet committed
2. **Scripted**  Script/copy draft is complete
3. **In Production**  Recording, designing, or editing in progress
4. **In Review**  Content is complete and awaiting quality review
5. **Approved**  Reviewed and cleared for publishing
6. **Scheduled**  Set to publish at a specific date/time
7. **Published**  Live on platform

**Pipeline health metrics**:
- Ideas backlog: >30 ideas minimum at all times
- Scripted queue: >10 items ready for production
- Approved buffer: >14 days of scheduled content
- Review bottleneck: No item stays in "In Review" for more than 48 hours

**Notion sync workflow**:
1. Every morning: Update Notion statuses to reflect actual platform publishing status
2. When content is published: Mark as "Published" in Notion, add platform URL
3. After 7 days: Pull analytics and update Performance Score
4. Weekly review: Identify pipeline bottlenecks, reassign or deprioritize stale items

### Phase 6: Calendar Audit

Perform weekly calendar audits to ensure:
1. **No platform gaps**: Every platform has content scheduled for the next 14 days
2. **Topic diversity**: No more than 2 consecutive pieces on the same topic cluster
3. **Format variety**: Mix of formats per platform (not all carousels, not all reels)
4. **CTA distribution**: CTAs spread across soft, medium, and hard  not all hard sells
5. **Repurposing completeness**: Every long-form piece has its derivative chain scheduled
6. **Campaign alignment**: Campaign content is properly spaced and not conflicting with regular content

## Output Specification

- **Build Calendar**: Returns populated Notion calendar with all content items for the specified range
- **Schedule Post**: Returns confirmation with post title, platform, scheduled time, and Notion entry ID
- **Batch Schedule**: Returns summary of all items scheduled with dates, platforms, and pipeline statuses
- **Audit Calendar**: Returns audit report with gaps identified, recommendations, and health score
- **Plan Campaign**: Returns full campaign plan with timeline, content items per platform, and production requirements
- **Sync Status**: Returns sync report showing discrepancies between Notion and platform status
- **Manage Pipeline**: Returns pipeline health dashboard with stage counts, bottlenecks, and buffer status

## API & Platform Requirements

| Platform | API/Tool | Env Variable | Purpose |
|----------|----------|--------------|---------|
| Notion | Notion API | `NOTION_API_KEY` | Content calendar database CRUD, pipeline management, campaign tracking |
| YouTube | YouTube Data API v3 | `YOUTUBE_API_KEY` | Scheduled upload verification, publish status sync |
| Instagram | Instagram Graph API | `INSTAGRAM_ACCESS_TOKEN` | Scheduled post verification, publish status sync |
| LinkedIn | LinkedIn API | `LINKEDIN_ACCESS_TOKEN` | Scheduled post verification, publish status sync |

## Quality Checks

- Content calendar has no gaps longer than 2 consecutive days on any platform (excluding Sunday)
- Every long-form YouTube video has a complete repurposing chain scheduled within 10 days of source publish
- Pipeline buffer is at or above 14 days of approved content at all times
- No two consecutive posts on the same platform cover the same topic cluster
- Campaign content is scheduled at least 7 days before campaign start date
- Notion database statuses are synced with actual platform publishing at least daily
- Posting times align with platform-specific optimization windows (see Phase 2)
- Weekly audit is completed every Monday morning and documented in Notion
- No content is published without passing through at least the "In Review" stage
- Emergency batch production is triggered when buffer drops below 7 days
