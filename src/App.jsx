import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import ConversationView from './components/ConversationView'
import ReplyPanel from './components/ReplyPanel'

export default function App() {
  const [conversation, setConversation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadConversation()
  }, [])

  async function loadConversation() {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('conversations')
      .select(`
        id,
        brand:brands ( id, name ),
        customer:customers ( id, name ),
        order:orders ( id, order_number, delivered_at, product_name ),
        messages ( id, sender, content, created_at )
      `)
      .order('created_at', { ascending: true, foreignTable: 'messages' })
      .limit(1)
      .single()

    if (error) {
      setError(error.message)
    } else {
      setConversation(data)
    }
    setLoading(false)
  }

  if (loading) return <div style={styles.center}>Loading conversation…</div>
  if (error) return <div style={styles.center}>Error: {error}</div>
  if (!conversation) return <div style={styles.center}>No conversation found. Did you run schema.sql?</div>

  return (
    <div style={styles.app}>
      <h1 style={styles.title}>CX Reply Assistant</h1>
      <div style={styles.layout}>
        <ConversationView conversation={conversation} />
        <ReplyPanel conversation={conversation} />
      </div>
    </div>
  )
}

const styles = {
  app: { fontFamily: 'system-ui, sans-serif', maxWidth: 1000, margin: '0 auto', padding: 24 },
  title: { fontSize: 22, marginBottom: 16 },
  layout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 },
  center: { display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' },
}
