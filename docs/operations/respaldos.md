# Respaldos de la base de datos

La base de producción es PostgreSQL en Supabase **plan gratuito**, que no trae
respaldos gestionados ni restauración a un punto en el tiempo. Por eso el
proyecto hace su propio respaldo nocturno. Sin esto, un error o una cuenta
perdida significa perder todo el negocio.

## Cómo funciona

- **Qué:** `pg_dump` (formato custom) del esquema `public` — todos los datos de
  la app —, **cifrado** con AES-256 (`openssl`). Sin dueños ni privilegios, así
  que se puede restaurar en otra base. No incluye el esquema `respaldo_2026_11_26`
  (las tablas viejas de marzo, que la app no usa); se puede borrar de Supabase
  cuando el sistema esté en uso.
- **Cuándo:** cada noche a las 08:00 UTC (2:00 a. m. en El Salvador), y a mano
  cuando quieras (workflow `Respaldo nocturno`, botón *Run workflow*).
- **Dónde queda:** como *artifact* del run en GitHub Actions
  (`respaldo-<id>`, archivo `respaldo-AAAAMMDD-HHMM.dump.enc`).
- **Cuánto se guarda:** 30 días; después GitHub lo borra solo.
- **Por qué cifrado:** los artifacts los puede descargar cualquiera con acceso
  de lectura al repositorio (y **cualquiera**, si el repo es público). Un dump
  sin cifrar expondría clientes, ventas y usuarios. Cifrado, sin la clave es
  ilegible.
- Si los secretos no están cargados, el job termina en verde con un aviso
  "Respaldo no configurado" y **no respalda nada**: revisa que de verdad esté activo.

Piezas: `scripts/respaldo/respaldar.sh`, `scripts/respaldo/restaurar.sh`,
`.github/workflows/respaldo.yml`.

## Activarlo (una sola vez)

1. **Cadena del Session pooler de Supabase.** Panel de Supabase → *Connect* →
   *Session pooler* (host `*.pooler.supabase.com`, **puerto 5432**), que soporta
   `pg_dump`. **No uses el modo transacción** (puerto 6543): no sirve para
   `pg_dump`. La *Direct connection* (`db.<proyecto>.supabase.co`) es solo
   IPv6 y los runners de GitHub Actions no tienen IPv6, así que ahí falla; solo
   sirve desde una red con IPv6. Añade `?sslmode=require` al final.
2. **Clave de cifrado.** Genera una y guárdala **fuera de GitHub** (gestor de
   contraseñas y una copia impresa o en otro lugar seguro):

   ```bash
   openssl rand -base64 32
   ```

   **Sin esta clave no se puede restaurar ningún respaldo.** Si la pierdes, los
   respaldos existentes son basura; si cambias la clave, los respaldos viejos
   siguen necesitando la clave vieja.
3. **Cargar los secretos** en GitHub: *Settings → Secrets and variables →
   Actions → New repository secret*:
   - `BACKUP_DATABASE_URL` = la cadena del paso 1
   - `BACKUP_PASSPHRASE` = la clave del paso 2
4. **Primer respaldo a mano:** pestaña *Actions → Respaldo nocturno → Run
   workflow*. Debe quedar verde y con un artifact. Descárgalo y haz el ensayo de
   restauración (abajo) **antes** de confiar en el sistema.

## Descargar y restaurar un respaldo

Necesitas `openssl` y el cliente de Postgres (`pg_restore`) de versión mayor
**≥ 17**. En Windows, usa Git Bash/WSL con Postgres instalado, o Docker.

1. En GitHub: *Actions* → el run → *Artifacts* → descarga el ZIP y extrae el
   `.dump.enc`.
2. **En local** (base nueva y vacía):

   ```bash
   createdb erp_tienda_restauracion
   export BACKUP_PASSPHRASE='<la clave>'
   export RESTORE_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/erp_tienda_restauracion'
   bash scripts/respaldo/restaurar.sh respaldo-AAAAMMDD-HHMM.dump.enc
   ```

   El script muestra el destino antes de empezar y se **niega** si el host no
   es local.
3. **Emergencia, en una base nueva de Supabase:** crea un proyecto nuevo
   (vacío: el respaldo ya trae las tablas, no apliques `db push`), toma su
   cadena del **Session pooler** (puerto 5432; la directa solo sirve desde una red con IPv6) y ejecuta lo mismo agregando el flag explícito:

   ```bash
   RESTORE_DATABASE_URL='<session-pooler-del-proyecto-nuevo>' \
     bash scripts/respaldo/restaurar.sh --confirmo-destino-remoto respaldo-AAAAMMDD-HHMM.dump.enc
   ```

   Después apunta `DATABASE_URL` del backend a la base nueva. La base destino
   debe estar **vacía**; restaurar encima de datos existentes da errores.

Con Docker, si no tienes `pg_restore` instalado: `docker run --rm -i --network host
postgres:17 pg_restore ...` equivale a lo que hace el script (descifra con
`openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE`).

## Ensayo mensual de restauración (5 minutos)

Un respaldo que nunca se restauró no es un respaldo. Una vez al mes:

- [ ] El último run de *Respaldo nocturno* está verde y **no** dice "no configurado".
- [ ] Hay artifacts de los últimos días (uno por noche).
- [ ] Descarga el más reciente y restáuralo en una base local de prueba (arriba).
- [ ] Compara el conteo de filas de `ventas`, `productos`, `usuarios` contra la
      producción (diferencias pequeñas son normales: pasaron horas).
- [ ] Borra la base de prueba y el archivo descargado.
- [ ] Confirma que la clave de cifrado sigue guardada fuera de GitHub.

## Limitaciones

- **Respaldo diario:** si la base se pierde, se pueden perder hasta ~24 horas
  de ventas. Mitigación manual: lanzar un respaldo a mano antes de cambios
  riesgosos (por ejemplo un cambio de esquema).
- **Retención de 30 días:** no hay respaldos más viejos. Si necesitas
  archivar un cierre de año, guarda aparte uno descargado.
- **Supabase gratis pausa proyectos inactivos** (hoy, tras ~1 semana sin
  actividad; verifica la política vigente en su sitio). Un proyecto pausado
  hace fallar el respaldo. El uso diario de la tienda lo mantiene activo; ojo
  con que el backend duerma de noche en Render: eso no pausa Supabase por sí
  solo, pero varios días sin uso (vacaciones, cierre) sí.
- **GitHub desactiva los workflows programados** tras 60 días sin actividad en
  el repositorio; GitHub avisa por correo. Un commit o lanzar el workflow a mano lo reactiva.
- Los fallos del job te llegan por el correo de notificaciones de GitHub;
  revisa que estén activadas.
- Solo se respalda el esquema `public`. Supabase Auth, Storage, otros esquemas
  propios de Supabase y `respaldo_2026_11_26` **no** se respaldan (la app solo
  usa `public`).
- **Cambiar la versión del cliente:** si Supabase sube de versión mayor de
  Postgres, edita `PG_CLIENT_VERSION` en `.github/workflows/respaldo.yml`
  (y usa un `pg_restore` de esa versión o superior al restaurar). Si el
  respaldo falla con "server version mismatch", es esto.
- **Si el negocio crece:** el plan de pago de Supabase (Pro) incluye respaldos
  diarios gestionados y la opción de restauración a un punto en el tiempo
  (PITR, con costo adicional). Pasar a él es la mejora natural; este respaldo
  propio puede seguir como copia independiente.
