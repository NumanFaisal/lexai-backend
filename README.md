# LexAI Backend

Production-ready AI backend for LexAI — an Indian legal AI platform focused on legal research, drafting, compliance, case analysis, WhatsApp AI workflows, and document generation.

---

# Features

- AI Legal Research
- Legal Drafting
- Compliance Checking
- Case Analysis
- WhatsApp AI Assistant
- Voice Transcription
- PDF & DOCX Generation
- Citation Verification
- Hallucination Detection
- Redis Rate Limiting
- SSE Streaming
- Queue Workers
- Background Processing
- Prisma + PostgreSQL
- Dockerized Infrastructure
- TypeScript Strict Mode

---

# Tech Stack

- Node.js
- TypeScript
- Express.js
- Prisma
- PostgreSQL
- Redis
- BullMQ
- Anthropic Claude
- Twilio
- Razorpay
- Cloudflare R2
- Docker

---

# Project Structure

```txt
src/
│
├── app/
│   ├── server.ts          ← Creates HTTP server, binds port, handles graceful shutdown
│   ├── app.ts             ← Express app setup, registers all plugins and routes
│   └── plugins/
│       ├── cors.ts        ← CORS config (allow only your Vercel frontend URL)
│       ├── helmet.ts      ← Security headers
│       ├── morgan.ts      ← HTTP request logging
│       └── routes.ts      ← Registers all module routes into the app
│
├── config/
│   ├── env.ts             ← Validates ALL env vars with Zod on startup. App crashes if any missing.
│   ├── db.ts              ← Prisma client singleton. One instance for entire app.
│   ├── redis.ts           ← Redis client (Upstash). Used for cache + BullMQ.
│   └── logger.ts          ← Winston logger. info/error/warn levels. JSON format in production.
│
├── modules/               ← ONE FOLDER PER FEATURE. Each folder is self-contained.
│   │
│   ├── chat/
│   │   ├── chat.routes.ts        ← POST /api/chat → applies middleware → calls controller
│   │   ├── chat.controller.ts    ← Validates input, calls AgentFactory, streams SSE response
│   │   ├── chat.service.ts       ← Business logic: which agent to use, save query to DB
│   │   ├── chat.repository.ts    ← ONLY Prisma queries: saveQuery(), getHistory(), etc.
│   │   ├── chat.schema.ts        ← Zod schema for request body validation
│   │   └── chat.types.ts         ← TypeScript interfaces for this module
│   │
│   ├── auth/
│   │   ├── auth.routes.ts        ← POST /api/auth/sync (called after Clerk signup)
│   │   ├── auth.controller.ts    ← Gets Clerk user data, calls service
│   │   ├── auth.service.ts       ← Creates user in DB if first time, updates if returning
│   │   ├── auth.repository.ts    ← findByClerkId(), createUser(), updateUser()
│   │   └── auth.schema.ts        ← Zod validation for sync payload
│   │
│   ├── documents/
│   │   ├── documents.routes.ts   ← GET/POST/PUT/DELETE /api/documents, /pdf, /docx
│   │   ├── documents.controller.ts ← Handle CRUD + export requests
│   │   ├── documents.service.ts  ← Business logic: generate PDF, generate DOCX, version bump
│   │   ├── documents.repository.ts ← All Prisma queries for Document model
│   │   ├── documents.schema.ts   ← Zod schemas for create/update
│   │   └── documents.types.ts    ← TypeScript interfaces
│   │
│   ├── compliance/
│   │   ├── compliance.routes.ts  ← POST /api/comply, GET /api/comply (list reports)
│   │   ├── compliance.controller.ts
│   │   ├── compliance.service.ts ← Run compliance agent, save report, update item status
│   │   ├── compliance.repository.ts ← Prisma queries for ComplianceReport + ComplianceItem
│   │   └── compliance.schema.ts
│   │
│   ├── payments/
│   │   ├── payments.routes.ts    ← POST /api/payments/subscribe, /cancel, /webhook
│   │   ├── payments.controller.ts ← Handle subscription + Razorpay webhook events
│   │   ├── payments.service.ts   ← Create subscription, upgrade plan in DB, handle cancellation
│   │   ├── payments.repository.ts ← Prisma queries for Subscription + PaymentEvent
│   │   └── payments.schema.ts
│   │
│   ├── whatsapp/
│   │   ├── whatsapp.routes.ts    ← POST /api/whatsapp (Twilio webhook — public, no JWT)
│   │   ├── whatsapp.controller.ts ← Returns 200 immediately, queues job
│   │   ├── whatsapp.service.ts   ← Get/update session, check limit, route to agent
│   │   ├── whatsapp.repository.ts ← Prisma queries for WhatsappSession
│   │   └── whatsapp.types.ts
│   │
│   └── admin/
│       ├── admin.routes.ts       ← GET /api/admin/stats, /users, /logs (needs admin middleware)
│       ├── admin.controller.ts
│       ├── admin.service.ts      ← Aggregate stats, suspend user, reset limits
│       └── admin.repository.ts   ← Complex analytical queries
│
├── ai/                           ← ALL AI CODE LIVES HERE. Agents, prompts, LangGraph.
│   │
│   ├── agents/
│   │   ├── base.agent.ts         ← Abstract class. All agents extend this.
│   │   │                           Contains: run(), callClaude(), verifyCitations(), saveQuery()
│   │   │                           AgentFactory.create(mode) → returns correct agent
│   │   │
│   │   ├── research/
│   │   │   ├── research.agent.ts ← Extends BaseAgent. Implements 8-step research pipeline.
│   │   │   └── research.graph.ts ← LangGraph StateGraph for research workflow (Week 4+)
│   │   │
│   │   ├── drafting/
│   │   │   ├── drafting.agent.ts ← Extends BaseAgent. Detect type → clarify → draft → save.
│   │   │   └── drafting.graph.ts ← LangGraph for drafting workflow
│   │   │
│   │   ├── compliance/
│   │   │   ├── compliance.agent.ts ← Extends BaseAgent. Business profile → JSON checklist.
│   │   │   └── compliance.graph.ts
│   │   │
│   │   └── case-analysis/
│   │       ├── case-analysis.agent.ts ← Extends BaseAgent. 2x Claude calls → IRAC.
│   │       └── case-analysis.graph.ts
│   │
│   ├── prompts/
│   │   ├── shared/
│   │   │   └── base.prompt.ts    ← Core Indian law system prompt. All Acts. Citation rules. Disclaimer.
│   │   ├── research/
│   │   │   └── index.ts          ← Research-specific additions: format as Summary → Laws → Cases → Steps
│   │   ├── drafting/
│   │   │   └── index.ts          ← Draft-specific: generate complete docs, all clauses, India-compliant
│   │   ├── compliance/
│   │   │   └── index.ts          ← Compliance-specific: return ONLY JSON array, exhaustive
│   │   └── case-analysis/
│   │       └── index.ts          ← Case-specific: IRAC format, STRONG/MODERATE/WEAK assessment
│   │
│   ├── guards/
│   │   ├── hallucination.guard.ts ← Extract citations → Kanoon verify → confidence score
│   │   └── input.guard.ts         ← isLegalQuery() — reject off-topic before Claude call
│   │
│   ├── pipelines/
│   │   ├── research.pipeline.ts   ← Orchestrates: validate → classify → build messages → Claude → verify → save
│   │   ├── drafting.pipeline.ts   ← Orchestrates drafting workflow steps
│   │   ├── compliance.pipeline.ts ← Orchestrates compliance check steps
│   │   └── case-analysis.pipeline.ts ← Orchestrates IRAC analysis steps
│   │
│   ├── embeddings/
│   │   ├── embeddings.provider.ts ← LangChain embeddings for semantic search (future RAG)
│   │   └── vector.store.ts        ← pgvector store for document similarity search
│   │
│   └── providers/
│       ├── claude.provider.ts     ← Anthropic SDK wrapper: stream(), complete(), classify()
│       └── whisper.provider.ts    ← OpenAI Whisper wrapper: transcribeFile(), transcribeUrl()
│
├── queues/
│   ├── voice/
│   │   ├── voice.queue.ts         ← BullMQ queue definition for voice transcription jobs
│   │   └── voice.processor.ts     ← Job handler: download audio → Whisper → agent → reply
│   ├── pdf/
│   │   ├── pdf.queue.ts           ← BullMQ queue for PDF generation
│   │   └── pdf.processor.ts       ← Puppeteer render → R2 upload → update DB
│   └── compliance/
│       ├── compliance.queue.ts    ← BullMQ queue for large compliance reports
│       └── compliance.processor.ts ← Process in background, notify when done
│
├── shared/
│   ├── middleware/
│   │   ├── auth.middleware.ts       ← Verify Clerk JWT → attach req.userId
│   │   ├── rate-limit.middleware.ts ← Redis sliding window rate limiter
│   │   ├── query-limit.middleware.ts ← Atomic DB increment + limit check
│   │   ├── validate.middleware.ts   ← Run Zod schema against req.body
│   │   ├── twilio.middleware.ts     ← Validate Twilio webhook signature
│   │   └── admin.middleware.ts      ← Check if user is admin
│   │
│   ├── errors/
│   │   ├── AppError.ts             ← Base error class: statusCode, message, isOperational
│   │   ├── error.handler.ts        ← Global Express error handler middleware (add last to app)
│   │   └── error.types.ts          ← All named error classes: AuthError, NotFoundError, etc.
│   │
│   ├── utils/
│   │   ├── sse.ts                  ← streamSSE(res, event) helper for Server-Sent Events
│   │   ├── whatsapp.format.ts      ← formatForWhatsApp() — strip markdown, plain text
│   │   └── async.wrapper.ts        ← asyncHandler(fn) — wraps async route handlers, catches throws
│   │
│   ├── constants/
│   │   ├── plans.ts                ← Plan limits: FREE=30, STUDENT=200, PRO=unlimited
│   │   ├── modes.ts                ← QueryMode enum values and metadata
│   │   └── acts.ts                 ← Indian Acts lookup table (name → max sections)
│   │
│   ├── types/
│   │   ├── express.d.ts            ← Extends Express Request: req.userId, req.user
│   │   └── index.ts                ← Shared TypeScript interfaces across modules
│   │
│   └── helpers/
│       ├── citation.parser.ts      ← Regex patterns to extract citations from Claude output
│       └── cost.calculator.ts      ← Calculate Claude API cost from token counts
│
├── infrastructure/
│   ├── storage/
│   │   └── r2.storage.ts           ← Cloudflare R2: uploadFile(), getSignedUrl(), deleteFile()
│   │
│   ├── payments/
│   │   └── razorpay.client.ts      ← Razorpay SDK wrapper: createSub(), verifyWebhook()
│   │
│   ├── search/
│   │   └── kanoon.client.ts        ← Indian Kanoon API client with Redis 24h caching
│   │
│   └── telemetry/
│       ├── sentry.ts               ← Sentry error tracking setup
│       ├── metrics.ts              ← Custom metrics: query count, latency, cost per user
│       └── analytics.ts            ← PostHog events: query_submitted, plan_upgraded, etc.
│
└── prisma/
    ├── schema.prisma               ← ✅ Already done (the file above)
    └── migrations/                 ← Auto-generated. Never edit manually.
```

---

# Requirements

Install:

- Node.js 20 LTS
- Docker Desktop
- PostgreSQL (optional if using Docker)
- Redis (optional if using Docker)

---

# Installation

Clone repository:

```bash
git clone <repo-url>

cd lexai-backend
```

Install dependencies:

```bash
npm install
```

---

# Environment Variables

Create:

```txt
.env
```

Copy contents from:

```txt
.env.example
```

---

# Docker Setup

Start PostgreSQL:

```bash
docker run --name lexai-postgres \
-e POSTGRES_USER=postgres \
-e POSTGRES_PASSWORD=password \
-e POSTGRES_DB=lexai \
-p 5432:5432 \
-d postgres
```

Start Redis:

```bash
docker run --name lexai-redis \
-p 6379:6379 \
-d redis
```

Verify containers:

```bash
docker ps
```

---

# Prisma Setup

Generate Prisma client:

```bash
npx prisma generate
```

Run migrations:

```bash
npx prisma migrate dev --name init
```

Open Prisma Studio:

```bash
npx prisma studio
```

---

# Development

Run development server:

```bash
npm run dev
```

Server:

```txt
http://localhost:4000
```

Health check:

```txt
GET /health
```

---

# Production Build

Build project:

```bash
npm run build
```

Run production server:

```bash
npm start
```

---

# Available Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run format
```

---

# Code Quality

This project uses:

- ESLint
- Prettier
- Husky
- lint-staged
- Strict TypeScript

Formatting and linting run automatically before commits.

---

# API Versioning

All APIs use versioning:

```txt
/api/v1
```

Example:

```txt
/api/v1/chat
```

---

# Architecture Principles

- Modular Monolith
- Feature-Based Structure
- Thin Controllers
- Service Layer Pattern
- AI Pipeline Architecture
- Typed Validation
- Queue-Based Background Jobs
- Structured Logging
- Graceful Shutdown

---

# Security

- Helmet
- CORS
- Rate Limiting
- Zod Validation
- Twilio Signature Verification
- Query Usage Limits
- Environment Validation

---

# Logging

Uses Pino logger.

Development:
- pretty logs

Production:
- structured JSON logs

---

# AI System

The AI layer contains:

- Agents
- Pipelines
- Tools
- Guards
- Providers
- Prompts

Example flow:

```txt
Request
→ Agent
→ Pipeline
→ Tools
→ Claude
→ Verification
→ Response
```

---

# Queues

Background jobs handled using BullMQ:

- Voice Processing
- PDF Generation
- Compliance Jobs

---

# Deployment

Recommended deployment stack:

- Backend → Railway / Fly.io
- Database → Railway PostgreSQL
- Redis → Upstash
- Storage → Cloudflare R2
- CDN → Cloudflare

---

# Important Notes

- Never commit `.env`
- Never edit Prisma migrations manually
- Use strict TypeScript
- Prefer feature-based modules
- Keep business logic out of routes
- Validate all inputs
- Avoid giant files

---

# License

MIT