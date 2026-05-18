import React, { useEffect, useMemo, useState } from 'react'
import { ApiClient, useNotice } from 'adminjs'
import { Box, Button, H2, Text } from '@adminjs/design-system'
import MonitoringQuestionsTable from './MonitoringQuestionsTable.jsx'

function adminBase() {
  if (typeof window === 'undefined') return '/admin'
  const m = window.location.pathname.match(/^(.*\/admin)/)
  return m ? m[1] : '/admin'
}

const S = {
  page: { maxWidth: 1100, margin: '0 auto' },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 20,
  },
  infoCard: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 20,
    padding: '14px 18px',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    marginBottom: 20,
  },
  pill: (bg, color) => ({
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    background: bg,
    color,
  }),
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
    padding: '10px 14px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
  },
  card: (variant) => ({
    border: `1px solid ${variant === 'blocked' ? '#ffcdd2' : variant === 'warn' ? '#ffe0b2' : '#e2e8f0'}`,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    background: variant === 'blocked' ? '#fff5f5' : variant === 'warn' ? '#fffbf0' : '#fff',
    boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  }),
  cardTop: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottom: '1px solid #f1f5f9',
  },
  name: { fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 },
  email: { fontSize: 13, color: '#64748b', marginTop: 4, wordBreak: 'break-all' },
  badges: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12,
  },
  metricBox: {
    padding: '10px 12px',
    background: '#f8fafc',
    borderRadius: 8,
    border: '1px solid #f1f5f9',
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: 6,
  },
  metricValue: { fontSize: 15, fontWeight: 600, color: '#0f172a' },
  barTrack: { height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  barFill: (pct, color) => ({ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }),
  hint: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  dates: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid #f1f5f9',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 20,
    fontSize: 12,
    color: '#64748b',
  },
  actions: { marginTop: 14, display: 'flex', justifyContent: 'flex-end' },
  empty: {
    textAlign: 'center',
    padding: 40,
    color: '#94a3b8',
    border: '1px dashed #e2e8f0',
    borderRadius: 10,
  },
}

function fmtDateShort(v) {
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

function PercentBar({ percent, color = '#1565c0' }) {
  const v = Math.min(100, Math.max(0, Number(percent) || 0))
  return (
    <div>
      <div style={S.metricValue}>{v}%</div>
      <div style={S.barTrack}>
        <div style={S.barFill(v, color)} />
      </div>
    </div>
  )
}

function Badge({ children, bg, color }) {
  return <span style={S.pill(bg, color)}>{children}</span>
}

function RowActions({ row, companyId, onDone, loading }) {
  const notice = useNotice()

  const post = async (path, body) => {
    const res = await fetch(`${adminBase()}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j = await res.json()
    if (!j.ok) throw new Error(j.message || 'Xatolik')
    return j
  }

  const runBlock = async () => {
    if (!row.userId) {
      notice({ message: 'Foydalanuvchi ID topilmadi', type: 'error' })
      return
    }
    try {
      const j = await post('/custom/company/participants/block', {
        userId: String(row.userId),
        companyId: companyId || undefined,
        reason: 'Testda qoida buzish',
      })
      notice({ message: j.message || 'Bloklandi', type: 'success' })
      await onDone()
    } catch (e) {
      notice({ message: e.message || 'Xatolik', type: 'error' })
    }
  }

  const runUnblock = async () => {
    if (!row.userId) {
      notice({ message: 'Foydalanuvchi ID topilmadi', type: 'error' })
      return
    }
    try {
      const j = await post('/custom/company/participants/unblock', {
        userId: String(row.userId),
        companyId: companyId || undefined,
      })
      notice({ message: j.message || 'Blok ochildi', type: 'success' })
      await onDone()
    } catch (e) {
      notice({ message: e.message || 'Xatolik', type: 'error' })
    }
  }

  if (row.isBlocked) {
    return (
      <Button size="sm" variant="secondary" disabled={loading} onClick={runUnblock}>
        Blokdan ochish
      </Button>
    )
  }

  return (
    <Button
      size="sm"
      variant="danger"
      disabled={loading}
      onClick={() => {
        if (!window.confirm(`${row.name} — kompaniya testlaridan bloklansinmi?`)) return
        runBlock()
      }}
    >
      Bloklash
    </Button>
  )
}

function ParticipantCard({ row, companyId, loading, onDone }) {
  const variant = row.isBlocked ? 'blocked' : row.tabViolations > 0 ? 'warn' : 'default'
  const finished = row.status === 'finished'
  const resultPct = row.correctPercent != null ? row.correctPercent : finished ? 0 : null
  const cheating = (row.tabViolations || 0) > 0
  const [showQuestions, setShowQuestions] = useState(cheating)

  return (
    <div
      style={{
        ...S.card(variant),
        ...(cheating ? { border: '2px solid #c62828', background: '#fff5f5' } : {}),
      }}
    >
      <div style={S.cardTop}>
        <div>
          <p style={S.name}>{row.name}</p>
          <p style={S.email}>{row.email}</p>
        </div>
        <div style={S.badges}>
          <Badge bg={finished ? '#e8f5e9' : '#e3f2fd'} color={finished ? '#2e7d32' : '#1565c0'}>
            {finished ? 'Tugallangan' : 'Jarayonda'}
          </Badge>
          {cheating ? (
            <Badge bg="#ffcdd2" color="#c62828">
              CHEATING: {row.tabViolations}
            </Badge>
          ) : (
            <Badge bg="#f1f5f9" color="#94a3b8">
              Cheating yo‘q
            </Badge>
          )}
          {row.isBlocked ? (
            <Badge bg="#ffebee" color="#c62828">
              Bloklangan
            </Badge>
          ) : null}
        </div>
      </div>

      <div style={S.metrics}>
        <div style={S.metricBox}>
          <div style={S.metricLabel}>Jarayon</div>
          <PercentBar percent={row.progressPercent} color={finished ? '#2e7d32' : '#1565c0'} />
          <div style={S.hint}>Javob berilgan savollar %</div>
        </div>

        <div style={S.metricBox}>
          <div style={S.metricLabel}>Natija (to‘g‘ri)</div>
          {resultPct != null ? <PercentBar percent={resultPct} color="#2e7d32" /> : <div style={S.metricValue}>—</div>}
          <div style={S.hint}>Tugagandan keyin</div>
        </div>

        <div style={S.metricBox}>
          <div style={S.metricLabel}>Ball</div>
          <div style={S.metricValue}>
            {row.total != null && row.total > 0 ? `${row.score} / ${row.total}` : '—'}
          </div>
          <div style={S.hint}>To‘g‘ri / jami savol</div>
        </div>
      </div>

      <div style={S.dates}>
        <span>
          <strong>Boshlangan:</strong> {fmtDateShort(row.startedAt)}
        </span>
        <span>
          <strong>Tugagan:</strong> {fmtDateShort(row.finishedAt)}
        </span>
      </div>

      {Array.isArray(row.questions) && row.questions.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <Button size="sm" variant="text" onClick={() => setShowQuestions((v) => !v)}>
            {showQuestions ? 'Savollarni yashirish' : 'Barcha savollar va javoblar'}
          </Button>
          {showQuestions ? (
            <div style={{ marginTop: 10 }}>
              <MonitoringQuestionsTable
                questions={row.questions}
                currentIndex={row.currentIndex}
                status={row.status}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={S.actions}>
        <RowActions row={row} companyId={companyId} loading={loading} onDone={onDone} />
      </div>
    </div>
  )
}

export default function TopicInviteMonitor(props) {
  const notice = useNotice()
  const api = useMemo(() => new ApiClient(), [])
  const recordId = props?.record?.id
  const meta = props?.meta || props?.data?.meta || {}
  const [rows, setRows] = useState(Array.isArray(meta.rows) ? meta.rows : [])
  const [closedAt, setClosedAt] = useState(meta.closedAt ?? null)
  const [testStatus, setTestStatus] = useState(meta.testStatus || '')
  const [code, setCode] = useState(meta.code || '')
  const [loading, setLoading] = useState(false)
  const [onlySuspicious, setOnlySuspicious] = useState(false)
  const companyId = meta.companyId || ''

  const load = async () => {
    if (!recordId) return
    setLoading(true)
    try {
      const res = await api.recordAction({
        resourceId: props.resource.id,
        recordId,
        actionName: props.action.name,
        data: { refresh: true },
      })
      const m = res?.data?.meta
      if (m?.rows) setRows(m.rows)
      if (m && 'closedAt' in m) setClosedAt(m.closedAt)
      if (m?.testStatus) setTestStatus(m.testStatus)
      if (m?.code) setCode(m.code)
      if (res?.data?.notice) notice(res.data.notice)
    } catch (e) {
      notice({ message: e?.message || 'Yuklashda xatolik', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setRows(Array.isArray(meta.rows) ? meta.rows : [])
    setClosedAt(meta.closedAt ?? null)
    setTestStatus(meta.testStatus || '')
    setCode(meta.code || '')
  }, [recordId, meta.rows, meta.closedAt, meta.testStatus, meta.code])

  const statusLabel = testStatus || (closedAt ? 'Tugatilgan' : 'Davom etmoqda')
  const isOpen = !closedAt
  const visibleRows = onlySuspicious ? rows.filter((r) => (r.tabViolations || 0) > 0) : rows

  const stats = useMemo(() => {
    const finished = rows.filter((r) => r.status === 'finished').length
    const inProgress = rows.filter((r) => r.status === 'in_progress').length
    const suspicious = rows.filter((r) => (r.tabViolations || 0) > 0).length
    return { finished, inProgress, suspicious, total: rows.length }
  }, [rows])

  return (
    <Box variant="white" style={S.page}>
      <div style={S.header}>
        <div>
          <H2 marginBottom="sm">Ishtirokchilar monitoringi</H2>
          <Text fontSize="sm" color="grey60">
            Har bir karta — bitta foydalanuvchining oxirgi urinishi
          </Text>
        </div>
        <Button variant="primary" size="sm" onClick={load} disabled={loading}>
          {loading ? 'Yuklanmoqda…' : 'Yangilash'}
        </Button>
      </div>

      <div style={S.infoCard}>
        <div>
          <Text fontSize="sm" color="grey60" marginBottom="xs">
            Kirish kodi
          </Text>
          <Text fontWeight="bold" fontSize="lg">
            {code || '—'}
          </Text>
        </div>
        <div>
          <Text fontSize="sm" color="grey60" marginBottom="xs">
            Test holati
          </Text>
          <Badge bg={isOpen ? '#e8f5e9' : '#ffebee'} color={isOpen ? '#2e7d32' : '#c62828'}>
            {statusLabel}
          </Badge>
        </div>
        {closedAt ? (
          <div>
            <Text fontSize="sm" color="grey60" marginBottom="xs">
              Yopilgan
            </Text>
            <Text fontSize="sm">{fmtDateShort(closedAt)}</Text>
          </div>
        ) : null}
        <div>
          <Text fontSize="sm" color="grey60" marginBottom="xs">
            Ishtirokchilar
          </Text>
          <Text fontWeight="bold">
            {stats.total} ta ({stats.finished} tugagan, {stats.inProgress} jarayonda)
          </Text>
        </div>
        {stats.suspicious > 0 ? (
          <div>
            <Text fontSize="sm" color="grey60" marginBottom="xs">
              Shubhali
            </Text>
            <Badge bg="#fff3e0" color="#e65100">
              {stats.suspicious} ta
            </Badge>
          </div>
        ) : null}
      </div>

      <div style={S.toolbar}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            fontSize: 14,
            color: '#334155',
          }}
        >
          <input
            type="checkbox"
            checked={onlySuspicious}
            onChange={(e) => setOnlySuspicious(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          Faqat shubhali (ekrandan chiqish)
        </label>
        <Text fontSize="sm" color="grey60">
          Ko‘rsatilmoqda: <strong>{visibleRows.length}</strong> / {rows.length}
        </Text>
      </div>

      {visibleRows.length === 0 ? (
        <div style={S.empty}>Hali ishtirokchilar yo‘q yoki filtr bo‘yicha topilmadi.</div>
      ) : (
        visibleRows.map((r) => (
          <ParticipantCard
            key={String(r.sessionId)}
            row={r}
            companyId={companyId}
            loading={loading}
            onDone={load}
          />
        ))
      )}
    </Box>
  )
}
