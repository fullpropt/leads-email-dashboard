# Multi-Service Email Setup (Railway)

This project now supports per-service email providers using environment variables.

## 1) Required strategy decision

If each service must send emails from a different account without cross-delivery:

- Recommended: each service uses an isolated `DATABASE_URL`.
- If services share the same database, they share the same leads/templates.
- This repo now supports account rotation across services in shared DB mode (see section 6).

## 2) Email provider variables

Set these per Railway service:

### TubeTools MailMKT (SendGrid)

```env
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=...
SENDGRID_FROM_EMAIL=...
SENDGRID_FROM_NAME=TubeTools
```

### TubeTools MailMKT 2/3/4/5... (Mailgun)

```env
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=...
MAILGUN_DOMAIN=...
MAILGUN_FROM_EMAIL=...
MAILGUN_FROM_NAME=TubeTools
# Optional (EU region):
# MAILGUN_BASE_URL=https://api.eu.mailgun.net
```

## 3) Scheduler duplicate protection

Background jobs now support `SCHEDULER_MODE`:

- `leader` (default): acquires a PostgreSQL advisory lock. Only one service per database runs schedulers.
- `enabled`: always runs schedulers.
- `disabled`: never runs schedulers.

Optional:

```env
SCHEDULER_LEADER_LOCK_KEY=845001
```

## 4) Suggested modes

- Shared database across services (without rotation): keep `SCHEDULER_MODE=leader`.
- Isolated database per service: use `SCHEDULER_MODE=enabled` in each service.

## 5) Local auth (already implemented)

Set per service:

```env
LOCAL_AUTH_EMAIL=...
LOCAL_AUTH_PASSWORD=...
```

Optional service label for logs:

```env
MAILMKT_SERVICE_NAME=tubetools-mailmkt-2
```

## 6) Shared DB account rotation (account 1 -> 2 -> 3 ...)

If all services use the same `DATABASE_URL` and you want sequential sender usage:

1. Enable rotation in all services:

```env
EMAIL_ACCOUNT_ROTATION_ENABLED=true
```

2. Set per-service priority and limit:

```env
# Service 1
EMAIL_SENDER_PRIORITY=1
EMAIL_SENDER_DAILY_LIMIT=100

# Service 2
EMAIL_SENDER_PRIORITY=2
EMAIL_SENDER_DAILY_LIMIT=100

# Service 3
EMAIL_SENDER_PRIORITY=3
EMAIL_SENDER_DAILY_LIMIT=100
```

3. Keep all schedulers enabled (or let default apply when rotation is enabled):

```env
SCHEDULER_MODE=enabled
```

When `EMAIL_ACCOUNT_ROTATION_ENABLED=true`, default scheduler mode becomes `enabled` if `SCHEDULER_MODE` is unset.

Behavior:
- Lowest `EMAIL_SENDER_PRIORITY` sends first.
- When it reaches `EMAIL_SENDER_DAILY_LIMIT`, next priority account starts sending.
- Counters reset daily.
