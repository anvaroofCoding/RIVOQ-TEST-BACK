import React from 'react'
import { Icon } from '@adminjs/design-system'

/** Cheating: qilgan / qilmagan */
export default function MonitoringCheatingBadge({ cheating, violations = 0, size = 'md' }) {
  const compact = size === 'sm'
  if (cheating) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: compact ? 4 : 6,
          padding: compact ? '3px 8px' : '5px 10px',
          borderRadius: 6,
          fontSize: compact ? 11 : 12,
          fontWeight: 700,
          background: '#ffebee',
          color: '#b71c1c',
          border: '1px solid #ef9a9a',
        }}
      >
        <Icon icon="AlertTriangle" color="error" />
        Qilgan
        {violations > 0 ? ` (${violations}×)` : ''}
      </span>
    )
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 4 : 6,
        padding: compact ? '3px 8px' : '5px 10px',
        borderRadius: 6,
        fontSize: compact ? 11 : 12,
        fontWeight: 600,
        background: '#e8f5e9',
        color: '#2e7d32',
        border: '1px solid #a5d6a7',
      }}
    >
      <Icon icon="CheckCircle" color="success" />
      Qilmagan
    </span>
  )
}
