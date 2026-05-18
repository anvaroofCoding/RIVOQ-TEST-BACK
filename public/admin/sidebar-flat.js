/** AdminJS default sidebar qolsa — guruh tugmasini yashir, ichidagi bitta havolani ko‘rsat */
(function () {
  function flatten() {
    var root = document.querySelector('[data-css="sidebar"]') || document.querySelector('aside')
    if (!root || root.querySelector('.rivoq-flat-sidebar')) return

    root.querySelectorAll('section').forEach(function (sec) {
      var btn = sec.querySelector(':scope > button')
      var links = sec.querySelectorAll('a[href*="/resources/"]')
      if (!btn || !links.length) return

      btn.style.setProperty('display', 'none', 'important')
      links.forEach(function (a) {
        a.style.setProperty('display', 'flex', 'important')
      })
      var ul = sec.querySelector('ul')
      if (ul) {
        ul.style.setProperty('display', 'block', 'important')
        ul.style.setProperty('height', 'auto', 'important')
        ul.style.setProperty('overflow', 'visible', 'important')
        ul.style.paddingLeft = '0'
      }
    })
  }

  function run() {
    if (!/\/admin/.test(window.location.pathname)) return
    flatten()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run)
  else run()

  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true })
})()
