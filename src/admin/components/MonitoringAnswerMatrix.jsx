import React from 'react'

const CELL = {
  unanswered: { bg: '#f1f5f9', color: '#64748b', label: '—' },
  answered: { bg: '#fff8e1', color: '#f57f17', label: '?' },
  correct: { bg: '#e8f5e9', color: '#2e7d32', label: '✓' },
  wrong: { bg: '#ffebee', color: '#c62828', label: '✗' },
}

function cellStyle(status) {
  const s = CELL[status] || CELL.unanswered
  return s
}

export default function MonitoringAnswerMatrix({ participants = [] }) {
  const maxQ = participants.reduce((m, p) => Math.max(m, (p.questions || []).length), 0)
  if (!participants.length || maxQ === 0) {
    return (
      <div style={{ padding: 16, color: '#94a3b8', fontSize: 13 }}>Matritsa uchun ma’lumot yo‘q</div>
    )
  }

  const th = {
    padding: '8px 6px',
    fontSize: 11,
    fontWeight: 600,
    color: '#475569',
    borderBottom: '2px solid #e2e8f0',
    background: '#f8fafc',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: 600 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', minWidth: 140, left: 0, zIndex: 2 }}>Ishtirokchi</th>
            {Array.from({ length: maxQ }, (_, i) => (
              <th key={i} style={{ ...th, textAlign: 'center', minWidth: 52 }}>
                S{i + 1}
              </th>
            ))}
            <th style={{ ...th, textAlign: 'center' }}>%</th>
            <th style={{ ...th, textAlign: 'center' }}>Ch</th>
          </tr>
        </thead>
        <tbody>
          {participants.map((p) => {
            const cheating = p.cheatingSuspected || (p.tabViolations || 0) > 0
            const qs = p.questions || []
            return (
              <tr key={String(p.sessionId)} style={{ background: cheating ? '#fff5f5' : '#fff' }}>
                <td
                  style={{
                    padding: '8px 10px',
                    fontWeight: 600,
                    fontSize: 12,
                    borderBottom: '1px solid #f1f5f9',
                    position: 'sticky',
                    left: 0,
                    background: cheating ? '#fff5f5' : '#fff',
                    color: cheating ? '#b71c1c' : '#0f172a',
                  }}
                >
                  <div>{p.name}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>{p.email}</div>
                </td>
                {Array.from({ length: maxQ }, (_, i) => {
                  const q = qs[i]
                  if (!q) {
                    return (
                      <td
                        key={i}
                        style={{
                          padding: 4,
                          borderBottom: '1px solid #f1f5f9',
                          textAlign: 'center',
                        }}
                      />
                    )
                  }
                  const st = cellStyle(q.answerStatus)
                  const title = [
                    `Savol ${q.index}`,
                    q.prompt,
                    q.selectedAnswer ? `Tanlangan: ${q.selectedAnswer}` : 'Javobsiz',
                    q.correctAnswer ? `To‘g‘ri: ${q.correctAnswer}` : '',
                  ]
                    .filter(Boolean)
                    .join('\n')
                  return (
                    <td
                      key={i}
                      title={title}
                      style={{
                        padding: 4,
                        borderBottom: '1px solid #f1f5f9',
                        textAlign: 'center',
                        background: st.bg,
                        color: st.color,
                        fontWeight: 700,
                        cursor: 'help',
                      }}
                    >
                      {st.label}
                    </td>
                  )
                })}
                <td
                  style={{
                    padding: '8px 6px',
                    borderBottom: '1px solid #f1f5f9',
                    textAlign: 'center',
                    fontWeight: 600,
                  }}
                >
                  {p.progressPercent ?? 0}%
                </td>
                <td
                  style={{
                    padding: '8px 6px',
                    borderBottom: '1px solid #f1f5f9',
                    textAlign: 'center',
                    color: cheating ? '#c62828' : '#94a3b8',
                    fontWeight: cheating ? 700 : 400,
                  }}
                >
                  {cheating ? p.tabViolations : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ padding: '10px 12px', fontSize: 11, color: '#64748b', borderTop: '1px solid #f1f5f9' }}>
        ✓ to‘g‘ri · ✗ noto‘g‘ri · ? javob berilgan (tekshirilmagan) · — javobsiz · ustun ustiga — to‘liq matn
      </div>
    </div>
  )
}
