// Supabase Edge Function: generate-reply
// Runs on Deno. Deploy with: supabase functions deploy generate-reply --no-verify-jwt
//

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')!
const MODEL = Deno.env.get('OPENROUTER_MODEL') ?? 'anthropic/claude-3.5-haiku'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
  return new Response('ok', { headers: corsHeaders })
}
  try {
    const body = await req.json()
    const { conversation_id, action, final_response } = body

    // ---- Branch: agent approving a response (just update the log row) ----
    if (action === 'approve') {
      await supabase
        .from('reply_logs')
        .update({ final_response, status: 'approved', updated_at: new Date().toISOString() })
        .eq('conversation_id', conversation_id)
        .order('created_at', { ascending: false })
        .limit(1)
      return json({ ok: true })
    }

    // ---- Branch: generate (or regenerate) a reply ----
    // 1. Load conversation + brand + order + latest customer message
    const { data: convo, error: convoErr } = await supabase
      .from('conversations')
      .select(`
        id, brand_id,
        brand:brands ( id, name ),
        order:orders ( order_number, product_name, delivered_at ),
        messages ( sender, content, created_at )
      `)
      .eq('id', conversation_id)
      .single()

    if (convoErr || !convo) return json({ error: 'Conversation not found' }, 404)

    const customerMessages = convo.messages
      .filter((m: any) => m.sender === 'customer')
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const latestMessage = customerMessages[customerMessages.length - 1]?.content ?? ''

    // 2. Retrieve relevant KB entries for this brand (keyword-scored, not just "all")
    const { data: kbEntries, error: kbErr } = await supabase
      .from('knowledge_base')
      .select('policy_type, content')
      .eq('brand_id', convo.brand_id)

    if (kbErr) return json({ error: kbErr.message }, 500)

    const retrievedContext = retrieveRelevant(latestMessage, kbEntries ?? [])

    // Guardrail: no relevant knowledge found -> don't call the LLM, escalate.
    if (retrievedContext.length === 0) {
      const fallback =
        "I don't have enough information in our policy documentation to answer this confidently. " +
        "I'm escalating this to a specialist who can help — thank you for your patience."
      await logReply(conversation_id, latestMessage, [], fallback)
      return json({ reply: fallback, retrieved_context: [] })
    }

    // 3. Compute objective facts the model shouldn't have to infer itself
    //    (reduces date-math hallucinations)
    let daysSinceDelivery: number | null = null
    if (convo.order?.delivered_at) {
      const deliveredAt = new Date(convo.order.delivered_at).getTime()
      daysSinceDelivery = Math.floor((Date.now() - deliveredAt) / (1000 * 60 * 60 * 24))
    }

    // 4. Build a tightly-grounded prompt
    const systemPrompt = `You are a customer support reply assistant for the brand "${convo.brand.name}".
Write a short, empathetic, professional reply to the customer's message below.

STRICT RULES:
- Base every policy claim ONLY on the "KNOWLEDGE BASE CONTEXT" provided below. Never invent policy details.
- If the knowledge base does not clearly cover the customer's exact situation (e.g. their timeframe, their exact issue), do NOT promise a specific outcome (refund/replacement/etc). Instead, acknowledge the issue and say you will confirm eligibility / escalate to a specialist.
- Use the provided FACTS (like days since delivery) exactly as given — do not recalculate or guess dates.
- Keep the reply under 120 words.
- Do not mention that you are an AI.`

    const userPrompt = `KNOWLEDGE BASE CONTEXT:
${retrievedContext.map((c) => `- [${c.policy_type}] ${c.content}`).join('\n')}

FACTS:
- Order: ${convo.order?.order_number ?? 'unknown'} (${convo.order?.product_name ?? 'unknown product'})
- Days since delivery: ${daysSinceDelivery ?? 'unknown'}

CUSTOMER MESSAGE:
"${latestMessage}"

Write the reply now.`

    // 5. Call OpenRouter
    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 300,
      }),
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      return json({ error: `LLM call failed: ${errText}` }, 502)
    }

    const aiJson = await aiResponse.json()
    const reply = aiJson.choices?.[0]?.message?.content?.trim() ??
      "I'm having trouble generating a reply right now — please try again."

    // 6. Log everything
    await logReply(conversation_id, latestMessage, retrievedContext, reply)

    return json({ reply, retrieved_context: retrievedContext })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

// --- Helpers -------------------------------------------------------------

function retrieveRelevant(message: string, kbEntries: any[]) {
  // Lightweight keyword-overlap scoring so we don't just dump the whole KB
  // into the prompt. (In production this would be a vector search — see
  // architecture doc.) We always include entries scoring > 0, and if none
  // score, fall back to returning nothing (triggers the guardrail above).
  const msgWords = new Set(
    message.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 2)
  )

  const topicHints: Record<string, string[]> = {
    return: ['return', 'send back', 'broken', 'damaged', 'defective', 'exchange'],
    refund: ['refund', 'money back', 'broken', 'damaged', 'defective', 'reimburse'],
    shipping: ['shipping', 'delivery', 'deliver', 'late', 'tracking', 'arrive'],
    cancellation: ['cancel', 'cancellation', 'stop order'],
  }

  const scored = kbEntries.map((entry) => {
    const hints = topicHints[entry.policy_type] ?? []
    let score = 0
    for (const hint of hints) {
      if (message.toLowerCase().includes(hint)) score += 2
    }
    const contentWords = new Set(entry.content.toLowerCase().split(/\s+/))
    for (const w of msgWords) if (contentWords.has(w)) score += 1
    return { ...entry, score }
  })

  // "Broken bottle" scenario should surface return + refund policies.
  return scored.filter((e) => e.score > 0).sort((a, b) => b.score - a.score)
}

async function logReply(conversationId: string, customerMessage: string, context: any[], aiResponse: string) {
  await supabase.from('reply_logs').insert({
    conversation_id: conversationId,
    customer_message: customerMessage,
    retrieved_context: context,
    ai_generated_response: aiResponse,
    status: 'generated',
  })
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
