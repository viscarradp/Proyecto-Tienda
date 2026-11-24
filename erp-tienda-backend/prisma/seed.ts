import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// Seed de catálogos base, idempotente. NO crea usuarios: el admin inicial se
// crea al arrancar el backend con INITIAL_ADMIN_PASSWORD
// (ver docs/decisions/0003-admin-seed-por-env.md).
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({ adapter: new PrismaPg(pool as any) })

async function main() {
  console.log('Sembrando catálogos base...')

  const catGeneral = await prisma.categorias.findUnique({ where: { nombre: 'General' } })
  if (!catGeneral) {
    await prisma.categorias.create({
      data: { nombre: 'General' }
    })
  }

  const catExGasto = await prisma.categorias_gastos.findUnique({ where: { nombre: 'Operativos' } })
  if (!catExGasto) {
    await prisma.categorias_gastos.create({
      data: { nombre: 'Operativos', tipo: 'VARIABLE' }
    })
  }

  console.log('Siembra completada.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
