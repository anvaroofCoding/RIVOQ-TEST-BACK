import React, { useMemo, useState } from 'react'
import { ApiClient, useNotice } from 'adminjs'
import { Box, Button, Input, Text, TextArea } from '@adminjs/design-system'

export default function TopicQuestionsInline(props) {
  const notice = useNotice()
  const api = useMemo(() => new ApiClient(), [])
  const recordId = props?.record?.id

  const [questions, setQuestions] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [edit, setEdit] = useState({
    question: '',
    correctAnswer: '',
    wrongAnswer1: '',
    wrongAnswer2: '',
    wrongAnswer3: '',
  })

  const load = async () => {
    if (!recordId) return
    setLoading(true)
    try {
      const res = await api.recordAction({
        resourceId: props.resource.id,
        recordId,
        actionName: 'questions',
        data: {},
      })
      setQuestions(res?.data?.meta?.questions || [])
      setLoaded(true)
    } catch (e) {
      notice({ message: e?.message || 'Xatolik', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (q) => {
    setEditingId(q._id)
    setEdit({
      question: q.question || '',
      correctAnswer: q.correctAnswer || '',
      wrongAnswer1: q.wrongAnswer1 || '',
      wrongAnswer2: q.wrongAnswer2 || '',
      wrongAnswer3: q.wrongAnswer3 || '',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const saveEdit = async () => {
    if (!recordId || !editingId) return
    setLoading(true)
    try {
      const res = await api.recordAction({
        resourceId: props.resource.id,
        recordId,
        actionName: 'updateQuestion',
        data: { questionId: String(editingId), ...edit },
      })
      if (res?.data?.notice) notice(res.data.notice)
      await load()
      setEditingId(null)
    } catch (e) {
      notice({ message: e?.message || 'Xatolik', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const deleteQuestion = async (id) => {
    if (!recordId || !id) return
    if (!window.confirm("O‘chirasizmi?")) return
    setLoading(true)
    try {
      const res = await api.recordAction({
        resourceId: props.resource.id,
        recordId,
        actionName: 'deleteQuestion',
        data: { questionId: String(id) },
      })
      if (res?.data?.notice) notice(res.data.notice)
      await load()
      if (editingId === id) setEditingId(null)
    } catch (e) {
      notice({ message: e?.message || 'Xatolik', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box variant="white" mt="xl">
      <Box flex flexDirection="row" justifyContent="space-between" alignItems="center">
        <Text fontWeight="bold">Savollar</Text>
        <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
          {loaded ? 'Refresh' : 'Load'}
        </Button>
      </Box>

      <Box mt="default">
        {!loaded ? (
          <Text color="grey60">Savollarni ko‘rish uchun Load bosing.</Text>
        ) : questions.length === 0 ? (
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
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q, idx) => (
                  <tr key={q._id || idx}>
                    <td style={{ borderBottom: '1px solid #f3f3f3', padding: '8px' }}>{idx + 1}</td>
                    <td style={{ borderBottom: '1px solid #f3f3f3', padding: '8px', minWidth: 260 }}>
                      {editingId === q._id ? (
                        <TextArea
                          rows={3}
                          value={edit.question}
                          onChange={(e) => setEdit((s) => ({ ...s, question: e.target.value }))}
                        />
                      ) : (
                        q.question
                      )}
                    </td>
                    <td style={{ borderBottom: '1px solid #f3f3f3', padding: '8px', minWidth: 160 }}>
                      {editingId === q._id ? (
                        <Input
                          value={edit.correctAnswer}
                          onChange={(e) => setEdit((s) => ({ ...s, correctAnswer: e.target.value }))}
                        />
                      ) : (
                        q.correctAnswer
                      )}
                    </td>
                    <td style={{ borderBottom: '1px solid #f3f3f3', padding: '8px', minWidth: 160 }}>
                      {editingId === q._id ? (
                        <Input
                          value={edit.wrongAnswer1}
                          onChange={(e) => setEdit((s) => ({ ...s, wrongAnswer1: e.target.value }))}
                        />
                      ) : (
                        q.wrongAnswer1
                      )}
                    </td>
                    <td style={{ borderBottom: '1px solid #f3f3f3', padding: '8px', minWidth: 160 }}>
                      {editingId === q._id ? (
                        <Input
                          value={edit.wrongAnswer2}
                          onChange={(e) => setEdit((s) => ({ ...s, wrongAnswer2: e.target.value }))}
                        />
                      ) : (
                        q.wrongAnswer2
                      )}
                    </td>
                    <td style={{ borderBottom: '1px solid #f3f3f3', padding: '8px', minWidth: 160 }}>
                      {editingId === q._id ? (
                        <Input
                          value={edit.wrongAnswer3}
                          onChange={(e) => setEdit((s) => ({ ...s, wrongAnswer3: e.target.value }))}
                        />
                      ) : (
                        q.wrongAnswer3
                      )}
                    </td>
                    <td style={{ borderBottom: '1px solid #f3f3f3', padding: '8px', whiteSpace: 'nowrap' }}>
                      {editingId === q._id ? (
                        <>
                          <Button size="sm" variant="primary" onClick={saveEdit} disabled={loading}>
                            Save
                          </Button>
                          <span style={{ marginLeft: 8 }} />
                          <Button size="sm" variant="secondary" onClick={cancelEdit} disabled={loading}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => startEdit(q)} disabled={loading}>
                            Edit
                          </Button>
                          <span style={{ marginLeft: 8 }} />
                          <Button size="sm" variant="danger" onClick={() => deleteQuestion(q._id)} disabled={loading}>
                            Delete
                          </Button>
                        </>
                      )}
                    </td>
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

