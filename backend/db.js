import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, 'gather.db')

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export default db

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      time TEXT,
      end_date TEXT,
      end_time TEXT,
      location TEXT,
      venue TEXT,
      price REAL DEFAULT 0,
      category TEXT,
      tags TEXT DEFAULT '[]'
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      creator TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      member_name TEXT NOT NULL,
      joined_at TEXT DEFAULT (datetime('now')),
      UNIQUE(group_id, member_name)
    )
  `)

  const count = db.prepare('SELECT COUNT(*) AS count FROM events').get().count
  if (count === 0) {
    seedEvents()
    console.log('Seeded events table')
  }
}

function seedEvents() {
  const insert = db.prepare(`
    INSERT INTO events (name, description, date, time, end_date, end_time, location, venue, price, category, tags)
    VALUES (@name, @description, @date, @time, @endDate, @endTime, @location, @venue, @price, @category, @tags)
  `)

  const seed = db.transaction((events) => {
    for (const ev of events) {
      insert.run({ ...ev, tags: JSON.stringify(ev.tags) })
    }
  })

  seed([
    {
      name: 'Omaha Tech Summit 2026',
      description: "Join Omaha's premier technology conference featuring keynotes from industry leaders, hands-on workshops, and networking opportunities. Topics include AI/ML, cloud infrastructure, web development, and startup culture. Whether you're a seasoned engineer or just starting out, there's something for everyone.",
      date: '2026-03-20', time: '09:00', endDate: '2026-03-20', endTime: '17:00',
      location: 'Omaha, NE', venue: 'CHI Health Center Omaha',
      price: 75, category: 'technology',
      tags: ['tech', 'networking', 'AI', 'workshops'],
    },
    {
      name: 'Jazz Night at The Slowdown',
      description: 'An intimate evening of live jazz featuring local Omaha artists and special guests from Chicago. Expect smooth bebop, Latin jazz, and contemporary fusion. Doors open at 7 PM with a cash bar and light bites available. All ages welcome — 21+ for bar service.',
      date: '2026-03-15', time: '19:00', endDate: '2026-03-15', endTime: '23:00',
      location: 'Omaha, NE', venue: 'The Slowdown',
      price: 25, category: 'music',
      tags: ['jazz', 'live music', '21+', 'bar'],
    },
    {
      name: 'Heartland 5K Charity Run',
      description: "Lace up your shoes for the annual Heartland 5K benefiting the Children's Hospital & Medical Center Foundation. The flat, scenic course winds through Elmwood Park. All finishing times welcome — walkers, joggers, and runners alike. T-shirt and medal included with registration.",
      date: '2026-03-22', time: '08:00', endDate: '2026-03-22', endTime: '11:00',
      location: 'Omaha, NE', venue: 'Elmwood Park',
      price: 0, category: 'sports',
      tags: ['5K', 'running', 'charity', 'family-friendly'],
    },
    {
      name: 'Farm to Table Spring Dinner',
      description: 'A five-course dinner experience celebrating Nebraska agriculture. Each dish is prepared by Chef Maria Santos using ingredients sourced within 100 miles of Omaha. Paired with selections from local wineries. Tickets include dinner, wine pairings, and a tour of the kitchen garden.',
      date: '2026-03-18', time: '18:30', endDate: '2026-03-18', endTime: '21:30',
      location: 'Omaha, NE', venue: 'Saddle Creek Barn & Gardens',
      price: 85, category: 'food',
      tags: ['dinner', 'farm-to-table', 'wine', 'fine dining'],
    },
    {
      name: 'Contemporary Art Exhibition: "Flux"',
      description: 'The Joslyn Art Museum presents "Flux," a group exhibition exploring themes of change, movement, and transformation through painting, sculpture, and installation. Featuring 12 emerging artists from the Great Plains region. Opening reception on April 5th included with ticket.',
      date: '2026-04-05', time: '17:00', endDate: '2026-06-01', endTime: '20:00',
      location: 'Omaha, NE', venue: 'Joslyn Art Museum',
      price: 15, category: 'arts',
      tags: ['art', 'exhibition', 'gallery', 'contemporary'],
    },
    {
      name: 'Raikes Hackathon 2026',
      description: 'The Raikes School annual hackathon — 24 hours to build something amazing. Open to all University of Nebraska-Lincoln students. Work solo or in teams of up to 4. Prizes for top 3 teams plus sponsor awards in categories like Best Use of AI and Best Social Impact. Food, caffeine, and mentors provided.',
      date: '2026-03-28', time: '18:00', endDate: '2026-03-29', endTime: '18:00',
      location: 'Lincoln, NE', venue: 'Raikes School, University of Nebraska',
      price: 0, category: 'technology',
      tags: ['hackathon', 'UNL', 'coding', 'students', 'prizes'],
    },
    {
      name: 'Community Garden Planting Day',
      description: "Spring is here — time to get your hands dirty! Join the Benson neighborhood community garden for our annual spring planting day. We'll be prepping beds, planting seeds, and teaching composting basics. Bring gloves if you have them; tools will be provided. Potluck lunch afterward.",
      date: '2026-04-11', time: '09:00', endDate: '2026-04-11', endTime: '14:00',
      location: 'Omaha, NE', venue: 'Benson Community Garden',
      price: 0, category: 'community',
      tags: ['gardening', 'volunteer', 'neighborhood', 'family-friendly'],
    },
    {
      name: 'Morning Yoga in Elmwood Park',
      description: "Start your weekend right with an outdoor yoga session in one of Omaha's most beautiful parks. Instructor Dana Lee leads a 75-minute flow suitable for all skill levels. Bring your own mat (extras available). Class ends with a guided meditation. Rain location: Elmwood Rec Center.",
      date: '2026-04-04', time: '07:30', endDate: '2026-04-04', endTime: '08:45',
      location: 'Omaha, NE', venue: 'Elmwood Park — West Lawn',
      price: 10, category: 'health',
      tags: ['yoga', 'outdoor', 'meditation', 'wellness'],
    },
    {
      name: 'UNL Spring Career Fair',
      description: 'Over 200 employers from Fortune 500 companies to local startups will be on campus recruiting for internships, co-ops, and full-time positions. All majors welcome. Dress professionally and bring copies of your résumé. Free LinkedIn headshots available at the Husker Career Center booth.',
      date: '2026-03-25', time: '10:00', endDate: '2026-03-25', endTime: '15:00',
      location: 'Lincoln, NE', venue: 'Devaney Sports Center, UNL',
      price: 0, category: 'education',
      tags: ['careers', 'networking', 'internships', 'UNL'],
    },
    {
      name: 'Omaha Craft Beer Festival',
      description: "Nebraska's largest craft beer festival returns to Aksarben Village! Sample 150+ beers from 40+ breweries across the state and region. Live music on two stages, food trucks, and a homebrew competition. VIP entry at 12 PM includes unlimited sampling and exclusive tappings. General admission at 2 PM.",
      date: '2026-04-18', time: '12:00', endDate: '2026-04-18', endTime: '20:00',
      location: 'Omaha, NE', venue: 'Aksarben Village',
      price: 45, category: 'food',
      tags: ['beer', 'craft beer', '21+', 'festival', 'live music'],
    },
  ])
}
