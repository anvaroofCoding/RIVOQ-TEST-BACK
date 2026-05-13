import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Input, Label, Text, Select } from '@adminjs/design-system'
import { useNotice } from 'adminjs'

/** AdminJS 7 SPA turli pathname’lar: /admin/..., har doim prefiks /admin */
const adminPrefix = () => {
  if (typeof window === 'undefined') return '/admin'
  const path = window.location.pathname || ''
  const m = /^(\/admin)(?=\/|$)/.exec(path)
  return m ? m[1] : '/admin'
}

async function parseAdminJson(res) {
  const text = await res.text()
  try {
    return { ok: true, json: JSON.parse(text), text }
  } catch {
    return { ok: false, text }
  }
}

export default function WalletGrantAdmin() {
  const notice = useNotice()
  const noticeRef = useRef(notice)
  noticeRef.current = notice
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  const [addCoins, setAddCoins] = useState('')
  const [addScore, setAddScore] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const base = useMemo(() => adminPrefix().replace(/\/$/, ''), [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoadingList(true)
      setListError('')
      try {
        const res = await fetch(`${base}/custom/wallet-grant/users`, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        })
        const parsed = await parseAdminJson(res)
        const j = parsed.ok ? parsed.json : {}
        if (!res.ok) {
          const detail =
            j.message ||
            (res.redirected ? 'Sessiya yo‘q — admin paneldan qayta kiring.' : '') ||
            `HTTP ${res.status}`
          setListError(detail)
          noticeRef.current({ message: detail, type: 'error' })
          return
        }
        if (!parsed.ok) {
          const html = (parsed.text || '').includes('<html')
          const detail =
            html
              ? 'Login sahifasi qaytardi — qayta kiring.'
              : (parsed.text || '').slice(0, 200) || 'Javob JSON emas'
          setListError(detail)
          noticeRef.current({
            message: detail,
            type: 'error',
          })
          return
        }
        if (!cancelled && Array.isArray(j.users)) setUsers(j.users)
      } catch (e) {
        const detail = e?.message || 'Tarmoq xatosi'
        if (!cancelled) {
          setListError(detail)
          noticeRef.current({ message: detail, type: 'error' })
        }
      } finally {
        if (!cancelled) setLoadingList(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- useNotice har renderda yangi ref; depsda bersak cheksiz qayta yuklash va loading qotib qoladi
  }, [base])

  const q = search.trim().toLowerCase()
  const options = useMemo(() => {
    const filtered = !q
      ? users
      : users.filter(
          (u) =>
            (u.name && u.name.toLowerCase().includes(q)) ||
            (u.email && u.email.toLowerCase().includes(q)) ||
            String(u.id).includes(q)
        )
    return filtered.slice(0, 300).map((u) => ({
      value: u.id,
      label: `${u.name || '—'} · ${u.email || '—'} · ${u.role} · coin:${u.coins} score:${u.score}${u.isActive === false ? ' (o‘chirilgan)' : ''}`,
    }))
  }, [users, q])

  const selected = useMemo(() => users.find((u) => u.id === targetUserId), [users, targetUserId])

  const submit = async () => {
    const coins = Math.max(0, Math.floor(Number(addCoins) || 0))
    const score = Math.max(0, Math.floor(Number(addScore) || 0))
    if (!targetUserId) {
      notice({ message: 'Foydalanuvchini tanlang', type: 'error' })
      return
    }
    if (coins <= 0 && score <= 0) {
      notice({ message: 'Coin yoki score miqdorini kiriting', type: 'error' })
      return
    }
    setSubmitting(true)
    try {
      /** express-formidable URL-encoded uchun emas — multipart FormData bilan yuboramiz */
      const fd = new FormData()
      fd.set('targetUserId', String(targetUserId))
      fd.set('addCoins', String(coins))
      fd.set('addScore', String(score))
      const res = await fetch(`${base}/custom/wallet-grant`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      const parsed = await parseAdminJson(res)
      const j = parsed.ok ? parsed.json : {}
      if (!res.ok) {
        const msg =
          j.message ||
          (res.redirected
            ? 'Sessiya yo‘q — admin paneldan qayta kiring.'
            : !parsed.ok && String(parsed.text || '').includes('<html')
              ? 'Server login sahifasi qaytardi.'
              : `HTTP ${res.status}`)
        notice({ message: msg, type: 'error' })
        return
      }
      if (!parsed.ok) {
        notice({ message: 'Server javobi JSON emas.', type: 'error' })
        return
      }
      notice({ message: j.message || 'Qo‘llandi', type: 'success' })
      setAddCoins('')
      setAddScore('')
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUserId
            ? { ...u, coins: j.target?.coins ?? u.coins, score: j.target?.score ?? u.score }
            : u
        )
      )
    } catch (e) {
      notice({ message: e?.message || 'Tarmoq xatosi', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  /** Qidiruv va Select yuklash yoki JSON xatolikda blok; coin/score — faqat ro‘yxat bo‘lsa ham yozish uchun (asl muammo notice deps edi). */
  const listBroken = !!listError
  const filtersDisabled = loadingList || listBroken
  const selectDisabled = loadingList || listBroken || users.length === 0

  return (
    <Box variant="white" p="xl" style={{ minHeight: 280 }}>
      {/* Sarlavha sahifa boshida AdminJS bermoqda — takrorlashsiz */}
      <Text mb="xl" color="grey60">
        Foydalanuvchini tanlang, coin va score kiriting.
        <br />
        <strong>Admin</strong> yoki <strong>kompaniya</strong> akkaunti. Har bir operatsiya{' '}
        <code>admin_wallet_grant</code> sifatida wallet tarixiga yoziladi.
      </Text>

      {loadingList ? (
        <Text mb="lg" fontWeight="bold">
          Ro‘yxat yuklanmoqda…
        </Text>
      ) : null}
      {listError ? (
        <Text mb="lg" color="danger">
          {listError}
        </Text>
      ) : null}

      <Box mb="lg">
        <Label>Qidirish (ism, email yoki ID)</Label>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Masalan: ali yoki @gmail"
          disabled={filtersDisabled}
        />
      </Box>

      <Box mb="lg">
        <Label>Foydalanuvchi</Label>
        <Select
          key={users.length ? `u-${users.length}` : 'u-empty'}
          value={options.find((o) => o.value === targetUserId) || null}
          options={options}
          onChange={(opt) => setTargetUserId(opt?.value || '')}
          isClearable
          isDisabled={selectDisabled}
          noOptionsMessage={() => (users.length === 0 ? 'Hali yo‘qlik yoki yuklash xatosi' : 'Natija yo‘q')}
        />
        {options.length >= 300 ? (
          <Text mt="sm" fontSize="sm" color="grey60">
            Ko‘rsatilmoqda: 300 tagacha. Qidirishni toraytiring.
          </Text>
        ) : null}
      </Box>

      {selected ? (
        <Box mb="lg" p="default" style={{ background: '#f5f5f5', borderRadius: 8 }}>
          <Text>
            <strong>Joriy:</strong> coin {selected.coins} · score {selected.score}
          </Text>
        </Box>
      ) : null}

      <Box mb="default">
        <Label>Qo‘shiladigan coin</Label>
        <Input
          type="number"
          min={0}
          value={addCoins}
          onChange={(e) => setAddCoins(e.target.value)}
          placeholder="0"
          disabled={listBroken}
        />
      </Box>

      <Box mb="lg">
        <Label>Qo‘shiladigan score</Label>
        <Input
          type="number"
          min={0}
          value={addScore}
          onChange={(e) => setAddScore(e.target.value)}
          placeholder="0"
          disabled={listBroken}
        />
      </Box>

      <Button variant="primary" onClick={submit} disabled={submitting || loadingList || !!listError}>
        {submitting ? 'Qo‘llanmoqda…' : 'Qo‘llash'}
      </Button>
    </Box>
  )
}
