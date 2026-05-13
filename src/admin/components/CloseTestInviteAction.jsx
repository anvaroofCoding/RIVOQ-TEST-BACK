import React, { useMemo, useState } from 'react'
import { ApiClient, useNotice } from 'adminjs'
import { Box, Button, H2, Text } from '@adminjs/design-system'

/** Topic / TopicInviteCode: «Testni yopish» — faqat ApiClient.recordAction + handler (POST + confirm) */
export default function CloseTestInviteAction(props) {
  const notice = useNotice()
  const api = useMemo(() => new ApiClient(), [])
  const recordId = props?.record?.id
  const actionName = props?.action?.name || ''
  const [loading, setLoading] = useState(false)

  const title = props?.action?.label || 'Testni yopish'
  const blurb =
    actionName === 'closeInviteForTopic'
      ? 'Bu maxfiy mavzu uchun aktiv kirish kodi o‘chiriladi. Mobil ilovada endi shu kod ishlamaydi. Keyin kerak bo‘lsa «6 raqamli kod» bilan yangisini yarating.'
      : 'Bu qatordagi kirish kodi o‘chiriladi — mobil ilovada ishlamay qoladi.'

  const submit = async () => {
    if (!recordId) {
      notice({ message: 'Yozuv topilmadi', type: 'error' })
      return
    }
    setLoading(true)
    try {
      const res = await api.recordAction({
        resourceId: props.resource.id,
        recordId,
        actionName: props.action.name,
        data: { confirm: true },
      })
      if (res?.data?.notice) notice(res.data.notice)
    } catch (e) {
      notice({ message: e?.message || 'Xatolik', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box variant="white">
      <H2>{title}</H2>
      <Text mt="default" mb="xl" color="grey60">
        {blurb}
      </Text>
      <Button disabled={loading} onClick={submit}>
        {loading ? 'Kutilmoqda…' : 'Ha, kodni bekor qilish'}
      </Button>
    </Box>
  )
}
