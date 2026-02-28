import { useState } from 'react'
import { CATEGORIES } from '../data/events'

const LOCATIONS = ['All Locations', 'Omaha, NE', 'Lincoln, NE']

export default function SearchFilters({ filters, onChange, onReset }) {
  const [open, setOpen] = useState(true)

  const set = (key, value) => onChange({ ...filters, [key]: value })

  const hasActiveFilters =
    filters.category ||
    filters.location ||
    filters.date ||
    filters.minPrice !== '' ||
    filters.maxPrice !== ''

  const activeCount = [
    filters.category,
    filters.location,
    filters.date,
    filters.minPrice !== '' ? 'p' : '',
    filters.maxPrice !== '' ? 'p' : '',
  ].filter(Boolean).length

  return (
    <>
      {/* Mobile toggle — only visible via CSS on small screens */}
      <button className="filter-toggle-btn" onClick={() => setOpen((o) => !o)}>
        <span>
          Filters {activeCount > 0 && <span style={{ color: 'var(--primary)' }}>({activeCount})</span>}
        </span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      <aside className={`filters-sidebar${open ? '' : ' collapsed'}`}>
        <div className="filters-title">
          <span>Filters</span>
          {hasActiveFilters && (
            <button className="btn btn-ghost btn-sm" onClick={onReset} style={{ padding: '2px 8px' }}>
              Clear all
            </button>
          )}
        </div>

        {/* Category */}
        <div className="filter-group">
          <span className="filter-label">Category</span>
          <div className="category-pills">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className={`category-pill ${filters.category === cat.id ? 'active' : ''}`}
                onClick={() => set('category', filters.category === cat.id ? '' : cat.id)}
              >
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div className="filter-group">
          <label className="filter-label" htmlFor="filter-date">Date (from)</label>
          <input
            id="filter-date"
            type="date"
            className="filter-input"
            value={filters.date}
            onChange={(e) => set('date', e.target.value)}
          />
        </div>

        {/* Price */}
        <div className="filter-group">
          <span className="filter-label">Price Range ($)</span>
          <div className="price-range-row">
            <input
              type="number"
              className="filter-input"
              placeholder="Min"
              min="0"
              value={filters.minPrice}
              onChange={(e) => set('minPrice', e.target.value)}
            />
            <input
              type="number"
              className="filter-input"
              placeholder="Max"
              min="0"
              value={filters.maxPrice}
              onChange={(e) => set('maxPrice', e.target.value)}
            />
          </div>
        </div>

        {/* Location */}
        <div className="filter-group">
          <label className="filter-label" htmlFor="filter-location">Location</label>
          <select
            id="filter-location"
            className="filter-input"
            value={filters.location}
            onChange={(e) => set('location', e.target.value === 'All Locations' ? '' : e.target.value)}
          >
            {LOCATIONS.map((loc) => (
              <option key={loc} value={loc === 'All Locations' ? '' : loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>
      </aside>
    </>
  )
}
