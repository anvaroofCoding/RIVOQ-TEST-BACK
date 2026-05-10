import React, { useMemo, useState } from 'react'
import { ApiClient, useNotice } from 'adminjs'
import { Box, Button, H2, Text } from '@adminjs/design-system'

export default function TopicQuestionsList(props) {
  const notice = useNotice()
  const api = useMemo(() => new ApiClient(), [])
  const recordId = props?.record?.id

  const initial = props?.meta?.questions || []
  const [questions, setQuestions] = useState(initial)
  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    if (!recordId) return
    setLoading(true)
    try {
      const res = await api.recordAction({
        resourceId: props.resource.id,
        recordId,
        actionName: props.action.name,
        data: {},
      })
      if (res?.data?.notice) notice(res.data.notice)
      setQuestions(res?.data?.meta?.questions || [])
    } catch (e) {
      notice({ message: e?.message || 'Xatolik', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box variant="white">
      <Box flex flexDirection="row" justifyContent="space-between" alignItems="center">
        <H2>Savollar</H2>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>
          Refresh
        </Button>
      </Box>

      <Box mt="xl">
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
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px' }}>Xato 1</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px' }}>Xato 2</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px' }}>Xato 3</th>
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
  )
}

