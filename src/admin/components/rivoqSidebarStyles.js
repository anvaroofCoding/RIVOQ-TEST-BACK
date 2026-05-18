import React from 'react'

export const SIDEBAR_WIDTH = 200

/** Shell + oddiy menyu stillari */
export const RIVOQ_SIDEBAR_CSS = `
[data-css="app"] { display: flex !important; flex-direction: row !important; align-items: stretch !important; }
[data-css="app"] > section:first-of-type,
[data-css="app"] > section:first-child {
  flex: 0 0 ${SIDEBAR_WIDTH}px !important;
  width: ${SIDEBAR_WIDTH}px !important;
  min-width: ${SIDEBAR_WIDTH}px !important;
  max-width: ${SIDEBAR_WIDTH}px !important;
  overflow: hidden !important;
}
[data-css="app"] > section:last-of-type,
[data-css="app"] > section:nth-child(2) {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  width: auto !important;
  max-width: none !important;
}
[data-css="sidebar"],
aside,
section:has(.rivoq-sidebar-nav) {
  width: ${SIDEBAR_WIDTH}px !important;
  min-width: ${SIDEBAR_WIDTH}px !important;
  max-width: ${SIDEBAR_WIDTH}px !important;
  flex: 0 0 ${SIDEBAR_WIDTH}px !important;
  background: #fff !important;
  border-right: 1px solid #e2e8f0 !important;
  box-sizing: border-box !important;
}
.rivoq-sidebar-brand {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 14px 12px !important;
  text-decoration: none !important;
  border-bottom: 1px solid #e2e8f0 !important;
  box-sizing: border-box !important;
  max-width: 100% !important;
}
.rivoq-sidebar-brand__mark {
  width: 32px !important;
  height: 32px !important;
  border-radius: 6px !important;
  background: #1565c0 !important;
  color: #fff !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-weight: 700 !important;
  font-size: 10px !important;
  flex-shrink: 0 !important;
}
.rivoq-sidebar-brand__mark img { width: 100% !important; height: 100% !important; object-fit: cover !important; border-radius: 6px !important; }
.rivoq-sidebar-brand__text { font-weight: 600 !important; font-size: 13px !important; color: #1e293b !important; line-height: 1.2 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
.rivoq-sidebar-brand__sub { display: none !important; }
.rivoq-sidebar-nav {
  display: flex !important;
  flex-direction: column !important;
  padding: 8px 6px 12px !important;
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}
.rivoq-sidebar-nav__label { display: none !important; }
.rivoq-sidebar-link {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  padding: 8px 10px !important;
  margin: 0 0 2px 0 !important;
  border-radius: 6px !important;
  text-decoration: none !important;
  color: #475569 !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  border: none !important;
  border-left: 3px solid transparent !important;
}
.rivoq-sidebar-link:hover { background: #f1f5f9 !important; color: #0f172a !important; }
.rivoq-sidebar-link--active {
  background: #eff6ff !important;
  color: #1565c0 !important;
  font-weight: 600 !important;
  border-left-color: #1565c0 !important;
}
.rivoq-sidebar-link--monitoring.rivoq-sidebar-link--active {
  background: #fef2f2 !important;
  color: #c62828 !important;
  border-left-color: #c62828 !important;
}
.rivoq-sidebar-link__icon { display: flex !important; align-items: center !important; flex-shrink: 0 !important; width: 16px !important; color: inherit !important; background: none !important; }
.rivoq-sidebar-link__icon svg { width: 16px !important; height: 16px !important; }
.rivoq-sidebar-link__label { overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; flex: 1 !important; min-width: 0 !important; }
`

export function RivoqSidebarStyles() {
  return React.createElement('style', {
    dangerouslySetInnerHTML: { __html: RIVOQ_SIDEBAR_CSS },
  })
}
