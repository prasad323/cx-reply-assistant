# CX Reply Assistant — AI-Powered Customer Support Reply Tool

A small, deployable app that lets a CX agent view a conversation, pull relevant
brand policy info from a knowledge base, and generate an AI-assisted reply
that is *grounded* in that knowledge base (with guardrails against
hallucinated promises).

---

## 0. What you need installed (one-time, on your machine)

| Tool | Why | Install |
|---|---|---|
| **Node.js 18+** | Run/build the React frontend | https://nodejs.org (LTS) |
| **npm** | Comes with Node | included |
| **Git** | Version control / push to GitHub | https://git-scm.com |
| **Supabase CLI** | Local dev + deploy Edge Functions | `npm install -g supabase` |
| **A Supabase account** | Free Postgres DB + Edge Functions + Auth | https://supabase.com |
| **An OpenRouter account** | Free/cheap access to LLMs (Claude, GPT, Llama, etc.) via one API | https://openrouter.ai |
| **A Vercel or Netlify account** | Free hosting for the frontend | https://vercel.com |

Check installs:
```bash
node -v      # v18 or higher
npm -v
git --version
supabase --version
```

---

## 1. Clone / open this project

```bash
cd cx-reply-assistant
npm install
```

---

## 2. Create your Supabase project

1. Go to https://supabase.com/dashboard → **New Project**.
2. Note down (Project Settings → API):
   - `Project URL` → this is `VITE_SUPABASE_URL`
   - `anon public` key → this is `VITE_SUPABASE_ANON_KEY`
   - `service_role` key (keep secret, used only server-side)

3. Open the **SQL Editor** in the Supabase dashboard, paste the contents of
   `supabase/schema.sql`, and run it. This creates:
   - `brands`
   - `knowledge_base`
   - `customers`
   - `orders`
   - `conversations`
   - `messages`
   - `reply_logs` (the audit/logging table)

   It also inserts mock data for one brand ("HydroBottle Co.") with a
   customer, an order, a conversation, and 4 KB policy entries — enough to
   run the exact scenario in the assessment ("My order was delivered but
   the bottle is broken...").

---

## 3. Get an OpenRouter API key

1. Sign up at https://openrouter.ai → **Keys** → **Create Key**.
2. Copy it. You'll use a free/cheap model, e.g. `anthropic/claude-4.5-haiku` (paid, small cost).

---

## 4. Configure environment variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

The OpenRouter key does **NOT** go in the frontend `.env` — it goes into
Supabase Edge Function secrets (server-side only, so it's never exposed to
the browser):

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase secrets set OPENROUTER_API_KEY=sk-or-xxxxxxxx
```

---

## 5. Deploy the Edge Function (this does the AI reply generation)

```bash
supabase functions deploy generate-reply --no-verify-jwt
```

`--no-verify-jwt` is used here for simplicity (assessment/demo purposes).
In production you'd verify the agent's Supabase Auth JWT (see architecture
doc for details).

Test it directly:
```bash
curl -i --location --request POST \
  'https://zwnqyiagffgysgsolxsr.supabase.co/functions/v1/generate-reply' \
  --header 'Content-Type: application/json' \
  --data '{"conversation_id":"REPLACE-WITH-ID-FROM-SEED-DATA"}'
```

---

## 6. Run the frontend locally

```bash
npm run dev
```
Open http://localhost:5173

You should see:
- Customer name, brand, order info, conversation history, latest message
- A **Generate Reply** button
- After generating: an editable textarea, **Regenerate**, and **Approve** buttons

---

## 7. Deploy the frontend (publicly accessible URL)

**Vercel (recommended, easiest):**
```bash
npm install -g vercel
vercel
```
When prompted, add the two `VITE_*` env vars in the Vercel dashboard
(Project → Settings → Environment Variables), then `vercel --prod`.

**Or Netlify:**
```bash
npm run build
netlify deploy --prod --dir=dist
```

---

## 8. How the AI guardrails work (Core Requirement #4)

The Edge Function (`supabase/functions/generate-reply/index.ts`) does this:

1. **Retrieval, not free recall**: it fetches only the KB rows for the
   matched brand and does light keyword scoring so the most relevant
   policy sections are sent to the model — the model is never allowed to
   "know" policy from its own training.
2. **Strict system prompt**: the model is instructed to answer *only*
   using the provided KB text, and if the KB doesn't clearly cover the
   customer's exact situation (e.g. dates, exceptions), to say it needs to
   confirm with the team rather than promising an outcome.
3. **Order-date cross-check**: before calling the LLM, the function
   computes `days_since_delivery` from order data and passes it explicitly
   as a fact — so the model isn't left to do date math itself (a common
   hallucination source).
4. **No-context fallback**: if retrieval returns nothing relevant, the
   function skips the LLM call entirely and returns a canned
   "I don't have enough information — escalating" message.

This is intentionally a prompt/context-engineering guardrail rather than a
fine-tuned classifier — appropriate for the scope of this assessment. The
architecture doc explains how this would evolve at scale (e.g. a
verification/critic pass, confidence scoring, eval suite).

---

## 9. Project structure

```
cx-reply-assistant/
├── README.md
├── .env.example
├── package.json
├── index.html
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── supabaseClient.js
│   └── components/
│       ├── ConversationView.jsx
│       └── ReplyPanel.jsx
└── supabase/
    ├── schema.sql                     # DB schema + seed/mock data
    └── functions/
        └── generate-reply/
            └── index.ts               # Edge Function: retrieval + LLM call + logging
```
