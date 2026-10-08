'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { isCrmPath } from '@/lib/crm-paths'

const ThemeContext = createContext({
  isDarkMode: true,
  toggleTheme: () => {}
})

export function useTheme() {
  return useContext(ThemeContext)
}

export default function ThemeProvider({ children }) {
  const pathname = usePathname()
  const inCrm = isCrmPath(pathname)
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Check for saved theme preference or default to dark
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme) setIsDarkMode(savedTheme === 'dark')
  }, [])

  // Tema deschisă e a CRM-ului; site-ul public își păstrează culorile, chiar
  // dacă cineva trece din admin pe site în același tab.
  useEffect(() => {
    if (!mounted) return
    document.documentElement.classList.toggle('light', inCrm && !isDarkMode)
  }, [mounted, inCrm, isDarkMode])

  const toggleTheme = () => {
    const newTheme = isDarkMode ? 'light' : 'dark'
    setIsDarkMode(!isDarkMode)
    localStorage.setItem('theme', newTheme)
  }

  // Prevent flash of wrong theme — doar în CRM; site-ul public se randează pe
  // server, ca să fie văzut de motoarele de căutare.
  if (!mounted && inCrm) {
    return null
  }

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
