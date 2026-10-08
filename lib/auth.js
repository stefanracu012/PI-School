import crypto from 'crypto'
import CredentialsProvider from 'next-auth/providers/credentials'
import prisma from '@/lib/prisma'
import { readImpersonation } from '@/lib/impersonation'

export const authOptions = {
  debug: process.env.NODE_ENV === 'development',
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        loginToken: { label: 'Login token', type: 'text' }
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email) {
            throw new Error('Email este obligatoriu')
          }

          const normalizedEmail = credentials.email.toLowerCase().trim()

          const user = await prisma.user.findUnique({
            where: { email: normalizedEmail }
          })

          if (!user) {
            throw new Error('Email sau parolă incorectă')
          }

          if (!user.active) {
            throw new Error('Contul este dezactivat')
          }

          // Validated by our login API (password, captcha, 2FA): it issued a
          // one-time token for this user. Consume it atomically — a token works once.
          if (credentials.loginToken) {
            const tokenHash = crypto.createHash('sha256').update(String(credentials.loginToken)).digest('hex')
            const consumed = await prisma.stepUpToken.updateMany({
              where: {
                tokenHash,
                userId: user.id,
                action: 'login',
                used: false,
                expiresAt: { gt: new Date() },
              },
              data: { used: true },
            })
            if (consumed.count !== 1) {
              throw new Error('Sesiunea de autentificare a expirat. Încearcă din nou.')
            }
            return {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              image: user.image
            }
          }

          // Fără token nu se intră: parola se verifică doar în /api/auth/login,
          // unde există rate limiting, CAPTCHA, 2FA și audit.
          throw new Error('Autentifică-te din pagina de login')
        } catch (error) {
          console.error('Authorize error:', error)
          throw error
        }
      }
    })
  ],
  callbacks: {
    async signIn({ user }) {
      try {
        console.log('signIn callback - user email:', user.email)
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email?.toLowerCase() }
        })
        
        console.log('signIn callback - dbUser found:', !!dbUser, 'active:', dbUser?.active)
        
        if (!dbUser || !dbUser.active) {
          console.log('signIn callback - returning false (no user or not active)')
          return false
        }
        
        console.log('signIn callback - returning true')
        return true
      } catch (error) {
        console.error('SignIn callback error:', error)
        return false
      }
    },
    async jwt({ token, user }) {
      try {
        if (user) {
          token.role = user.role
          token.id = user.id
          token.image = user.image
        }
        
        if (token.email) {
          const dbUser = await prisma.user.findUnique({
            where: { email: token.email },
            select: {
              id: true,
              role: true,
              name: true,
              image: true,
              permissions: true,
              twoFactorEnabled: true,
              superTeacher: true,
            }
          })
          if (dbUser) {
            token.role = dbUser.role
            token.id = dbUser.id
            token.name = dbUser.name
            token.image = dbUser.image
            token.permissions = dbUser.permissions || []
            token.twoFactorEnabled = dbUser.twoFactorEnabled || false
            token.superTeacher = dbUser.superTeacher || false
          }

          // ─── IMPERSONATION OVERRIDE ───
          // Dacă SUPERADMIN-ul are cookie de impersonare valid,
          // suprascriem identitatea cu cea a target user-ului.
          // Cookie-ul NextAuth original rămâne neatins.
          // IMPORTANT: resetăm flag-urile la fiecare apel, ca să nu rămână
          // setate dintr-o sesiune anterioară când cookie-ul a fost șters.
          token.impersonating = false
          token.originalId = undefined
          token.originalName = undefined
          token.originalEmail = undefined
          token.originalRole = undefined
          token.impersonatedEmail = undefined
          try {
            const realUserId = dbUser?.id
            const imp = await readImpersonation()
            const isAdminImpersonator = dbUser && (dbUser.role === 'SUPERADMIN' || (dbUser.role === 'ADMIN' && (dbUser.permissions || []).includes('teachers.impersonate')))
            if (imp && isAdminImpersonator && imp.originalUserId === realUserId) {
              const target = await prisma.user.findUnique({
                where: { id: imp.targetUserId },
                select: {
                  id: true,
                  email: true,
                  role: true,
                  name: true,
                  image: true,
                  permissions: true,
                  active: true,
                  superTeacher: true,
                }
              })
              if (target && target.active) {
                // Salvăm originalul pentru afișare în banner
                token.originalId = dbUser.id
                token.originalName = dbUser.name
                token.originalEmail = token.email
                token.originalRole = dbUser.role
                token.impersonating = true
                // Suprascriem cu target
                token.id = target.id
                token.role = target.role
                token.name = target.name
                token.image = target.image
                token.permissions = target.permissions || []
                token.impersonatedEmail = target.email
                token.superTeacher = target.superTeacher || false
                // 2FA dezactivat în impersonare (admin a auth-uit deja ca el)
                token.twoFactorEnabled = false
              }
            }
          } catch (e) {
            console.error('Impersonation read error:', e)
          }
        }
        return token
      } catch (error) {
        console.error('JWT callback error:', error)
        return token
      }
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role
        session.user.id = token.id
        session.user.image = token.image
        session.user.permissions = token.permissions || []
        session.user.twoFactorEnabled = token.twoFactorEnabled || false
        session.user.superTeacher = token.superTeacher || false
        // Expune starea de impersonare către client
        if (token.impersonating) {
          session.user.impersonating = true
          session.user.originalId = token.originalId
          session.user.originalName = token.originalName
          session.user.originalEmail = token.originalEmail
          session.user.originalRole = token.originalRole
          // Suprascriem și name/email pentru afișare corectă
          session.user.name = token.name
          if (token.impersonatedEmail) session.user.email = token.impersonatedEmail
        }
      }
      return session
    }
  },
  pages: {
    signIn: '/login',
    error: '/login'
  },
  session: {
    strategy: 'jwt',
    maxAge: parseInt(process.env.SESSION_EXPIRATION_HOURS || '6') * 60 * 60, // Convert hours to seconds
    updateAge: 60 * 60, // Update session every 1 hour
  },
  secret: process.env.NEXTAUTH_SECRET
}
