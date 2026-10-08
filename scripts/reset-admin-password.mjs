import { PrismaClient } from '@prisma/client'
import argon2 from 'argon2'

const prisma = new PrismaClient()

const hash = await argon2.hash('Admin123!@#')
const u = await prisma.user.update({
  where: { email: 'racustefan34@gmail.com' },
  data: { password: hash, active: true, role: 'SUPERADMIN' }
})
console.log('✅ Password reset for:', u.email, '| role:', u.role, '| active:', u.active)
await prisma.$disconnect()
