import React, { useCallback, useEffect, useState } from 'react'
import { useNotice } from 'adminjs'
import { Box, Button, H2, Icon, Text } from '@adminjs/design-system'
import MonitoringParticipantsTable from './MonitoringParticipantsTable.jsx'
import MonitoringUserDetail from './MonitoringUserDetail.jsx'

function adminBase() {
  if (typeof window === 'undefined') return '/admin'
  const m = window.location.pathname.match(/^(.*\/admin)/)
  return m ? m[1] : '/admin'
}

const spinKeyframes = `
@keyframes monitoring-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`

function RefreshButton({ onClick, loading, label = 'Yangilash' }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="primary"
      onClick={onClick}
      disabled={loading}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
    >
      <span
        style={{
          display: 'inline-flex',
          animation: loading ? 'monitoring-spin 0.8s linear infinite' : 'none',
        }}
      >
        <Icon icon="RefreshCw" />
      </span>
      {loading ? 'Yuklanmoqda…' : label}
    </Button>
  )
}

export default function TestMonitoringPage() {
  const notice = useNotice()
  const [list, setList] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [listLoading, setListLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadList = useCallback(async () => {
    const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
    const res = await fetch(`${adminBase()}/custom/monitoring/participants${q}`, {
      credentials: 'include',
    })
    const j = await res.json()
    if (!j.ok) throw new Error(j.message || 'Yuklashda xatolik')
    setList(j.participants || [])
    return j
  }, [search])

  const loadDetail = useCallback(
    async (sessionId) => {
      setDetailLoading(true)
      try {
        const res = await fetch(`${adminBase()}/custom/monitoring/participants/${sessionId}`, {
          credentials: 'include',
        })
        const j = await res.json()
        if (!j.ok) throw new Error(j.message || 'Yuklashda xatolik')
        setDetail(j.participant)
      } catch (e) {
        notice({ message: e.message || 'Xatolik', type: 'error' })
      } finally {
        setDetailLoading(false)
      }
    },
    [notice]
  )

  const refreshList = useCallback(async () => {
    setListLoading(true)
    try {
      await loadList()
    } catch (e) {
      notice({ message: e.message || 'Xatolik', type: 'error' })
    } finally {
      setListLoading(false)
    }
  }, [loadList, notice])

  const refreshAll = useCallback(async () => {
    setListLoading(true)
    try {
      await loadList()
      if (selected?.sessionId) await loadDetail(selected.sessionId)
    } catch (e) {
      notice({ message: e.message || 'Xatolik', type: 'error' })
    } finally {
      setListLoading(false)
    }
  }, [loadList, loadDetail, selected, notice])

  useEffect(() => {
    refreshList()
  }, [])

  const openUser = async (row) => {
    setSelected(row)
    await loadDetail(row.sessionId)
  }

  const goBack = () => {
    setSelected(null)
    setDetail(null)
  }

  const onSearch = (e) => {
    e.preventDefault()
    refreshList()
  }

  const busy = listLoading || detailLoading

  return (
    <Box variant="white" style={{ width: '100%', padding: '12px 20px 40px', boxSizing: 'border-box' }}>
      <style>{spinKeyframes}</style>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 20,
          alignItems: 'flex-start',
        }}
      >
        <div>
          <H2 marginBottom="sm">Monitoring</H2>
          <Text fontSize="sm" color="grey60">
            Foydalanuvchini tanlang — test javoblari ochiladi
          </Text>
        </div>
        <RefreshButton
          onClick={selected ? refreshAll : refreshList}
          loading={busy}
        />
      </div>

      {!selected ? (
        <>
          <form
            onSubmit={onSearch}
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 16,
              maxWidth: 440,
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#64748b', display: 'flex' }}>
              <Icon icon="Search" />
            </span>
            <input
              type="search"
              placeholder="Ism yoki email bo‘yicha qidirish…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: 14,
              }}
            />
            <Button
              type="submit"
              size="sm"
              variant="primary"
              disabled={listLoading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon icon="Search" />
              Qidirish
            </Button>
          </form>
          <MonitoringParticipantsTable rows={list} onSelect={openUser} loading={listLoading} />
        </>
      ) : (
        <MonitoringUserDetail row={detail} loading={detailLoading} onBack={goBack} />
      )}
    </Box>
  )
}
