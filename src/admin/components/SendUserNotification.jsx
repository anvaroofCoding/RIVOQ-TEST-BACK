import React, { useState } from 'react'
import { Box, Button, Label, Input, TextArea, Select } from '@adminjs/design-system'
import { ApiClient, useNotice } from 'adminjs'

const api = new ApiClient()

export default function SendUserNotification(props) {
  const addNotice = useNotice()
  const recordId = props?.record?.id

  const [type, setType] = useState('system')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!recordId) return
    setLoading(true)
    try {
      const res = await api.recordAction({
        resourceId: props.resource.id,
        recordId,
        actionName: 'sendNotification',
        data: { type, title, body },
      })
      if (res?.data?.notice) addNotice(res.data.notice)
    } catch (e) {
      addNotice({ message: e?.message || 'Xatolik', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box variant="grey">
      <Box variant="white" padding="xl">
        <Box marginBottom="lg">
          <Label>Type</Label>
          <Select
            value={{ value: type, label: type }}
            options={[
              { value: 'system', label: 'system' },
              { value: 'daily_reminder', label: 'daily_reminder' },
              { value: 'rank_up', label: 'rank_up' },
              { value: 'rank_down', label: 'rank_down' },
            ]}
            onChange={(v) => setType(v?.value || 'system')}
          />
        </Box>

        <Box marginBottom="lg">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Box>

        <Box marginBottom="lg">
          <Label>Body</Label>
          <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
        </Box>

        <Button variant="primary" onClick={submit} disabled={loading}>
          {loading ? 'Yuborilyapti…' : 'Yuborish'}
        </Button>
      </Box>
    </Box>
  )
}

