import { useState } from 'react'
import { CATEGORIES } from '../data/events'
import DateRangePicker from './DateRangePicker'

const LOCATIONS = ['All Locations', 'Omaha, NE', 'Lincoln, NE']

export default function SearchFilters({ filters, onChange, onReset }) {
  const [open, setOpen] = useState(true)

  const set = (key, value) => onChange({ ...filters, [key]: value })

  const hasActiveFilters =
    filters.category ||
    filters.location ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.priceSort

  const activeCount = [
    filters.category,
    filters.location,
    filters.dateFrom || filters.dateTo ? 'date' : '',
    filters.priceSort,
  ].filter(Boolean).length

  return (
    <>
      {/* Mobile toggle */}
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

        {/* Date range */}
        <div className="filter-group">
          <span className="filter-label">Date Range</span>
          <DateRangePicker
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            onChange={({ dateFrom, dateTo }) => onChange({ ...filters, dateFrom, dateTo })}
          />
        </div>

        {/* Price sort */}
        <div className="filter-group">
          <label className="filter-label" htmlFor="filter-price-sort">Sort by Price</label>
          <select
            id="filter-price-sort"
            className="filter-input"
            value={filters.priceSort}
            onChange={(e) => set('priceSort', e.target.value)}
          >
            <option value="">No preference</option>
            <option value="asc">Least expensive first</option>
            <option value="desc">Most expensive first</option>
          </select>
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
