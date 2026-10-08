import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const deleted = await prisma.captchaState.deleteMany({})
console.log(`✅ Deleted ${deleted.count} captcha state records`)

await prisma.$disconnect()
