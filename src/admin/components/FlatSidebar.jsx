import React, { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Icon } from '@adminjs/design-system'
import { RivoqSidebarStyles, SIDEBAR_WIDTH } from './rivoqSidebarStyles.js'

const NAV_ITEMS = [
  { id: 'monitoring', label: 'Monitoring', icon: 'Activity', path: '', monitoring: true },
  { id: 'Subject', label: 'Fanlar', icon: 'Book', path: '/resources/Subject/actions/list' },
  { id: 'Topic', label: 'Mavzular', icon: 'Document', path: '/resources/Topic/actions/list' },
  {
    id: 'TopicInviteCode',
    label: 'Test kodlari',
    icon: 'Key',
    path: '/resources/TopicInviteCode/actions/list',
  },
  { id: 'User', label: 'Foydalanuvchilar', icon: 'User', path: '/resources/User/actions/list' },
]

function pinSidebarWidth() {
  const nav = document.querySelector('.rivoq-sidebar-nav')
  if (!nav) return

  let el = nav.parentElement
  for (let i = 0; i < 8 && el; i++) {
    if (el.tagName === 'SECTION' || el.getAttribute?.('data-css') === 'sidebar') {
      el.style.flex = `0 0 ${SIDEBAR_WIDTH}px`
      el.style.width = `${SIDEBAR_WIDTH}px`
      el.style.minWidth = `${SIDEBAR_WIDTH}px`
      el.style.maxWidth = `${SIDEBAR_WIDTH}px`
      el.style.overflow = 'hidden'
    }
    el = el.parentElement
  }

  const app = document.querySelector('[data-css="app"]')
  if (app) {
    const sections = app.querySelectorAll(':scope > section')
    if (sections[0]) {
      sections[0].style.flex = `0 0 ${SIDEBAR_WIDTH}px`
      sections[0].style.width = `${SIDEBAR_WIDTH}px`
      sections[0].style.minWidth = `${SIDEBAR_WIDTH}px`
      sections[0].style.maxWidth = `${SIDEBAR_WIDTH}px`
    }
    if (sections[1]) {
      sections[1].style.flex = '1 1 auto'
      sections[1].style.minWidth = '0'
      sections[1].style.width = 'auto'
    }
  }
}

function isActive(location, base, item) {
  if (item.id === 'monitoring') {
    return (
      location.pathname === base ||
      location.pathname === `${base}/` ||
      (location.pathname.startsWith(base) && !location.pathname.includes('/resources/'))
    )
  }
  return location.pathname.includes(`/resources/${item.id}`)
}

export default function FlatSidebar() {
  const location = useLocation()
  const base = (() => {
    const m = location.pathname.match(/^(.*\/admin)/)
    return m ? m[1] : '/admin'
  })()

  useEffect(() => {
    pinSidebarWidth()
    const t = setInterval(pinSidebarWidth, 500)
    return () => clearInterval(t)
  }, [location.pathname])

  return (
    <>
      <RivoqSidebarStyles />
      <nav className="rivoq-sidebar-nav" aria-label="Menyu">
        {NAV_ITEMS.map((item) => {
          const to = item.path ? `${base}${item.path}` : base
          const active = isActive(location, base, item)
          const className = [
            'rivoq-sidebar-link',
            active ? 'rivoq-sidebar-link--active' : '',
            item.monitoring ? 'rivoq-sidebar-link--monitoring' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <Link key={item.id} to={to} className={className}>
              <span className="rivoq-sidebar-link__icon">
                <Icon icon={item.icon} />
              </span>
              <span className="rivoq-sidebar-link__label">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
