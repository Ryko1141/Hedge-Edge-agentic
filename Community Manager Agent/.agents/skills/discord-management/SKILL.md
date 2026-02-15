---
name: discord-management
description: |
  Manages the Hedge Edge Discord server architecture, moderation policies, auto-mod rules, role hierarchy, channel structure, and bot configuration to maintain a healthy, organized, and scalable trading community.
---

# Discord Management

## Objective

Design, maintain, and optimize the Hedge Edge Discord server so it serves as the primary hub for community engagement, user support, product announcements, and converting free-tier users into paid subscribers. The server must feel like a professional yet welcoming trading floor  organized, low-noise, high-signal.

## When to Use This Skill

- Setting up or restructuring Discord server channels, categories, and permissions.
- Configuring or updating auto-moderation rules (spam, scam links, prohibited content).
- Managing role assignments based on user subscription tier (Free/Pro/Elite) or community status (Beta Tester, Challenge Passer, Top Referrer).
- Responding to moderation incidents (rule violations, disputes, ban appeals).
- Optimizing channel engagement based on analytics (dead channels, overcrowded channels, misrouted conversations).
- Onboarding new Discord bots or webhook integrations (n8n triggers, Supabase sync).
- Quarterly server audits to prune stale channels and refresh pinned resources.

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| ction | enum | Yes | create_channel, update_roles, configure_automod, udit_server, moderate_user, update_permissions, deploy_webhook |
| 	arget | string | Yes | Channel name, role name, user ID, or webhook identifier |
| parameters | object | No | Action-specific config (e.g., channel topic, role color, automod trigger words) |
| eason | string | Yes | Why this action is being taken (audit trail) |
| priority | enum | No | low, medium, high, critical  defaults to medium |

## Step-by-Step Process

### 1. Server Architecture (Channel & Category Design)

Maintain this channel structure, adjusting as community scales:

**Category: WELCOME**
- #rules-and-guidelines  Server rules, Hedge Edge terms, code of conduct. Read-only.
- #start-here  Onboarding roadmap: (1) Download app, (2) Join your tier channel, (3) Set up EA, (4) Post your first hedge. Links to free hedge guide.
- #introductions  New members post their trading background, prop firm, and goals. Bot reacts with wave emoji and assigns New Hedger role.
- #role-select  Reaction-role message: pick your prop firm (FTMO, The5%ers, TopStep, Apex), broker (Vantage, BlackBull), and platform (MT5, MT4-soon, cTrader-soon).

**Category: HEDGE EDGE PRODUCT**
- #announcements  Product updates, new features, tier changes. Read-only, webhook-fed from n8n.
- #hedge-setup-help  EA installation, broker linking, configuration troubleshooting. Primary support channel.
- #mt5-ea-discussion  MT5 EA-specific discussion, settings sharing, optimization tips.
- #mt4-ctrader-waitlist  Updates on MT4 and cTrader EA development. Early access sign-ups.
- #feature-requests  Structured feature request format (use thread per request, upvote with thumbs-up).
- #bug-reports  Structured bug report format (template pinned: steps to reproduce, EA version, broker, screenshots).

**Category: TRADING & PROP FIRMS**
- #ftmo-traders  FTMO-specific discussion, challenge strategies with hedge protection.
- #the5ers-traders  The5%ers scaling plan discussion, hedge configuration for their rules.
- #topstep-apex  TopStep and Apex Trader Funding discussion.
- #general-trading  Market analysis, trade ideas, strategy discussion (non-Hedge-Edge-specific).
- #broker-talk  Vantage vs. BlackBull discussion, execution quality, IB referral questions.

**Category: COMMUNITY**
- #wins-and-milestones  Passed a challenge? Hit a profit target? Share it. Bot celebrates with confetti reaction.
- #hedge-lab-events  Event announcements, recordings, follow-up discussion for weekly Hedge Lab calls.
- #memes-and-off-topic  Blow-off-steam channel. Light moderation.
- #referral-program  How to refer friends, track referral status, leaderboard updates.

**Category: SUBSCRIBERS ONLY (Pro/Elite)**
- #pro-lounge  Pro tier (/mo) exclusive discussion, early feature previews.
- #elite-war-room  Elite tier (/mo) exclusive. Direct access to founder, priority support, beta features.
- #vip-announcements  Subscriber-only updates, exclusive webinar invites.

### 2. Role Hierarchy & Permissions

| Role | Color | Permissions | Auto-Assign Trigger |
|---|---|---|---|
| Admin | Red (#FF0000) | Full server admin | Manual only |
| Moderator | Orange (#FF8C00) | Manage messages, mute, kick, channel management | Manual appointment |
| Elite Hedger | Gold (#FFD700) | Access to all subscriber channels, priority support | Supabase sync  Elite tier active |
| Pro Hedger | Blue (#4169E1) | Access to Pro channels | Supabase sync  Pro tier active |
| Beta Tester | Purple (#8B5CF6) | Access to beta channels, bug report permissions | Original 500 beta cohort |
| Challenge Passer | Green (#22C55E) | Special badge, featured in #wins | Self-report verified by mod |
| Top Referrer | Teal (#14B8A6) | Referral leaderboard badge | Supabase referral count >= 5 |
| New Hedger | Gray (#9CA3AF) | Basic read/write in public channels | Auto on join |
| Muted | Dark Gray (#4B5563) | Read-only everywhere | Mod action on rule violation |

### 3. Auto-Moderation Rules

Configure Discord AutoMod + custom bot rules:

- **Spam Filter**: Rate limit  max 5 messages in 10 seconds. Trigger: auto-mute for 10 minutes, log to #mod-log.
- **Scam Link Detection**: Block URLs matching known scam patterns (fake prop firm sites, phishing MT5 download links). Maintain blocklist updated monthly.
- **Prohibited Content**: Block messages containing: account credentials, real money amounts over  (privacy protection), competitor SaaS product promotions (Hedge Pair Pro, Trade Copier Pro  redirect to #general-trading for organic discussion).
- **Slur & Harassment Filter**: Use Discord's built-in keyword filter + custom list. Zero tolerance  auto-delete + DM warning on first offense, 24h mute on second, ban on third.
- **New Account Quarantine**: Accounts < 7 days old get Quarantine role  can only post in #introductions until verified by reacting to rules message.

### 4. Webhook & Bot Deployment

- **n8n Welcome Webhook**: Trigger on GUILD_MEMBER_ADD  send personalized DM with onboarding steps + hedge guide link + tier comparison.
- **Supabase Role Sync**: Every 15 minutes, n8n workflow queries Supabase subscriptions table  updates Discord roles to match current tier (handles upgrades, downgrades, and cancellations).
- **Announcement Webhook**: DISCORD_WEBHOOK_URL posts to #announcements when n8n detects new product release tag in GitHub or manual trigger from admin.
- **Milestone Bot**: Monitors #wins-and-milestones  when a message gets 10+ reactions, auto-cross-posts to #announcements as a community spotlight.

### 5. Quarterly Server Audit

Every 90 days, execute:
1. Pull channel analytics  messages/day, unique posters, thread creation rate.
2. Archive channels with < 5 messages/week for 2 consecutive months.
3. Review role distribution  flag if > 60% of users have only New Hedger role (onboarding failure signal).
4. Update pinned messages in all support channels with latest EA version, known issues, and FAQ links.
5. Review auto-mod logs  adjust sensitivity if false positive rate > 5%.
6. Publish audit report to Notion community dashboard.

## Output Specification

| Output | Format | Destination |
|---|---|---|
| Server structure changes | Discord API calls + changelog entry | Discord server + #mod-log channel |
| Role updates | Supabase-synced role assignments | Discord roles + Supabase user_roles table |
| Auto-mod config | JSON rule definitions | Discord AutoMod API + Notion documentation |
| Audit report | Markdown summary with metrics | Notion Community Health database |
| Moderation actions | Timestamped log entry | #mod-log channel + Supabase moderation_log table |

## API & Platform Requirements

| Platform | Variables | Usage |
|---|---|---|
| Discord Bot API | DISCORD_BOT_TOKEN | Server management, role CRUD, message monitoring, auto-mod configuration |
| Discord Webhook | DISCORD_WEBHOOK_URL | Automated announcements, milestone cross-posts |
| Supabase | SUPABASE_URL, SUPABASE_KEY | Role sync (subscription tier  Discord role), moderation logs, user metadata |
| n8n | N8N_WEBHOOK_URL | Welcome DM trigger, role sync scheduler, announcement pipeline |
| Notion API | NOTION_API_KEY | Audit reports, auto-mod documentation, channel structure wiki |

## Quality Checks

- [ ] All channels have descriptive topics and pinned onboarding messages.
- [ ] Role hierarchy enforces principle of least privilege  free users cannot access subscriber channels.
- [ ] Supabase  Discord role sync runs without errors for 7 consecutive days after any change.
- [ ] Auto-mod false positive rate stays below 5% (review weekly from #mod-log).
- [ ] New members receive welcome DM within 60 seconds of joining.
- [ ] Quarterly audit completed within 48 hours of scheduled date.
- [ ] Zero instances of subscriber content leaking to free-tier channels.
- [ ] Moderation actions logged with reason, evidence, and reviewer for every action.
