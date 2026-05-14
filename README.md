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

├── config/
├── modules/
├── ai/
├── integrations/
├── middlewares/
├── queues/
├── workers/
├── streaming/
├── shared/
├── observability/
├── dto/
├── constants/
├── types/
└── tests/
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