import React from 'react'
import MonitoringCheatingBadge from './MonitoringCheatingBadge.jsx'

const th = {
  padding: '12px 10px',
  fontWeight: 600,
  fontSize: 12,
  color: '#475569',
  textAlign: 'left',
  borderBottom: '2px solid #e2e8f0',
  background: '#f8fafc',
}

const td = {
  padding: '12px 10px',
  fontSize: 13,
  borderBottom: '1px solid #f1f5f9',
}

function StatusBadge({ status }) {
  const finished = status === 'finished'
  return (
    <span
      style={{
        padding: '3px 8px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        background: finished ? '#e8f5e9' : '#e3f2fd',
        color: finished ? '#2e7d32' : '#1565c0',
      }}
    >
      {finished ? 'Tugagan' : 'Jarayonda'}
    </span>
  )
}

/** Foydalanuvchilar ro‘yxati — qator bosilganda detail ochiladi */
export default function MonitoringParticipantsTable({ rows = [], onSelect, loading = false }) {
  if (!rows.length && !loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
        Foydalanuvchilar topilmadi
      </div>
    )
  }

  return (
    <div
      style={{
        overflowX: 'auto',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        opacity: loading ? 0.65 : 1,
        pointerEvents: loading ? 'none' : 'auto',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>#</th>
            <th style={th}>Ism</th>
            <th style={th}>Email</th>
            <th style={th}>Holat</th>
            <th style={th}>Progress</th>
            <th style={th}>Cheating</th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const cheating = row.cheatingSuspected || (row.tabViolations || 0) > 0
            return (
              <tr
                key={String(row.sessionId)}
                onClick={() => onSelect?.(row)}
                style={{
                  background: cheating ? '#fff5f5' : '#fff',
                  cursor: 'pointer',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelect?.(row)
                }}
                tabIndex={0}
                role="button"
              >
                <td style={td}>{i + 1}</td>
                <td style={{ ...td, fontWeight: 600, color: cheating ? '#b71c1c' : '#0f172a' }}>
                  {row.name}
                </td>
                <td style={td}>{row.email}</td>
                <td style={td}>
                  <StatusBadge status={row.status} />
                </td>
                <td style={td}>
                  <strong>{row.progressPercent ?? 0}%</strong>
                  <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 6 }}>
                    ({row.answeredCount}/{row.total})
                  </span>
                </td>
                <td style={td} onClick={(e) => e.stopPropagation()}>
                  <MonitoringCheatingBadge
                    cheating={cheating}
                    violations={row.tabViolations || 0}
                    size="sm"
                  />
                </td>
                <td style={{ ...td, color: '#1565c0', fontWeight: 600 }}>Ko‘rish →</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
