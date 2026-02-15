---
name: support-triage
description: |
  Classifies, prioritizes, and routes incoming support requests from Discord and other channels  resolving common issues with FAQ deflection, escalating technical bugs to Engineering, broker issues to Business Strategy, and billing disputes to Finance, while maintaining SLA targets for Hedge Edge users.
---

# Support Triage

## Objective

Serve as the first line of defense for every Hedge Edge user who encounters a problem. Resolve 70%+ of issues at the community manager level using knowledge base deflection and guided troubleshooting. Escalate the remaining 30% to the correct agent with full context so no user has to repeat themselves. Target SLAs: first response < 15 minutes during active hours, resolution < 4 hours for non-critical issues, < 1 hour for critical issues.

## When to Use This Skill

- A user posts in #hedge-setup-help or #bug-reports channels.
- A user DMs the Hedge Edge bot or community manager with a support question.
- A support ticket is created through Crisp/Intercom (future integration).
- Multiple users report the same issue within a short timeframe (incident detection).
- A high-value user (Elite tier, top referrer) reports any issue (priority handling).
- The weekly support health report is due.
- FAQ or knowledge base content needs updating based on recurring questions.

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| ction | enum | Yes | 	riage_issue, esolve_issue, escalate_issue, detect_incident, update_faq, generate_report |
| source | enum | Yes | discord_public, discord_dm, support_ticket, email |
| user_id | string | Yes | Discord user ID or Supabase UUID |
| issue_description | string | Yes | User's description of the problem |
| ttachments | array | No | Screenshots, logs, EA version info |
| user_tier | enum | No | ree, pro, elite  auto-fetched from Supabase if not provided |
| roker | enum | No | antage, lackbull, other |
| prop_firm | enum | No | tmo, 	he5ers, 	opstep, pex, other |

## Step-by-Step Process

### 1. Issue Classification Matrix

When a support request arrives, classify using this decision tree:

**Category 1: EA Connection & Setup Issues (40% of volume)**

| Issue | Severity | Resolution Path |
|---|---|---|
| EA not appearing in MT5 Navigator | Low | FAQ deflection: guide to copy EA file to correct MQL5/Experts directory + restart MT5 |
| EA attached but "not trading" badge shows | Medium | Check AutoTrading is enabled in MT5 (button at top of platform). Check "Allow Algo Trading" in EA properties. |
| EA connected but hedge orders not executing | High | Check broker account connection in Hedge Edge app. Verify hedge broker (Vantage/BlackBull) has sufficient margin. Check if market is open. |
| EA crashes or MT5 freezes when EA loads | Critical | Collect: EA version, MT5 build number, Windows version, screenshot of crash. Escalate to **Engineering Agent**. |
| "Invalid account" error when linking broker | High | Verify account number and server. Vantage: check if RAW ECN account type. BlackBull: confirm ECN Prime account. If persistent, escalate to **Engineering Agent**. |

**Category 2: Broker-Specific Issues (20% of volume)**

| Issue | Severity | Resolution Path |
|---|---|---|
| Vantage: high slippage on hedge execution | Medium | Ask for specific trade examples (entry price vs. fill price, time, pair). If slippage > 2 pips consistently, escalate to **Business Strategist Agent** for Vantage relationship management. |
| BlackBull: delayed order execution during news | Medium | Explain that news events cause broker-wide latency. Recommend avoiding hedging during high-impact news (NFP, FOMC). If persistent outside news, escalate to **Business Strategist Agent**. |
| Broker deposit/withdrawal issues | Low | Not a Hedge Edge issue  redirect to broker support with contact links. Log feedback if multiple users report same issue. |
| IB referral link not tracked | Medium | Verify user signed up through the correct IB link. Check Supabase eferrals table. If attribution missing, manually add and notify **Finance Agent** to reconcile commissions. |
| "Broker disconnected" recurring alerts | High | Check broker API status. Guide user through reconnection flow in Hedge Edge app. If systemic (3+ users), escalate to **Engineering Agent** as potential API issue. |

**Category 3: Prop Firm-Specific Questions (15% of volume)**

| Issue | Severity | Resolution Path |
|---|---|---|
| "Will hedging violate my prop firm rules?" | Medium | Provide prop-firm-specific guidance: FTMO allows hedging on separate accounts. The5%ers allows external hedging. TopStep  verify current rules (they change). Apex  hedging permitted with separate broker. **Always caveat: "Verify current rules directly with your prop firm  rules can change."** |
| "What hedge ratio should I use for [prop firm]?" | Low | Provide recommended starter configs from the onboarding skill. Point to #mt5-ea-discussion for community settings. |
| "I failed my challenge despite hedging" | Medium | Empathize first. Review if hedge was active during the losing period (check Supabase trade logs if user consents). If hedge was active but didn't protect, escalate to **Engineering Agent** to review hedge execution logs. |
| Prop firm flagged account for "suspicious activity" | Critical | Immediate response. Gather details: which prop firm, what activity was flagged, timeline. Do NOT promise that hedging is allowed  instead: "Let's review your setup to ensure everything aligns with [firm]'s current terms." Escalate to **Business Strategist Agent** if it involves a prop firm Hedge Edge has a relationship with. |

**Category 4: Billing & Subscription Issues (10% of volume)**

| Issue | Severity | Resolution Path |
|---|---|---|
| "I was charged but my Pro features aren't active" | High | Check Supabase subscriptions table. If subscription is active but Discord role not synced, manually trigger role sync. If payment recorded but subscription not activated, escalate to **Finance Agent**. |
| Refund request | Medium | Acknowledge request. Check usage in last 30 days. Route to **Finance Agent** with context: user tier, time on tier, usage level, reason for refund. |
| "How do I cancel?" | Low | Provide cancellation instructions (Hedge Edge dashboard  Account  Subscription  Cancel). Trigger exit survey. Offer win-back option if user seems recoverable. |
| Payment failed / card declined | Medium | Discord DM with dunning info: "Your payment didn't go through  update your card at [link] to keep Pro/Elite access. Your features will pause in 72 hours if unresolved." Route to **Finance Agent** if unresolved after 5 days. |

**Category 5: General Questions & Feature Requests (15% of volume)**
- Feature requests  route to eedback-collection skill.
- "How do I..." questions  FAQ deflection or guided instructions.
- "When is MT4/cTrader coming?"  Share latest timeline from #mt4-ctrader-waitlist pinned message.
- "Can I use Hedge Edge with [unsupported broker]?"  "Currently we support Vantage and BlackBull. We're exploring additional brokers  post a request in #feature-requests!"

### 2. SLA Framework

| Tier | First Response | Resolution Target | Escalation Trigger |
|---|---|---|---|
| Elite ($75/mo) | < 5 minutes | < 1 hour (non-critical), < 15 min (critical) | Auto-flag if response > 10 min |
| Pro ($29/mo) | < 15 minutes | < 4 hours (non-critical), < 30 min (critical) | Auto-flag if response > 30 min |
| Free | < 30 minutes | < 24 hours (non-critical), < 2 hours (critical) | Auto-flag if response > 1 hour |
| Active hours | 08:0022:00 UTC | Outside active hours: acknowledge + commit to next-morning resolution |  |

**SLA monitoring**: n8n workflow checks Supabase support_tickets table every 5 minutes. Tickets approaching SLA breach trigger alert in internal #community-ops channel.

### 3. Incident Detection (Multi-User Issue)

**Trigger**: 3+ users report the same issue within a 1-hour window.

**Incident response:**
1. Create an incident record in Supabase incidents table: { title, affected_users, first_report_time, status: "investigating" }.
2. Post in #announcements: "We're aware of [issue description] and are investigating. Updates will be posted here. Your hedges are [safe/paused]  we'll update you shortly."
3. Escalate immediately to **Engineering Agent** with all user reports compiled.
4. Update #announcements every 30 minutes until resolved.
5. Post resolution: "The [issue] has been resolved as of [time]. Here's what happened and what we've done to prevent it: [brief explanation]. If you're still experiencing issues, post in #hedge-setup-help."
6. Post-incident: DM all affected users with apology and resolution details.

**Incident severity levels:**
- **P1 (Critical)**: Hedge orders not executing, data loss, security breach. All hands. < 1 hour resolution target.
- **P2 (High)**: EA disconnections affecting multiple users, broker API issues. Engineering priority. < 4 hours.
- **P3 (Medium)**: Dashboard errors, non-blocking UI bugs. Normal queue. < 24 hours.

### 4. FAQ Deflection & Knowledge Base

**Top 20 FAQ entries** maintained in Notion and referenced by Discord bot:

1. How do I install the EA on MT5?
2. How do I link my Vantage/BlackBull account?
3. What hedge ratio should I start with?
4. Does hedging violate prop firm rules?
5. How do I enable AutoTrading in MT5?
6. Why is my hedge order not executing?
7. How do I switch from Vantage to BlackBull (or vice versa)?
8. What's the difference between Pro and Elite tiers?
9. How do I upgrade/downgrade my subscription?
10. When is MT4/cTrader support coming?
11. How do I set up multi-account hedging (Pro/Elite)?
12. What happens if my broker disconnects during a trade?
13. How do I configure hedge triggers for FTMO specifically?
14. Can I use Hedge Edge with a broker not listed?
15. How do I check my hedge is active and working?
16. What's the minimum deposit needed at Vantage/BlackBull for hedging?
17. How does the IB referral program work?
18. How do I join the referral program?
19. What data does Hedge Edge collect from my trading account?
20. How do I uninstall the EA cleanly?

**Bot auto-response**: When a message in #hedge-setup-help matches a FAQ keyword pattern, bot suggests the relevant FAQ link before a human responds: "This might help: [FAQ link]. If it doesn't resolve your issue, a team member will follow up shortly!"

### 5. Escalation Protocol

**When escalating to another agent, always include:**

`markdown
## Support Escalation

**Ticket ID**: [Supabase ticket UUID]
**User**: [Discord handle] | [Supabase UUID] | Tier: [free/pro/elite]
**Prop Firm**: [FTMO/The5%ers/TopStep/Apex/Other]
**Broker**: [Vantage/BlackBull/Other]
**Issue Category**: [EA/Broker/Billing/PropFirm/Feature]
**Severity**: [P1/P2/P3]
**Description**: [Clear summary of the issue]
**Steps Taken**: [What the community manager already tried]
**User Sentiment**: [Calm/Frustrated/Angry/At risk of churn]
**Attachments**: [Screenshots, logs, trade IDs]
**SLA Status**: [Within SLA / Approaching breach / Breached]
`

### 6. Weekly Support Health Report

Every Monday, generate and post to Notion + internal Discord:

`markdown
# Support Health Report  Week of [Date]

## Volume
- Total tickets: [N]
- By channel: Discord public [N], Discord DM [N], Support widget [N]
- By category: EA Setup [N], Broker [N], Prop Firm [N], Billing [N], General [N]

## Resolution
- Resolved at L1 (Community Manager): [N]% 
- Escalated: [N]% (Engineering [N], Business Strategy [N], Finance [N])
- Average first response time: [N] minutes (SLA target: 15 min)
- Average resolution time: [N] hours (SLA target: 4 hours)
- SLA breach count: [N] (target: 0)

## Trends
- Most common issue this week: [issue]
- New issue type detected: [if any]
- Repeat users (3+ tickets in 30 days): [N]  potential UX problem or power users needing advanced help

## Action Items
- [FAQ entry to add/update based on recurring questions]
- [Product improvement suggestion based on support patterns]
- [Escalation process refinement if SLA was breached]
`

## Output Specification

| Output | Format | Destination |
|---|---|---|
| Triage classification | JSON record | Supabase support_tickets table |
| User response | Discord message | Source channel or DM |
| Escalation package | Structured Markdown | Receiving agent + Supabase escalations table |
| Incident status updates | Discord embed | #announcements channel |
| FAQ auto-response | Discord message with link | #hedge-setup-help channel |
| Weekly support report | Markdown report | Notion Support Health + internal #community-ops |
| SLA breach alerts | Webhook notification | Internal #community-ops channel |

## API & Platform Requirements

| Platform | Variables | Usage |
|---|---|---|
| Discord Bot API | DISCORD_BOT_TOKEN | Message monitoring, auto-responses, FAQ bot, incident status posts, DM support |
| Supabase | SUPABASE_URL, SUPABASE_KEY | Ticket storage, SLA tracking, incident records, user tier lookup, trade log access |
| n8n | N8N_WEBHOOK_URL | SLA monitoring workflow, escalation routing, incident detection pipeline, dunning triggers |
| Notion API | NOTION_API_KEY | FAQ/knowledge base hosting, weekly report publishing, incident post-mortem docs |
| Discord Webhook | DISCORD_WEBHOOK_URL | Incident status updates in #announcements, SLA breach alerts in #community-ops |
| Crisp / Intercom | SUPPORT_API_KEY | Help desk ticket management, live chat widget (future  when implemented, becomes primary ticketing system) |

## Quality Checks

- [ ] First response SLA met for 95%+ of tickets during active hours (08:0022:00 UTC).
- [ ] L1 resolution rate stays above 70% (Community Manager resolves without escalation).
- [ ] Zero P1 incidents without a status update in #announcements within 15 minutes.
- [ ] Escalation packages include all required fields  zero incomplete escalations.
- [ ] FAQ deflection rate > 25% of incoming questions (bot suggests answer before human needed).
- [ ] FAQ content reviewed and updated weekly based on recurring questions.
- [ ] Weekly support report delivered every Monday by 12:00 UTC.
- [ ] No user repeats their issue description when escalated  context transfers completely.
- [ ] Elite tier users receive first response within 5 minutes during active hours  100% compliance.
- [ ] Incident detection catches multi-user issues within 30 minutes of the 3rd report.
- [ ] Post-incident follow-up DMs sent to 100% of affected users within 2 hours of resolution.
- [ ] Monthly trend analysis identifies top 3 product improvement opportunities from support patterns.
