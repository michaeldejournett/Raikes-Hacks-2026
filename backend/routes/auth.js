import { Router } from 'express'
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import db from '../db.js'

const router = Router()

const upsertUser = db.prepare(`
  INSERT INTO users (google_id, name, email, picture)
  VALUES (@googleId, @name, @email, @picture)
  ON CONFLICT(google_id) DO UPDATE SET
    name = excluded.name,
    email = excluded.email,
    picture = excluded.picture
`)
const getUserByGoogleId = db.prepare(`SELECT * FROM users WHERE google_id = ?`)
const getUserById = db.prepare(`SELECT * FROM users WHERE id = ?`)

const oauthConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

if (oauthConfigured) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback',
    },
    (_accessToken, _refreshToken, profile, done) => {
      try {
        upsertUser.run({
          googleId: profile.id,
          name: profile.displayName,
          email: profile.emails?.[0]?.value || null,
          picture: profile.photos?.[0]?.value || null,
        })
        const user = getUserByGoogleId.get(profile.id)
        done(null, user)
      } catch (err) {
        done(err)
      }
    }
  ))
} else {
  console.warn('Google OAuth not configured — GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set')
}

passport.serializeUser((user, done) => done(null, user.id))
passport.deserializeUser((id, done) => {
  try {
    const user = getUserById.get(id)
    done(null, user || false)
  } catch (err) {
    done(err)
  }
})

// Start OAuth flow
router.get('/google', (req, res, next) => {
  if (!oauthConfigured) return res.status(503).json({ error: 'Google OAuth not configured' })
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next)
})

// OAuth callback
router.get('/google/callback', (req, res) => {
  if (!oauthConfigured) return res.redirect('/')
  passport.authenticate('google', { failureRedirect: '/' })(req, res, () => {
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173')
  })
})

// Get current user
router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' })
  const { id, name, email, picture } = req.user
  res.json({ id, name, email, picture })
})

// Logout
router.post('/logout', (req, res) => {
  req.logout(() => res.json({ ok: true }))
})

export { passport }
export default router
