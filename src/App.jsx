import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginScreen from './LoginScreen.jsx'
import JarvisInterface from './jarvis_interface.jsx'
import AdminInterface from './AdminInterface.jsx'

// Auth state lifted au top : partage entre toutes les routes
// localStorage pour persister la session (JWT 30j cote serveur)
// Routes :
//   /login  → LoginScreen (publique, redirige vers / si deja auth)
//   /       → JarvisInterface (auth requis)
//   /admin  → AdminInterface (auth requis + user_id ∈ [1, 2], check fait dans le composant)

function AppRoutes({ auth, onLogin, onLogout }) {
  return (
    <Routes>
      <Route
        path="/login"
        element={auth ? <Navigate to="/" replace /> : <LoginScreen onLogin={onLogin} />}
      />
      <Route
        path="/"
        element={auth ? <JarvisInterface auth={auth} onLogout={onLogout} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/admin"
        element={auth ? <AdminInterface auth={auth} onLogout={onLogout} /> : <Navigate to="/login" replace />}
      />
      {/* Fallback : URL inconnue → racine */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  const [auth, setAuth] = useState(() => {
    // Hydratation initiale - pas de flash de login si deja connecte
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

  return (
    <BrowserRouter>
      <AppRoutes auth={auth} onLogin={handleLogin} onLogout={handleLogout} />
    </BrowserRouter>
  )
}

export default App
