import React from 'react'
import { Button, Icon, Text } from '@adminjs/design-system'
import MonitoringQuestionsTable from './MonitoringQuestionsTable.jsx'
import MonitoringCheatingBadge from './MonitoringCheatingBadge.jsx'

function fmtDate(v) {
  if (!v) return '—'
  try {
    const d = new Date(v)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = d.getFullYear()
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${dd}.${mm}.${yy} ${hh}:${mi}`
  } catch {
    return String(v)
  }
}

export default function MonitoringUserDetail({ row, loading, onBack }) {
  if (loading && !row) {
    return <Text color="grey60">Yuklanmoqda…</Text>
  }
  if (!row) return null

  const cheating = row.cheatingSuspected || (row.tabViolations || 0) > 0

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <Button
          size="sm"
          variant="text"
          onClick={onBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Icon icon="ChevronLeft" />
          Orqaga
        </Button>
        <Text fontWeight="bold" fontSize="lg" style={{ color: cheating ? '#b71c1c' : '#0f172a' }}>
          {row.name}
        </Text>
        <MonitoringCheatingBadge cheating={cheating} violations={row.tabViolations || 0} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 20,
          padding: 14,
          background: cheating ? '#fff5f5' : '#f8fafc',
          borderRadius: 10,
          border: `1px solid ${cheating ? '#ef9a9a' : '#e2e8f0'}`,
        }}
      >
        <div>
          <Text fontSize="sm" color="grey60">
            Email
          </Text>
          <Text fontWeight="bold">{row.email}</Text>
        </div>
        <div>
          <Text fontSize="sm" color="grey60">
            Tel
          </Text>
          <Text fontWeight="bold">{row.phone || '—'}</Text>
        </div>
        <div>
          <Text fontSize="sm" color="grey60">
            Mavzu
          </Text>
          <Text fontWeight="bold">{row.topicName || '—'}</Text>
        </div>
        <div>
          <Text fontSize="sm" color="grey60">
            Holat
          </Text>
          <Text fontWeight="bold">{row.status === 'finished' ? 'Tugagan' : 'Jarayonda'}</Text>
        </div>
        <div>
          <Text fontSize="sm" color="grey60">
            Cheating
          </Text>
          <div style={{ marginTop: 4 }}>
            <MonitoringCheatingBadge cheating={cheating} violations={row.tabViolations || 0} />
          </div>
        </div>
        <div>
          <Text fontSize="sm" color="grey60">
            Progress
          </Text>
          <Text fontWeight="bold">
            {row.progressPercent}% ({row.answeredCount}/{row.total})
          </Text>
        </div>
        <div>
          <Text fontSize="sm" color="grey60">
            To‘g‘ri / noto‘g‘ri / javobsiz
          </Text>
          <Text fontWeight="bold">
            <span style={{ color: '#2e7d32' }}>{row.correctCount}</span> /{' '}
            <span style={{ color: '#c62828' }}>{row.wrongCount}</span> /{' '}
            <span style={{ color: '#64748b' }}>{row.unansweredCount}</span>
          </Text>
        </div>
        <div>
          <Text fontSize="sm" color="grey60">
            Ball
          </Text>
          <Text fontWeight="bold">
            {row.correctPercent != null ? `${row.correctPercent}% (${row.score}/${row.total})` : '—'}
          </Text>
        </div>
        <div>
          <Text fontSize="sm" color="grey60">
            Vaqt
          </Text>
          <Text fontWeight="bold">{row.durationLabel || '—'}</Text>
        </div>
        <div>
          <Text fontSize="sm" color="grey60">
            Boshlangan
          </Text>
          <Text fontSize="sm">{fmtDate(row.startedAt)}</Text>
        </div>
        <div>
          <Text fontSize="sm" color="grey60">
            Tugagan
          </Text>
          <Text fontSize="sm">{fmtDate(row.finishedAt)}</Text>
        </div>
      </div>

      <Text fontWeight="bold" marginBottom="sm">
        Barcha savollar va javoblar
      </Text>
      <MonitoringQuestionsTable
        questions={row.questions || []}
        currentIndex={row.currentIndex}
        status={row.status}
        segments={row.segments}
      />
    </div>
  )
}
