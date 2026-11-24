/**
 * Zona horaria del negocio.
 *
 * Los instantes se guardan en UTC, pero los reportes agrupan por DÍA según el
 * reloj de la tienda (El Salvador = UTC-6, sin horario de verano). Sin esto,
 * una venta de las 19:30 locales (01:30Z del día siguiente) caería en el día
 * equivocado. Configurable por env `ZONA_HORARIA_NEGOCIO` (nombre IANA).
 */

const ZONA_POR_DEFECTO = 'America/El_Salvador';
const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Valida que `zona` sea un nombre IANA que el runtime conoce. Si no, lanza un
 * error claro (no se silencia: una zona mala descuadraría todos los reportes).
 */
export function validarZonaHoraria(zona: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
  } catch {
    throw new Error(
      `ZONA_HORARIA_NEGOCIO inválida: "${zona}". Usa un nombre IANA ` +
        `válido, por ejemplo "America/El_Salvador".`,
    );
  }
  return zona;
}

/** Zona del negocio según el env (default America/El_Salvador), ya validada. */
export function zonaHorariaNegocio(): string {
  const valor = process.env.ZONA_HORARIA_NEGOCIO?.trim();
  return validarZonaHoraria(valor ? valor : ZONA_POR_DEFECTO);
}

/** ¿Es "YYYY-MM-DD" y un día real del calendario (p. ej. rechaza 2026-02-30)? */
export function esFechaCalendarioValida(fecha: string): boolean {
  const m = FORMATO_FECHA.exec(fecha);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    d.getUTCFullYear() === anio &&
    d.getUTCMonth() === mes - 1 &&
    d.getUTCDate() === dia
  );
}

/** Reloj de pared (año..segundo) de un instante en la zona, como números. */
function relojEnZona(instante: Date, zona: string): Record<string, number> {
  const formateador = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const partes: Record<string, number> = {};
  for (const p of formateador.formatToParts(instante)) {
    if (p.type !== 'literal') partes[p.type] = Number(p.value);
  }
  return partes;
}

/**
 * Desfase (ms) de la zona respecto a UTC EN ese instante: reloj local − UTC.
 * Para UTC-6 devuelve −6 h. Depende del instante, por eso sirve con DST.
 */
function offsetEnInstante(instante: Date, zona: string): number {
  const w = relojEnZona(instante, zona);
  const comoUtc = Date.UTC(
    w.year,
    w.month - 1,
    w.day,
    w.hour,
    w.minute,
    w.second,
  );
  // El formateador trunca los ms: se comparan segundos completos.
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/**
 * Instante UTC que corresponde a un reloj de pared local (fecha + hora) en la
 * zona. El offset depende del propio instante buscado, así que se resuelve en
 * dos pasos: se estima con el offset de una primera suposición y se corrige
 * con el offset del resultado (cubre cruces de DST cerca de la medianoche).
 */
function instanteDeRelojLocal(
  [anio, mes, dia]: number[],
  [h, mi, s, ms]: number[],
  zona: string,
): Date {
  const suposicion = Date.UTC(anio, mes - 1, dia, h, mi, s, ms);
  const off1 = offsetEnInstante(new Date(suposicion), zona);
  let candidato = suposicion - off1;
  const off2 = offsetEnInstante(new Date(candidato), zona);
  if (off2 !== off1) candidato = suposicion - off2;
  return new Date(candidato);
}

/**
 * Límites UTC de un día calendario "YYYY-MM-DD" en la zona del negocio:
 * inicio = 00:00:00.000 local, fin = 23:59:59.999 local.
 * Lanza Error si la fecha no es válida.
 */
export function limitesDelDia(
  fecha: string,
  zona: string = zonaHorariaNegocio(),
): { inicio: Date; fin: Date } {
  if (!esFechaCalendarioValida(fecha)) {
    throw new Error(`Fecha inválida: "${fecha}". Formato esperado YYYY-MM-DD.`);
  }
  const ymd = fecha.split('-').map(Number);
  return {
    inicio: instanteDeRelojLocal(ymd, [0, 0, 0, 0], zona),
    fin: instanteDeRelojLocal(ymd, [23, 59, 59, 999], zona),
  };
}

/** "Hoy" como fecha calendario "YYYY-MM-DD" en la zona del negocio. */
export function hoyEnZona(
  ahora: Date = new Date(),
  zona: string = zonaHorariaNegocio(),
): string {
  const w = relojEnZona(ahora, zona);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${String(w.year).padStart(4, '0')}-${p2(w.month)}-${p2(w.day)}`;
}

/** El 1ro del mes actual como "YYYY-MM-DD" en la zona del negocio. */
export function primerDiaDelMesEnZona(
  ahora: Date = new Date(),
  zona: string = zonaHorariaNegocio(),
): string {
  return `${hoyEnZona(ahora, zona).slice(0, 8)}01`;
}
