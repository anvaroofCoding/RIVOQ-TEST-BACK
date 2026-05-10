import React, { useState } from 'react'
import { Box, Button, Label, Text } from '@adminjs/design-system'
import { useNotice } from 'adminjs'

const uploadPath = () => {
  if (typeof window === 'undefined') return '/admin/upload/company-logo'
  const prefix = (window.location.pathname || '').split('/resources/')[0] || '/admin'
  return `${prefix.replace(/\/$/, '')}/upload/company-logo`
}

export default function CompanyLogoUpload(props) {
  const { property, record, onChange } = props
  const path = property.path
  const value = record?.params?.[path] || ''
  const role = record?.params?.role
  const addNotice = useNotice()
  const [busy, setBusy] = useState(false)

  // Jamoa a’zosi (kompaniyaga birikkan oddiy user) — logo kerak emas
  if (role === 'user' && record?.params?.companyId) {
    return (
      <Box variant="grey" p="default">
        <Text fontSize="sm" color="grey60">Bu foydalanuvchiga kompaniya logosi qo‘yilmaydi.</Text>
      </Box>
    )
  }

  const pick = async (e) => {
    const file = e.target?.files?.[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowed.includes(file.type)) {
      addNotice({ message: 'Faqat JPG, PNG, GIF yoki WEBP', type: 'error' })
      e.target.value = ''
      return
    }
    const max = 2 * 1024 * 1024
    if (file.size > max) {
      addNotice({ message: 'Fayl 2 MB dan kichik bo‘lsin', type: 'error' })
      e.target.value = ''
      return
    }

    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(uploadPath(), {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        addNotice({ message: j.error || 'Yuklashda xato', type: 'error' })
        return
      }
      if (j.url) {
        onChange(path, j.url)
        addNotice({ message: 'Logo saqlandi', type: 'success' })
      }
    } catch (err) {
      addNotice({ message: err?.message || 'Tarmoq xatosi', type: 'error' })
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <Box variant="grey">
      <Label>Kompaniya logotipi</Label>
      <Text fontSize="sm" color="grey60" mb="default">
        Rasmni fayldan tanlang (JPG, PNG, GIF, WEBP, max 2 MB)
      </Text>
      {value ? (
        <Box mb="default">
          <img src={value} alt="" style={{ maxHeight: 96, display: 'block', marginBottom: 8 }} />
          <Text fontSize="xs" color="grey60">{value}</Text>
        </Box>
      ) : null}
      <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={pick} disabled={busy} />
      {value ? (
        <Box mt="sm">
          <Button variant="text" type="button" disabled={busy} onClick={() => onChange(path, '')}>
            Logoni olib tashlash
          </Button>
        </Box>
      ) : null}
    </Box>
  )
}
