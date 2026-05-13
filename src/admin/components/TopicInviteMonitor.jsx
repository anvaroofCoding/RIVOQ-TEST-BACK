import React, { useEffect, useMemo, useState } from 'react'
import { ApiClient, useNotice } from 'adminjs'
import { Box, Button, H2, Text } from '@adminjs/design-system'

function fmtDate(v) {
  if (!v) return '—'
  try {
    return new Date(v).toLocaleString('uz-UZ')
  } catch {
    return String(v)
  }
}

function MiniBar({ percent, variant }) {
  const v = Math.min(100, Math.max(0, Number(percent) || 0))
  const fill = variant === 'success' ? '#2e7d32' : '#1565c0'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
      <div
        title={`${v}%`}
        style={{
          width: 72,
          height: 8,
          background: '#eceff1',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${v}%`, height: '100%', background: fill, transition: 'width 0.2s ease' }} />
      </div>
      <span style={{ minWidth: 44, textAlign: 'right' }}>{v}%</span>
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
  const [loading, setLoading] = useState(false)

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
  }, [recordId, meta.rows, meta.closedAt])

  const statusLabel = closedAt ? 'Tugatilgan (yangi kod yaratilmaguncha mobil kirish yoq)' : 'Ochiq'

  return (
    <Box variant="white">
      <Box display="flex" flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap">
        <H2>Ishtirokchilar va natijalar</H2>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          {loading ? 'Yuklanmoqda…' : 'Yangilash'}
        </Button>
      </Box>

      <Text mt="default" mb="default">
        <strong>Holat:</strong> {statusLabel}
        {closedAt ? (
          <span>
            {' '}
            · <strong>Yopilgan:</strong> {fmtDate(closedAt)}
          </span>
        ) : null}
      </Text>
      <Text mb="xl" color="grey60" fontSize="sm">
        Har bir foydalanuvchi uchun oxirgi urinish ko‘rsatiladi. Jarayonda — javob bergan savollar foizi; tugallangan —
        to‘g‘ri javoblar foizi va ball.
      </Text>

      {rows.length === 0 ? (
        <Text color="grey60">Hali ishtirokchilar yo‘q.</Text>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px' }}>Foydalanuvchi</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px' }}>Email</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px' }}>Holat</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '8px' }}>Jarayon %</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '8px' }}>Natija %</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '8px' }}>Ball</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px' }}>Boshlangan</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px' }}>Tugagan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.sessionId)}>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px' }}>{r.name}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px' }}>{r.email}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px' }}>
                    {r.status === 'finished' ? 'Tugallangan' : 'Jarayonda'}
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px' }}>
                    <MiniBar
                      percent={r.progressPercent}
                      variant={r.status === 'finished' ? 'success' : 'default'}
                    />
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px' }}>
                    {r.correctPercent != null ? (
                      <MiniBar percent={r.correctPercent} variant="success" />
                    ) : (
                      <div style={{ textAlign: 'right', color: '#9e9e9e' }}>—</div>
                    )}
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px', textAlign: 'right' }}>
                    {r.total ? `${r.score}/${r.total}` : '—'}
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px' }}>{fmtDate(r.startedAt)}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px' }}>{fmtDate(r.finishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Box>
  )
}
