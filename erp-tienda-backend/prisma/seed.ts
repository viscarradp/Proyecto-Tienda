import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Sembrando base de datos...')

  // 1. Crear Usuario Admin por defecto
  const adminExists = await prisma.usuarios.findFirst({
    where: { nombre: 'admin' }
  })

  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10)
    await prisma.usuarios.create({
      data: {
        nombre: 'admin',
        password_hash: hashedPassword,
        rol: 'ADMIN',
      },
    })
    console.log('✅ Usuario ADMIN creado: admin / admin123')
  } else {
    console.log('ℹ️ Usuario ADMIN ya existe.')
  }

  // 2. Crear algunas categorías básicas de ejemplo
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

  console.log('🚀 Siembra completada con éxito.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
