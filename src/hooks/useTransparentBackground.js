import { useEffect } from 'react'

// OBS composites a Browser Source's page background as-is, so an overlay view
// needs a genuinely transparent <html>/<body> rather than the app's normal
// light/dark surface color. Restores the previous backgrounds on unmount.
export function useTransparentBackground() {
  useEffect(() => {
    const html = document.documentElement
    const prevHtmlBg = html.style.background
    const prevBodyBg = document.body.style.background
    html.style.background = 'transparent'
    document.body.style.background = 'transparent'
    return () => {
      html.style.background = prevHtmlBg
      document.body.style.background = prevBodyBg
    }
  }, [])
}
