import logo from '../assets/logo.png'
import { api } from '../api'
import NotificationBell from './NotificationBell'
import MyGroupsMenu from './MyGroupsMenu'

export default function Navbar({ searchQuery, onSearchChange, onSearchSubmit, onLogoClick, user, onUserChange, onNavigateToEvent }) {
  const handleLogout = async () => {
    await api.logout()
    window.location.reload()
  }

  return (
    <nav className="navbar">
      <button
        className="navbar-brand"
        onClick={onLogoClick}
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <img src={logo} alt="Curia" style={{ height: '80px' }} />
      </button>

      <div className="navbar-search">
        <span className="navbar-search-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </span>
        <input
          type="search"
          placeholder="Search events…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearchSubmit?.()}
          aria-label="Search events"
        />
      </div>

      <span className="navbar-tagline">We already know where you're going.</span>

      <div className="navbar-actions">
        {user && <MyGroupsMenu onNavigateToEvent={onNavigateToEvent} />}
        {user && <NotificationBell onNavigateToEvent={onNavigateToEvent} />}
        {user ? (
          <div className="navbar-user">
            {user.picture && (
              <img src={user.picture} alt={user.name} className="navbar-avatar" referrerPolicy="no-referrer" />
            )}
            <span className="navbar-username">{user.name}</span>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        ) : (
          <a className="btn btn-primary btn-sm" href="/api/auth/google">
            Sign in with Google
          </a>
        )}
      </div>
    </nav>
  )
}
