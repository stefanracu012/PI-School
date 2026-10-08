const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const student = await prisma.student.findUnique({ where: { id: '69ee44bd828dd7a56d71484f' }, select: { id: true, fullName: true } });
  console.log('Student:', JSON.stringify(student));
  const count = await prisma.problemSubmission.count({ where: { studentId: '69ee44bd828dd7a56d71484f' } });
  const countPending = await prisma.problemSubmission.count({ where: { studentId: '69ee44bd828dd7a56d71484f', status: 'PENDING' } });
  console.log('Total submissions:', count);
  console.log('Pending:', countPending);
  const subs = await prisma.problemSubmission.findMany({ where: { studentId: '69ee44bd828dd7a56d71484f' }, take: 3 });
  console.log('Sample:', JSON.stringify(subs, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
