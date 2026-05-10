import React, { useEffect, useMemo, useState } from 'react'
import { ApiClient, useNotice } from 'adminjs'
import { Box, Button, H2, Input, Label, Text, TextArea } from '@adminjs/design-system'

export default function TopicAddQuestion(props) {
  const notice = useNotice()
  const api = useMemo(() => new ApiClient(), [])

  const recordId = props?.record?.id

  const incomingQuestions = props?.meta?.questions || props?.data?.meta?.questions || []
  const [questions, setQuestions] = useState([])

  useEffect(() => {
    setQuestions(Array.isArray(incomingQuestions) ? incomingQuestions : [])
  }, [recordId, props?.meta, props?.data?.meta])

  const [question, setQuestion] = useState('')
  const [correctAnswer, setCorrectAnswer] = useState('')
  const [wrong1, setWrong1] = useState('')
  const [wrong2, setWrong2] = useState('')
  const [wrong3, setWrong3] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!recordId) {
      notice({ message: 'Topic topilmadi', type: 'error' })
      return
    }
    setLoading(true)
    try {
      const res = await api.recordAction({
        resourceId: props.resource.id,
        recordId,
        actionName: props.action.name,
        data: {
          question,
          correctAnswer,
          wrongAnswer1: wrong1,
          wrongAnswer2: wrong2,
          wrongAnswer3: wrong3,
        },
      })
      if (res?.data?.notice) notice(res.data.notice)

      if (res?.data?.meta?.questions) {
        setQuestions(res.data.meta.questions)
      }

      // clear only question fields (stay on same topic)
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
      <H2>Savol qo‘shish</H2>
      <Text mt="default" mb="xl" color="grey60">
        Shu mavzuga savollarni ketma-ket qo‘shasiz.
      </Text>

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

      <Box mt="xxl">
        <Text fontWeight="bold">Qo‘shilgan savollar</Text>
        <Box mt="default">
          {questions.length === 0 ? (
            <Text color="grey60">Hali savol yo‘q.</Text>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px' }}>#</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px' }}>Savol</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px' }}>To‘g‘ri</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px' }}>Xato1</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px' }}>Xato2</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px' }}>Xato3</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((q, idx) => (
                    <tr key={q._id || idx}>
                      <td style={{ borderBottom: '1px solid #f3f3f3', padding: '8px' }}>{idx + 1}</td>
                      <td style={{ borderBottom: '1px solid #f3f3f3', padding: '8px' }}>{q.question}</td>
                      <td style={{ borderBottom: '1px solid #f3f3f3', padding: '8px' }}>{q.correctAnswer}</td>
                      <td style={{ borderBottom: '1px solid #f3f3f3', padding: '8px' }}>{q.wrongAnswer1}</td>
                      <td style={{ borderBottom: '1px solid #f3f3f3', padding: '8px' }}>{q.wrongAnswer2}</td>
                      <td style={{ borderBottom: '1px solid #f3f3f3', padding: '8px' }}>{q.wrongAnswer3}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Box>
      </Box>
    </Box>
  )
}

