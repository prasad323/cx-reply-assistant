import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function ReplyPanel({ conversation }) {
  const [reply, setReply] = useState('')
  const [retrievedContext, setRetrievedContext] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null) // 'generated' | 'approved' | null
  const [error, setError] = useState(null)

  async function generateReply() {
    setLoading(true)
    setError(null)
    setStatus(null)
    try {
      const { data, error } = await supabase.functions.invoke('generate-reply', {
        body: { conversation_id: conversation.id },
      })
      if (error) throw error
      setReply(data.reply)
      setRetrievedContext(data.retrieved_context || [])
      setStatus('generated')
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function approve() {
  
    await supabase.functions.invoke('generate-reply', {
      body: {
        conversation_id: conversation.id,
        action: 'approve',
        final_response: reply,
      },
    })
    setStatus('approved')
  }

  return (
    <div style={styles.card}>
      <h3 style={styles.sectionTitle}>AI Reply Assistant</h3>

      <button style={styles.primaryBtn} onClick={generateReply} disabled={loading}>
        {loading ? 'Generating…' : reply ? 'Regenerate' : 'Generate Reply'}
      </button>

      {error && <div style={styles.error}>Error: {error}</div>}

      {reply && (
        <>
          <textarea
            style={styles.textarea}
            value={reply}
            onChange={(e) => {
              setReply(e.target.value)
              setStatus('generated')
            }}
            rows={6}
          />

          <div style={styles.actions}>
            <button style={styles.secondaryBtn} onClick={generateReply} disabled={loading}>
              Regenerate
            </button>
            <button style={styles.approveBtn} onClick={approve} disabled={status === 'approved'}>
              {status === 'approved' ? 'Approved ✓' : 'Approve'}
            </button>
          </div>

          {retrievedContext.length > 0 && (
            <details style={styles.details}>
              <summary>Retrieved knowledge base context used</summary>
              <ul>
                {retrievedContext.map((c, i) => (
                  <li key={i}>
                    <strong>{c.policy_type}:</strong> {c.content}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}

const styles = {
  card: { border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  sectionTitle: { marginTop: 0, fontSize: 14, color: '#333' },
  primaryBtn: { background: '#2563eb', color: 'white', border: 'none', padding: '10px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  secondaryBtn: { background: '#f3f4f6', border: '1px solid #d1d5db', padding: '8px 12px', borderRadius: 6, cursor: 'pointer' },
  approveBtn: { background: '#16a34a', color: 'white', border: 'none', padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  actions: { display: 'flex', gap: 8 },
  textarea: { width: '100%', padding: 10, borderRadius: 6, border: '1px solid #d1d5db', fontFamily: 'inherit', fontSize: 14 },
  error: { color: '#dc2626', fontSize: 13 },
  details: { fontSize: 13, color: '#444', background: '#fafafa', padding: 8, borderRadius: 6 },
}
