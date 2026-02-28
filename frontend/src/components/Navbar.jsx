export default function Navbar({ searchQuery, onSearchChange, onLogoClick }) {
  return (
    <nav className="navbar">
      <button
        className="navbar-brand"
        onClick={onLogoClick}
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        🎉 Gather
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
          aria-label="Search events"
        />
      </div>

      <div className="navbar-actions">
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Find your next adventure</span>
      </div>
    </nav>
  )
}
