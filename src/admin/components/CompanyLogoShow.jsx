import React from 'react'
import { Box, Text } from '@adminjs/design-system'

export default function CompanyLogoShow(props) {
  const src = props.record?.params?.[props.property.path]
  if (!src) {
    return <Text color="grey60">—</Text>
  }
  return (
    <Box>
      <img src={src} alt="" style={{ maxHeight: 100, maxWidth: '100%', objectFit: 'contain' }} />
      <Text fontSize="xs" color="grey60" mt="sm">{src}</Text>
    </Box>
  )
}
