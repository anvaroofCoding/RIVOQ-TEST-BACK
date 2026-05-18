import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useCurrentAdmin, useNotice } from 'adminjs'
import { Box, Button, H2, Icon, Text } from '@adminjs/design-system'

function adminBase() {
  if (typeof window === 'undefined') return '/admin'
  const m = window.location.pathname.match(/^(.*\/admin)/)
  return m ? m[1] : '/admin'
}

const spinCss = `
@keyframes habar-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`

function RefreshBtn({ onClick, loading }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="primary"
      disabled={loading}
      onClick={onClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
    >
      <span style={{ display: 'inline-flex', animation: loading ? 'habar-spin 0.8s linear infinite' : 'none' }}>
        <Icon icon="RefreshCw" />
      </span>
      {loading ? 'Yuklanmoqda…' : 'Yangilash'}
    </Button>
  )
}

export default function HabarPage() {
  const notice = useNotice()
  const currentAdmin = useCurrentAdmin()
  const isCompany = currentAdmin?.role === 'company'

  const [recipients, setRecipients] = useState([])
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const selectedRef = useRef(selectedIds)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  const syncRef = (set) => {
    selectedRef.current = set
    setSelectedIds(set)
  }

  const loadRecipients = useCallback(async () => {
    const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
    const res = await fetch(`${adminBase()}/custom/habar/recipients${q}`, { credentials: 'include' })
    const j = await res.json()
    if (!j.ok) throw new Error(j.message || 'Yuklashda xatolik')
    const list = j.recipients || []
    setRecipients(list)
    const valid = new Set(list.map((r) => String(r.id)))
    const next = new Set([...selectedRef.current].filter((id) => valid.has(id)))
    syncRef(next)
    return j
  }, [search])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      await loadRecipients()
    } catch (e) {
      notice({ message: e.message || 'Xatolik', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [loadRecipients, notice])

  useEffect(() => {
    refresh()
  }, [])

  const selectedCount = selectedIds.size
  const allSelected = recipients.length > 0 && selectedCount === recipients.length

  const isSelected = (id) => selectedIds.has(String(id))

  const toggleOne = (id) => {
    const sid = String(id || '').trim()
    if (!sid) return
    const next = new Set(selectedRef.current)
    if (next.has(sid)) next.delete(sid)
    else next.add(sid)
    syncRef(next)
  }

  const toggleAll = () => {
    if (allSelected) {
      syncRef(new Set())
      return
    }
    syncRef(new Set(recipients.map((r) => String(r.id)).filter(Boolean)))
  }

  const getSelectedArray = () => [...selectedRef.current]

  const doSend = async () => {
    const ids = getSelectedArray()
    if (!ids.length) {
      notice({ message: 'Kamida bitta foydalanuvchi tanlang', type: 'error' })
      return
    }
    if (!title.trim() || !body.trim()) {
      notice({ message: 'Sarlavha va matn to‘ldiring', type: 'error' })
      return
    }
    if (!window.confirm(`${ids.length} ta foydalanuvchiga xabar yuborilsinmi?`)) return

    setSending(true)
    try {
      const res = await fetch(`${adminBase()}/custom/habar/send`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: ids,
          title: title.trim(),
          body: body.trim(),
        }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.message || 'Xatolik')
      notice({ message: j.message || 'Yuborildi', type: 'success' })
      setTitle('')
      setBody('')
      syncRef(new Set())
    } catch (err) {
      notice({ message: err.message || 'Xatolik', type: 'error' })
    } finally {
      setSending(false)
    }
  }

  const th = {
    padding: '10px 8px',
    fontWeight: 600,
    fontSize: 12,
    color: '#475569',
    textAlign: 'left',
    borderBottom: '2px solid #e2e8f0',
    background: '#f8fafc',
  }
  const td = { padding: '10px 8px', fontSize: 13, borderBottom: '1px solid #f1f5f9' }

  return (
    <Box variant="white" style={{ width: '100%', padding: '12px 20px 40px', boxSizing: 'border-box' }}>
      <style>{spinCss}</style>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <H2 marginBottom="sm">Habar</H2>
          <Text fontSize="sm" color="grey60">
            {isCompany
              ? 'Faqat sizning testlaringizda qatnashgan foydalanuvchilarga xabar'
              : 'Istalgan foydalanuvchiga xabar yuborish'}
          </Text>
        </div>
        <RefreshBtn onClick={refresh} loading={loading} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <Text fontSize="sm" color="grey60" marginBottom="xs">
            Sarlavha
          </Text>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Masalan: Yangi test e’lon qilindi"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <Text fontSize="sm" color="grey60" marginBottom="xs">
            Matn
          </Text>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Xabar matni…"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              fontSize: 14,
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 8, flex: '1 1 280px', alignItems: 'center' }}>
          <Icon icon="Search" />
          <input
            type="search"
            placeholder="Ism yoki email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                refresh()
              }
            }}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              fontSize: 14,
            }}
          />
          <Button type="button" size="sm" variant="text" disabled={loading} onClick={refresh}>
            Qidirish
          </Button>
        </div>
        <Text fontSize="sm" color="grey60">
          Tanlangan: <strong>{selectedCount}</strong> / {recipients.length}
        </Text>
        <Button
          type="button"
          variant="primary"
          disabled={sending || selectedCount === 0}
          onClick={doSend}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Icon icon="Send" />
          {sending ? 'Yuborilmoqda…' : 'Yuborish'}
        </Button>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, opacity: loading ? 0.6 : 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 44 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Hammasini tanlash"
                />
              </th>
              <th style={th}>Ism</th>
              <th style={th}>Email</th>
            </tr>
          </thead>
          <tbody>
            {recipients.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>
                  {loading ? 'Yuklanmoqda…' : 'Foydalanuvchilar topilmadi'}
                </td>
              </tr>
            ) : (
              recipients.map((r) => {
                const rid = String(r.id)
                const checked = isSelected(rid)
                return (
                  <tr
                    key={rid}
                    style={{ background: checked ? '#e3f2fd' : '#fff', cursor: 'pointer' }}
                    onClick={() => toggleOne(rid)}
                  >
                    <td style={td}>
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        tabIndex={-1}
                        aria-label={`Tanlash: ${r.name}`}
                        style={{ pointerEvents: 'none' }}
                      />
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                    <td style={td}>{r.email}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </Box>
  )
}
