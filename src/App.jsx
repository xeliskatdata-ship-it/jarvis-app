import { useState } from 'react'
import LoginScreen from './LoginScreen.jsx'
import JarvisInterface from './jarvis_interface.jsx'

// Auth state lifted au top : on switch entre LoginScreen et JarvisInterface
// localStorage utilisé pour persister la session (30j de validité du JWT côté serveur)

function App() {
  const [auth, setAuth] = useState(() => {
    // Hydratation initiale depuis localStorage - pas de flash de login si déjà connecté
    const token = localStorage.getItem('jarvis_token')
    const userStr = localStorage.getItem('jarvis_user')
    if (token && userStr) {
      try { return { token, user: JSON.parse(userStr) } }
      catch { return null }
    }
    return null
  })

  const handleLogin = ({ token, user }) => {
    localStorage.setItem('jarvis_token', token)
    localStorage.setItem('jarvis_user', JSON.stringify(user))
    setAuth({ token, user })
  }

  const handleLogout = () => {
    localStorage.removeItem('jarvis_token')
    localStorage.removeItem('jarvis_user')
    setAuth(null)
  }

  if (!auth) return <LoginScreen onLogin={handleLogin} />
  return <JarvisInterface auth={auth} onLogout={handleLogout} />
}

export default App