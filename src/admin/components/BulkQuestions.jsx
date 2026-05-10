import React, { useState } from 'react'
import { Box, Button, H2, Label, TextArea, Text } from '@adminjs/design-system'

// Format per line:
// question | correct | wrong1 | wrong2 | wrong3
// Use \n for multiple lines, one question per line.
export default function BulkQuestions() {
  const [items, setItems] = useState('')

  return (
    <Box variant="white">
      <H2>Bulk savol qo‘shish</H2>
      <Text mt="default">
        Har qatorda bitta savol kiriting. Format:
      </Text>
      <Box mt="default" p="default" variant="grey">
        <Text>savol | togriJavob | xato1 | xato2 | xato3</Text>
      </Box>

      <Box mt="xl">
        <Label required>Questions</Label>
        <TextArea
          value={items}
          onChange={(e) => setItems(e.target.value)}
          rows={16}
        />
        <Text mt="default" variant="sm" color="grey60">
          Misol:
          {'\n'}
          2+2=? | 4 | 3 | 5 | 6
          {'\n'}
          Capital of Uzbekistan? | Tashkent | Samarkand | Bukhara | Khiva
        </Text>
      </Box>

      {/* AdminJS will render the action button bar itself; this component only collects payload.
          The textarea name must be "items" so it is sent to the handler. */}
      <input type="hidden" name="items" value={items} readOnly />

      <Box mt="xl">
        <Button type="submit" variant="primary">
          Saqlash
        </Button>
      </Box>
    </Box>
  )
}

