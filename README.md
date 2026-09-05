# CX Reply Assistant — AI-Powered Customer Support Reply Tool

A small, deployed application that lets a CX agent view a conversation, pull
relevant brand policy information from a knowledge base, and generate an
AI-assisted reply that is grounded in that knowledge base, with guardrails
against confidently promising things the policy doesn't support.

**Live app:** https://cx-reply-assistant-rmjo.vercel.app/

---

## What this covers

| Requirement | Where |
|---|---|
| Conversation View (customer, brand, history, latest message, order info) | `src/components/ConversationView.jsx` |
| Brand Knowledge Base (return/refund/shipping/cancellation) | `supabase/schema.sql` → `knowledge_base` table |
| AI Reply Generation (identify brand → retrieve → context → LLM → display) | `supabase/functions/generate-reply/index.ts` |
| Edit / Regenerate / Approve | `src/components/ReplyPanel.jsx` |
| AI Guardrails | Retrieval-grounded prompt + strict system prompt + no-context fallback |
| Data & Logging (message, context, AI response, edits, final, timestamp) | `reply_logs` table, written on every generate and approve |

---

## Tech stack

- **Frontend:** React (Vite)
- **Backend:** Supabase Edge Functions
- **Database:** Supabase Postgres
- **LLM:** OpenRouter (`anthropic/claude-haiku-4.5`)

---

## Prerequisites

| Tool | Install |
|---|---|
| Node.js 18+ | https://nodejs.org (LTS) |
| npm | included with Node |
| Git | https://git-scm.com |
| Supabase CLI | `npm install supabase --save-dev` (use `npx supabase` to run commands) |
| Supabase account | https://supabase.com |
| OpenRouter account | https://openrouter.ai |
| Vercel account | https://vercel.com |

---

## Setup

```bash
git clone https://github.com/prasad323/cx-reply-assistant.git
cd cx-reply-assistant
npm install
```

### 1. Create a Supabase project
Go to https://supabase.com/dashboard → **New Project**. From
**Settings → API**, copy:
- **Project URL** → `VITE_SUPABASE_URL`
- **Publishable / anon public key** → `VITE_SUPABASE_ANON_KEY`

### 2. Run the schema
Open the **SQL Editor** in your Supabase project, paste the full contents
of `supabase/schema.sql`, and run it. This creates all tables and seeds
mock data for one brand ("HydroBottle Co.") — a customer, an order, a
conversation, and 4 KB policy entries matching the scenario described in
the assessment.

### 3. Get an OpenRouter API key
https://openrouter.ai 

### 4. Configure environment variables
```bash
cp .env.example .env
```
Fill in:
```
VITE_SUPABASE_URL=https://zwnqyiagffgysgsolxsr.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_qSL5cDLHCUjkwh_QQ6azTw__06bQUtx
```
The OpenRouter key is set as a server-side Edge Function secret, so it's
never exposed to the browser:
```bash
npx supabase login
npx supabase link --project-ref 
npx supabase secrets set OPENROUTER_API_KEY
npx supabase secrets set OPENROUTER_MODEL=anthropic/claude-haiku-4.5
```

### 5. Deploy the Edge Function
```bash
npx supabase functions deploy generate-reply --no-verify-jwt
```
`--no-verify-jwt` is used for assessment/demo simplicity. In production,
this would verify the agent's Supabase Auth JWT and check brand membership
before processing — covered in the architecture document.

---

## Run locally

```bash
npm run dev
```
Open http://localhost:5173. You should see the conversation, a **Generate
Reply** button, and after generating: an editable textarea, **Regenerate**,
and **Approve**.

---

## Deploy the frontend

```bash
npm install -g vercel
vercel
```
Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel
dashboard (Project → Settings → Environment Variables), then:
```bash
vercel --prod
```

---

## How the AI guardrails work

The Edge Function (`supabase/functions/generate-reply/index.ts`):

1. **Retrieval, not free recall** — fetches only knowledge base entries for
   the matched brand, scored for relevance, so the most relevant policy
   sections are sent to the model. The model never answers from its own
   training knowledge of "typical" return policies.
2. **Strict system prompt** — instructs the model to answer only from the
   provided knowledge base text, and if the customer's exact situation
   isn't clearly covered, to acknowledge the issue and say it needs
   confirmation rather than promising an outcome.
3. **Order-date cross-check computed in code** — `days_since_delivery` is
   calculated server-side and handed to the model as a stated fact, so the
   model isn't doing date math itself.
4. **No-context fallback** — if retrieval returns nothing relevant, the
   function skips the LLM call entirely and returns a fixed escalation
   message instead of guessing.

---

## Data & Logging

Every **Generate Reply** call inserts a row into `reply_logs`:
`customer_message`, `retrieved_context`, `ai_generated_response`, `status`,
`created_at`. Every **Approve** click updates that same row with
`agent_edited_response`, `final_response`, `status = 'approved'`,
`updated_at`.

---

## Project structure

```
cx-reply-assistant/
├── README.md
├── .env.example
├── package.json
├── vite.config.js
├── index.html
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── supabaseClient.js
│   └── components/
│       ├── ConversationView.jsx
│       └── ReplyPanel.jsx
└── supabase/
    ├── schema.sql
    └── functions/
        └── generate-reply/
            └── index.ts
```

---

## One thing I'd improve with more time

Retrieval currently uses keyword scoring rather than a real vector search.
That's sufficient at this scale (one brand, four policy entries) but
wouldn't hold up with hundreds of brands and larger knowledge bases, where
semantically similar but differently worded questions would get missed.
The architecture document covers moving this to a vector store (e.g.
Qdrant) with per-brand partitioning.