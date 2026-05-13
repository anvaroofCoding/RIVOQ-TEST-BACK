import React, { useEffect, useMemo, useState } from 'react'
import { ApiClient, useNotice } from 'adminjs'
import { Box, Button, H2, Text } from '@adminjs/design-system'

export default function TopicAccessCode(props) {
  const notice = useNotice()
  const api = useMemo(() => new ApiClient(), [])
  const recordId = props?.record?.id
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingList, setLoadingList] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!recordId) {
        setLoadingList(false)
        return
      }
      setLoadingList(true)
      try {
        const res = await api.recordAction({
          resourceId: props.resource.id,
          recordId,
          actionName: props.action.name,
        })
        const c = res?.data?.meta?.code
        if (!cancelled && typeof c === 'string') setCode(c)
      } catch (e) {
        if (!cancelled) notice({ message: e?.message || 'Joriy kodni yuklashda xatolik', type: 'error' })
      } finally {
        if (!cancelled) setLoadingList(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / recordId only: action API GET joriy kod
  }, [recordId])

  const generate = async () => {
    if (!recordId) {
      notice({ message: 'Mavzu topilmadi', type: 'error' })
      return
    }
    setLoading(true)
    try {
      const res = await api.recordAction({
        resourceId: props.resource.id,
        recordId,
        actionName: props.action.name,
        data: { regenerate: true },
      })
      if (res?.data?.notice) notice(res.data.notice)
      const c = res?.data?.meta?.code
      if (typeof c === 'string') setCode(c)
    } catch (e) {
      notice({ message: e?.message || 'Xatolik', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box variant="white">
      <H2>6 raqamli kirish kodi</H2>
      <Text mt="default" mb="lg" color="grey60">
        Oddiy foydalanuvchi mobil ilovada shu kodni kiritib testni boshlaydi (POST /api/topics/start-with-code).
      </Text>

      {loadingList ? (
        <Text>Yuklanmoqda…</Text>
      ) : (
        <Box mb="lg">
          <Text fontSize="xl" fontWeight="bold">
            {code ? `Kod: ${code}` : 'Hali kod yaratilmagan.'}
          </Text>
        </Box>
      )}

      <Button disabled={loading || loadingList} onClick={generate}>
        {loading ? 'Kutilmoqda…' : 'Kod yaratish / yangilash'}
      </Button>
    </Box>
  )
}
