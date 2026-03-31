import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const v = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'ventas';`;
  console.log(v);
}
main().catch(console.error).finally(() => prisma.$disconnect());
