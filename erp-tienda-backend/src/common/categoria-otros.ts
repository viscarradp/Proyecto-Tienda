import { Prisma } from '@prisma/client';

export const CATEGORIA_GASTO_POR_DEFECTO = 'Otros';

/**
 * Id de la categoría de gasto "Otros" (la crea si no existe). Es la categoría
 * por defecto de un egreso operativo que llega sin categoría (NEG-13): la
 * categoría es un dato de análisis, no un control. Tolera la carrera de dos
 * peticiones que la crean a la vez (nombre único). Se usa fuera de una
 * transacción para que un P2002 no deje abortada la transacción del egreso.
 */
export async function categoriaOtrosId(client: {
  categorias_gastos: Prisma.TransactionClient['categorias_gastos'];
}): Promise<number> {
  const db = client.categorias_gastos;
  const existente = await db.findUnique({
    where: { nombre: CATEGORIA_GASTO_POR_DEFECTO },
  });
  if (existente) return existente.id;
  try {
    const creada = await db.create({
      data: { nombre: CATEGORIA_GASTO_POR_DEFECTO, tipo: 'OPERATIVO' },
    });
    return creada.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const otra = await db.findUniqueOrThrow({
        where: { nombre: CATEGORIA_GASTO_POR_DEFECTO },
      });
      return otra.id;
    }
    throw error;
  }
}
