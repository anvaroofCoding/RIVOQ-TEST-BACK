import React, { useEffect, useMemo, useState } from 'react'
import { ApiClient, useNotice } from 'adminjs'
import { Box, Button, H2, Input, Label, Select, Text, TextArea } from '@adminjs/design-system'

export default function QuickAddQuestion(props) {
  const notice = useNotice()
  const api = useMemo(() => new ApiClient(), [])

  const meta = props?.meta || props?.data?.meta || {}
  const topicOptions = meta.topicOptions || []
  const initialTopicId = meta.selectedTopicId || (topicOptions[0]?.value ?? '')

  const [topicId, setTopicId] = useState(initialTopicId)
  const [question, setQuestion] = useState('')
  const [correctAnswer, setCorrectAnswer] = useState('')
  const [wrong1, setWrong1] = useState('')
  const [wrong2, setWrong2] = useState('')
  const [wrong3, setWrong3] = useState('')
  const [loading, setLoading] = useState(false)

  // When options load, pick first topic by default
  useEffect(() => {
    if (!topicId && topicOptions.length) setTopicId(topicOptions[0].value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicOptions?.length])

  const submit = async () => {
    if (!topicId) {
      notice({ message: 'Topic tanlang', type: 'error' })
      return
    }
    setLoading(true)
    try {
      const res = await api.resourceAction({
        resourceId: props.resource.id,
        actionName: props.action.name,
        data: {
          topicId,
          question,
          correctAnswer,
          wrongAnswer1: wrong1,
          wrongAnswer2: wrong2,
          wrongAnswer3: wrong3,
        },
      })

      if (res?.data?.notice) notice(res.data.notice)
      setQuestion('')
      setCorrectAnswer('')
      setWrong1('')
      setWrong2('')
      setWrong3('')
    } catch (e) {
      notice({ message: e?.message || 'Xatolik', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box variant="white">
      <H2>Savol qo‘shish (ketma-ket)</H2>
      <Text mt="default" mb="xl" color="grey60">
        1 marta Topic tanlang, keyin savollarni ketma-ket qo‘shavering.
      </Text>

      <Box mb="lg">
        <Label required>Topic</Label>
        <Select
          value={topicOptions.find((o) => o.value === topicId) || null}
          options={topicOptions}
          onChange={(selected) => setTopicId(selected?.value || '')}
        />
      </Box>

      <Box mb="lg">
        <Label required>Savol</Label>
        <TextArea value={question} onChange={(e) => setQuestion(e.target.value)} rows={4} />
      </Box>

      <Box mb="lg">
        <Label required>To‘g‘ri javob</Label>
        <Input value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} />
      </Box>

      <Box mb="lg">
        <Label required>Xato javob 1</Label>
        <Input value={wrong1} onChange={(e) => setWrong1(e.target.value)} />
      </Box>
      <Box mb="lg">
        <Label required>Xato javob 2</Label>
        <Input value={wrong2} onChange={(e) => setWrong2(e.target.value)} />
      </Box>
      <Box mb="lg">
        <Label required>Xato javob 3</Label>
        <Input value={wrong3} onChange={(e) => setWrong3(e.target.value)} />
      </Box>

      <Button variant="primary" onClick={submit} disabled={loading}>
        Saqlash va keyingisi
      </Button>
    </Box>
  )
}

