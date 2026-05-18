import React from 'react'

const Q_ROW = {
  unanswered: { bg: '#f8fafc', border: '#e2e8f0', label: 'Javobsiz', color: '#64748b' },
  answered: { bg: '#fff8e1', border: '#ffe082', label: 'Javob berilgan', color: '#f57f17' },
  correct: { bg: '#e8f5e9', border: '#a5d6a7', label: 'To‘g‘ri', color: '#2e7d32' },
  wrong: { bg: '#ffebee', border: '#ef9a9a', label: 'Noto‘g‘ri', color: '#c62828' },
}

function statusStyle(status) {
  return Q_ROW[status] || Q_ROW.unanswered
}

function segmentLabel(segments, segmentIndex) {
  if (!Array.isArray(segments) || !segments.length) return null
  const seg = segments.find((s) => s.segmentIndex === segmentIndex) || segments[segmentIndex]
  return seg?.topicName || (segmentIndex != null ? `Mavzu ${segmentIndex + 1}` : null)
}

export default function MonitoringQuestionsTable({
  questions = [],
  currentIndex = 0,
  status: sessionStatus,
  segments = [],
}) {
  if (!questions.length) {
    return <div style={{ padding: 12, color: '#94a3b8', fontSize: 13 }}>Savollar yo‘q</div>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
            <th style={th}>#</th>
            {segments?.length > 0 ? <th style={th}>Mavzu</th> : null}
            <th style={th}>Savol</th>
            <th style={th}>Variantlar / tanlangan</th>
            <th style={th}>Holat</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => {
            const st = statusStyle(q.answerStatus)
            const isCurrent =
              sessionStatus === 'in_progress' && q.index - 1 === currentIndex
            return (
              <tr
                key={`${q.index}-${q.questionId}`}
                style={{
                  background: st.bg,
                  borderBottom: `1px solid ${st.border}`,
                  outline: isCurrent ? '2px solid #1565c0' : 'none',
                }}
              >
                <td style={td}>{q.index}</td>
                {segments?.length > 0 ? (
                  <td style={{ ...td, fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
                    {segmentLabel(segments, q.segmentIndex) || '—'}
                  </td>
                ) : null}
                <td style={{ ...td, maxWidth: 320 }}>{q.prompt}</td>
                <td style={td}>
                  <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc' }}>
                    {(q.options || []).map((opt, oi) => {
                      const selected = q.selectedAnswer === opt
                      const isCorrectOpt = q.correctAnswer === opt
                      let color = '#334155'
                      if (selected && q.answerStatus === 'wrong') color = '#c62828'
                      if (selected && q.answerStatus === 'correct') color = '#2e7d32'
                      if (!selected && isCorrectOpt && q.answerStatus === 'wrong') color = '#1565c0'
                      return (
                        <li
                          key={oi}
                          style={{
                            fontWeight: selected ? 700 : 400,
                            color,
                            textDecoration: selected ? 'underline' : 'none',
                          }}
                        >
                          {opt}
                          {selected ? ' ✓' : ''}
                          {!selected && isCorrectOpt ? ' (to‘g‘ri)' : ''}
                        </li>
                      )
                    })}
                  </ul>
                  {q.selectedAnswer ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                      Tanlangan: <strong>{q.selectedAnswer}</strong>
                    </div>
                  ) : null}
                </td>
                <td style={td}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: '#fff',
                      color: st.color,
                      border: `1px solid ${st.border}`,
                    }}
                  >
                    {isCurrent ? 'Joriy savol · ' : ''}
                    {st.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const th = { padding: '8px 10px', fontWeight: 600, color: '#475569', fontSize: 12 }
const td = { padding: '10px', verticalAlign: 'top', color: '#0f172a' }
