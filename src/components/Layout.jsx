import { Outlet, Navigate } from "react-router-dom"
import Navbar from "./Navbar"

function Layout({ userSession }) {
  // Check against the auth token your save function extracts
  const isAuthenticated = !!userSession?.authToken;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="app-shell">
      <Navbar userSession={userSession} />
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
