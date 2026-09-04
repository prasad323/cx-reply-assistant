export default function ConversationView({ conversation }) {
  const { brand, customer, order, messages } = conversation
  const latest = messages[messages.length - 1]

  return (
    <div style={styles.card}>
      <div style={styles.row}>
        <span style={styles.label}>Customer</span>
        <span>{customer.name}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>Brand</span>
        <span>{brand.name}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>Order</span>
        <span>
          {order.order_number} — {order.product_name}
          <br />
          Delivered: {new Date(order.delivered_at).toLocaleDateString()}
        </span>
      </div>

      <h3 style={styles.sectionTitle}>Conversation history</h3>
      <div style={styles.thread}>
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              ...styles.bubble,
              alignSelf: m.sender === 'customer' ? 'flex-start' : 'flex-end',
              background: m.sender === 'customer' ? '#f1f1f1' : '#dbeafe',
            }}
          >
            <div style={styles.sender}>{m.sender}</div>
            <div>{m.content}</div>
          </div>
        ))}
      </div>

      <h3 style={styles.sectionTitle}>Latest customer message</h3>
      <div style={styles.latest}>{latest.content}</div>
    </div>
  )
}

const styles = {
  card: { border: '1px solid #e5e5e5', borderRadius: 8, padding: 16 },
  row: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f2f2f2' },
  label: { color: '#666', fontWeight: 600 },
  sectionTitle: { marginTop: 16, marginBottom: 8, fontSize: 14, color: '#333' },
  thread: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' },
  bubble: { padding: '8px 12px', borderRadius: 10, maxWidth: '80%' },
  sender: { fontSize: 11, textTransform: 'uppercase', color: '#888', marginBottom: 2 },
  latest: { padding: 10, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, fontWeight: 500 },
}
