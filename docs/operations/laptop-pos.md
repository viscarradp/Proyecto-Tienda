# Laptop del punto de venta (Linux Mint, kiosco automático)

Guía para dejar la laptop de la tienda de modo que la dueña **abra la tapa y ya esté en el sistema**: sin encender
nada, sin clics y sin contraseñas de Linux. Scripts en [`../../scripts/pos/`](../../scripts/pos/).

## Para el agente que explica esta guía

Eres el agente de IA que acompaña al usuario (hijo de la dueña, no necesariamente técnico en Linux) mientras instala
esta laptop **desde otra computadora**. Tú no tocas la laptop: el usuario escribe lo que tú le indiques.

- **Objetivo:** una laptop con Linux Mint 22 Xfce que, al encenderse o al abrir la tapa, muestre la tienda
  (`https://proyecto-tienda-sand.vercel.app`) a pantalla completa, y que mantenga despierto el backend de Render.
- **Explica un paso a la vez**, en español llano, y **verifica cada paso antes de seguir** (cada sección trae su
  "Cómo comprobarlo"). Si algo no coincide, párate: no avances con un paso fallido.
- **No pidas ni muestres contraseñas** en el chat: ni la de Linux del usuario `tienda`, ni la del ERP, ni tokens.
  El usuario las escribe él mismo y las guarda donde prefiera.
- **No improvises cambios** en el sistema de producción (Supabase, Render, Vercel) ni en el repo. Esta guía solo
  toca la laptop. Si falla algo que parece del backend (no carga tras varios minutos), lo único que se hace es
  revisar `https://proyecto-tienda-nbi6.onrender.com/salud` y avisar al usuario.
- **No inventes comandos**: usa los de esta guía. Si el usuario pega una salida de error, léela y compárala con la
  sección "Si algo falla".
- Los scripts no se pudieron probar en una laptop real antes de escribir esta guía. Si un paso del instalador falla,
  pide la salida completa del comando y ayuda a diagnosticar; el instalador se puede repetir sin riesgo.
- Todo lo que se escribe en la terminal de Linux va **sin** las comillas que envuelven los comandos de esta guía.

## Qué hace la configuración y por qué

| Pieza | Qué hace | Por qué |
|---|---|---|
| Inicio de sesión automático | La laptop entra sola al escritorio. | La dueña no debe saber ni escribir la contraseña de Linux. |
| Kiosco | Chromium a pantalla completa con la tienda; si se cierra, se reabre en ~5 s. | Que no pueda "perderse" en el escritorio. |
| Tapa enchufada | Cerrar la tapa **no suspende** (la pantalla se apaga sola por la propia laptop). | El navegador y el ping siguen vivos; al abrir, nada que despertar. |
| Tapa con batería | Cerrar la tapa **suspende**. | Que la batería no se agote en la bolsa o el mostrador. |
| Sin bloqueos | Sin salvapantallas, sin bloqueo de pantalla, sin bienvenida de Mint. | Al abrir la tapa no debe pedir contraseña. |
| Ping al backend | Un `GET /salud` cada 10 min, **solo de 05:30 a 21:30** (hora de El Salvador); además uno al arrancar y otro al despertar de una suspensión. | Render gratis duerme el backend tras 15 min sin tráfico (el primer pedido tarda ~1 min). |

Las direcciones de producción (tienda y backend) salen de `scripts/pos/instalar.sh`, que las escribe en
`/etc/tienda-pos.conf` de la laptop la primera vez (no pisa el archivo si ya existe). Contexto del despliegue y de por
qué se mantiene despierto el backend: [`deployment.md`](deployment.md).

**El horario y las 750 horas.** Render gratis regala 750 horas de instancia al mes (un mes de 31 días tiene 744 h,
así que mantenerlo despierto 24/7 casi gasta todo y no deja margen). Con el ping de 16 h al día se usan unas ~500 h;
de noche el backend se duerme solo. Si alguien usa el sistema fuera de horario, el primer pedido tarda ~1 min en
responder mientras Render despierta: es normal.

**La sesión de 12 horas.** El ERP cierra la sesión a las 12 h. **Cada mañana** hay que entrar con usuario y
contraseña **del ERP** (así el sistema sabe quién abrió la caja). Eso no se evita ni se automatiza: es la única
contraseña que la dueña o la cajera escriben.

## Qué se necesita

- Una memoria USB de 4 GB o más (se borra por completo).
- Internet (Wi-Fi o cable) durante la instalación.
- La laptop de la tienda **enchufada**, y respaldada: **instalar Mint borra todo el disco**.
- Otra computadora con Windows para crear el USB y para guiar el proceso.
- Un lugar seguro donde anotar la contraseña de Linux del usuario `tienda` (solo la usa el administrador, para
  mantenimiento).

## Paso 1. Crear el USB desde Windows

1. Entrar a <https://linuxmint.com/download.php> y elegir **Linux Mint 22 Xfce Edition** (64 bits). Descargar el
   `.iso` desde un espejo cercano (~3 GB).
2. En la misma página de descarga hay un enlace "Verify your download" con el archivo de sumas `sha256sum.txt`.
   Comprobar la suma en PowerShell:
   ```powershell
   Get-FileHash -Algorithm SHA256 "$env:USERPROFILE\Downloads\linuxmint-22-xfce-64bit.iso"
   ```
   (usa el nombre real del archivo descargado). El resultado debe ser **idéntico** a la línea de ese `.iso` en
   `sha256sum.txt`. Si no coincide, descargar de nuevo.
3. Grabarlo en el USB con **balenaEtcher** (<https://etcher.balena.io>): Flash from file → el `.iso` → Select
   target → el USB → Flash. (Alternativa: Rufus, <https://rufus.ie>, con los valores por defecto, modo imagen ISO.)

**Cómo comprobarlo:** al terminar, Etcher dice "Flash Complete" y valida la copia.

## Paso 2. Instalar Linux Mint 22 Xfce en la laptop

1. Con la laptop **enchufada** y el USB puesto, encenderla y entrar al menú de arranque (según la marca:
   `F12`, `F9`, `F10`, `Esc` o `F2` repetidamente al encender). Elegir el USB (a veces dice "UEFI: nombre del USB").
2. En el menú de Mint elegir "Start Linux Mint". Cuando cargue el escritorio de prueba, conectar el Wi-Fi si hace
   falta (icono de red, abajo a la derecha) y abrir **Install Linux Mint** (icono en el escritorio).
3. En el instalador:
   - Idioma: **Español**. Distribución del teclado: la del teclado real (normalmente "Spanish (Latin American)").
   - Marcar **instalar códecs multimedia** (opcional, inofensivo).
   - Tipo de instalación: **Borrar el disco e instalar Linux Mint** (si no hay datos que conservar; esto borra todo).
     No activar el cifrado del disco (impediría el inicio automático).
   - Zona horaria: **San Salvador**.
   - Datos del usuario:
     - Nombre del equipo: `tienda-pos`.
     - Nombre de usuario: **`tienda`** (exactamente así).
     - Contraseña: la elige el usuario, **la anota en un lugar seguro y no la comparte en el chat**.
     - Marcar **"Iniciar sesión automáticamente"** (*Log in automatically*). **No** marcar "Cifrar mi carpeta personal".
4. Esperar a que termine, **Reiniciar ahora** y retirar el USB cuando lo pida.

**Cómo comprobarlo:** al reiniciar, la laptop llega sola al escritorio de Mint (sin pedir la contraseña). Si la
pide, no pasa nada: el instalador del siguiente paso también configura el inicio automático.

## Paso 3. Traer el repositorio y correr el instalador

En el escritorio de Mint: conectar a internet, abrir la terminal (`Ctrl+Alt+T`) y correr:

```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/viscarradp/Proyecto-Tienda.git
cd Proyecto-Tienda
sudo bash scripts/pos/instalar.sh tienda
```

`sudo` pedirá la contraseña de Linux del usuario `tienda` (la escribe el usuario, no el chat; al teclearla no se
ve nada, es normal).

**Alternativa por USB** (solo si la laptop no tiene internet o la descarga falla por otra razón; el repo es público y
la descarga normal no pide credenciales):

1. En la otra computadora, en GitHub, descargar el repo como ZIP (Code → Download ZIP) o copiar solo la carpeta
   `scripts/pos/`.
2. Pasarlo en una memoria USB, copiarlo a la carpeta personal de la laptop y abrir una terminal ahí.
3. Si es un ZIP: `unzip Proyecto-Tienda-master.zip` (si falta `unzip`: `sudo apt install -y unzip`) y entrar a la
   carpeta. Correr con `sudo bash scripts/pos/instalar.sh tienda` (o `sudo bash pos/instalar.sh tienda` si se copió
   solo esa carpeta; hay que mantener **todos** los archivos de `pos/` juntos).
4. Si sale un error como `\r: orden no encontrada`, los archivos llegaron con saltos de línea de Windows. Arreglar
   con: `sed -i 's/\r$//' scripts/pos/*` y repetir.

El instalador se puede repetir las veces que haga falta. Al final imprime un **resumen** de lo hecho y lo que falta
verificar.

**Cómo comprobarlo:** el resumen termina con "Instalación terminada" y sin la línea `ERROR`. Revisar también:

```bash
systemctl is-enabled tienda-despierta.timer      # debe decir: enabled
cat /etc/tienda-pos.conf                         # direcciones y horario
ls /opt/tienda-pos                               # los scripts copiados
```

Después, **reiniciar**: `sudo reboot`.

## Paso 4. Ajustes por interfaz gráfica (solo si el script no pudo)

El instalador intenta dejar los ajustes de energía por línea de comandos. Si no había sesión gráfica activa, los
aplica solo en el primer inicio. Comprobarlos tras reiniciar (esperar ~1 minuto con el escritorio ya cargado, o
`Ctrl+Alt+T` para salir del kiosco; ver "Mantenimiento"):

```bash
xfconf-query -c xfce4-power-manager -lv | grep -E 'lid|lock|dpms|blank'
```

Debe verse `lid-action-on-ac 0`, `lid-action-on-battery 1` y `lock-screen-suspend-hibernate false`. Si no aparecen
(o quiere hacerlo a mano), por interfaz: **Menú → Configuración → Gestor de energía**:

- Pestaña **General**: *Al cerrar la tapa del portátil*: **Con corriente** → *Nada* (o *Apagar pantalla* si la
  versión lo ofrece); **Con batería** → *Suspender*. Desmarcar *Bloquear pantalla cuando el sistema vaya a dormir*.
- Pestaña **Pantalla**: con corriente, *Pantalla en blanco*, *Dormir* y *Apagar* en **Nunca**.

Salvapantallas y bloqueo: **Menú → Configuración → Salvapantallas** (*Xfce Screensaver*): desactivar *Activar el
salvapantallas* y *Activar el bloqueo de pantalla*. Si en el menú aparece *Bloqueador de luz* (*light-locker*),
desactivarlo también.

Inicio automático (si el Paso 2 no lo dejó): **Menú → Administración → Pantalla de inicio de sesión** → pestaña
*Ajustes* → *Inicio de sesión automático* → `tienda`. (El instalador ya escribe
`/etc/lightdm/lightdm.conf.d/90-tienda-autologin.conf`; esto es un respaldo.)

## Lista de verificación

Hacerlas en orden. No se da por terminada la instalación hasta que todas pasen.

1. **Reiniciar** (`sudo reboot`) → la laptop entra **sola** al escritorio y en unos segundos se abre la tienda a
   pantalla completa (la pantalla de entrada del ERP, o directo su pantalla si la sesión de 12 h sigue vigente). Sin contraseña de Linux y sin ventanas de "restaurar
   páginas".
2. **Tapa enchufada:** con la laptop enchufada, cerrar la tapa 1 minuto y abrirla → la tienda sigue ahí, **sin pedir
   contraseña**. (La luz de encendido no debe quedar "respirando" con la tapa cerrada.)
3. **Navegador cerrado:** con el teclado, `Alt+F4` → la ventana se cierra y **se vuelve a abrir sola** en ~5 s.
4. **Ping:** abrir terminal (`Ctrl+Alt+T`) y correr
   ```bash
   journalctl -t tienda-despierta -n 20 --no-pager
   ```
   Debe haber líneas `OK: https://proyecto-tienda-nbi6.onrender.com/salud respondió 200`. (Si la laptop acaba de
   arrancar, el primero sale del arranque.) Fuera de horario aparece "Fuera de horario … no se hace ping": es lo
   esperado.
5. **Timer:** `systemctl list-timers tienda-despierta.timer` → muestra la columna NEXT con la próxima hora.
6. **Tapa con batería:** **desenchufar**, cerrar la tapa → la laptop **suspende** (luz parpadeando o apagada). Abrir
   → vuelve al instante **sin pedir contraseña** y la tienda sigue. Volver a enchufar.
7. **Ping tras suspender:** `journalctl -t tienda-despierta -n 5 --no-pager` → aparece un ping poco después de abrir.
8. **Zona horaria:** `timedatectl | grep "Time zone"` → `America/El_Salvador`.

Si algo falla, ver "Si algo falla".

## Mantenimiento: salir del kiosco y volver

El kiosco no tiene barra ni menús. Para el administrador:

1. Pulsar **`Ctrl+Alt+T`**: abre la terminal de Mint (si no se ve por encima de la tienda, probar `Alt+Tab`).
   Alternativa si no responde: `Ctrl+Alt+F3` abre una consola de texto (entrar con `tienda` y su contraseña;
   volver a la pantalla con `Ctrl+Alt+F7` o `Ctrl+Alt+F1`).
2. Detener el kiosco: **`tienda-kiosco-parar`** (cierra Chromium y evita que se reabra). Ahora el escritorio de
   Xfce queda libre para trabajar.
3. Volver a encenderlo: **`tienda-kiosco-iniciar`**, o simplemente reiniciar la laptop. La pausa se borra sola al
   reiniciar o cerrar sesión (vive en `/run/user/<id>/tienda-kiosco-pausado`), así que **reiniciar siempre devuelve el
   kiosco**: no hay forma de dejarlo apagado por accidente.

Estos comandos se corren **sin `sudo`**.

## Cambiar el horario o las direcciones

Todo vive en **`/etc/tienda-pos.conf`**. Editarlo con:

```bash
sudo nano /etc/tienda-pos.conf
```

(guardar con `Ctrl+O`, Enter; salir con `Ctrl+X`). Variables:

| Variable | Qué es |
|---|---|
| `URL_TIENDA` | Dirección que abre el kiosco: la raíz del frontend (`https://proyecto-tienda-sand.vercel.app/`), que lleva a la pantalla de entrar o directo a la del sistema si la sesión sigue vigente. |
| `URL_SALUD` | Dirección que se "despierta" con el ping (el `/salud` del backend). |
| `HORA_INICIO`, `HORA_FIN` | Horario del ping, formato `HH:MM`, hora de El Salvador. |
| `USUARIO_KIOSCO` | Usuario de Linux del kiosco (`tienda`). |

El ping lee el archivo en cada ejecución (no hay que reiniciar). El kiosco lee `URL_TIENDA` cada vez que abre el
navegador: para aplicarlo, `tienda-kiosco-parar` y luego `tienda-kiosco-iniciar`.

## Actualizaciones de Mint

No se actualiza solo en el kiosco. De vez en cuando (por ejemplo una vez al mes, con la laptop enchufada y fuera de
horario de venta): salir del kiosco y correr

```bash
sudo apt update && sudo apt upgrade -y
```

y reiniciar. También se puede usar el **Gestor de actualizaciones** del menú. Si se actualiza Chromium, el kiosco
usa la versión nueva al reabrirse.

## Si algo falla

**Pantalla negra al abrir la tapa.** Pulsar una tecla o el botón de encendido (una pulsación corta). Si sigue
negra: mantener el botón de encendido 5 s para apagar, encender de nuevo (entra sola). Si se repite, revisar que
con corriente la tapa esté en "Nada" (Paso 4) y que `/etc/systemd/logind.conf.d/50-tienda-tapa.conf` exista.

**Pide contraseña al abrir la tapa o tras suspender.** Es el bloqueo de pantalla. Salir del kiosco y repetir el
Paso 4 (desactivar el bloqueo y *Bloquear pantalla cuando el sistema vaya a dormir*); comprobar con
`xfconf-query -c xfce4-power-manager -lv | grep lock`. Si es la pantalla de entrada de Linux (no la de bloqueo) al
**encender**, revisar el inicio automático: `cat /etc/lightdm/lightdm.conf.d/90-tienda-autologin.conf` debe mostrar
`autologin-user=tienda`.

**Chromium pide una contraseña de "llavero" al abrir.** No debería: el kiosco usa `--password-store=basic`. Si pasa,
comprobar que se abrió con el script (`ps aux | grep tienda-kiosco`) y no a mano.

**La tienda no carga o dice que no hay conexión.**
1. Revisar internet (otra página, el icono de red).
2. Si hay internet, el backend de Render puede estar dormido: **esperar 1 minuto** y pulsar `F5`. Probar
   `https://proyecto-tienda-nbi6.onrender.com/salud` en otro dispositivo: debe responder `{"estado":"ok"}`.
3. Si el kiosco abrió sin internet y quedó con la página de error, `F5` la recarga cuando vuelva la red.
4. Ver el ping: `journalctl -t tienda-despierta -n 20 --no-pager`. Líneas "Sin respuesta … ¿Sin internet?" confirman un
   problema de red.

**Pide usuario y contraseña del ERP.** Es normal por la mañana (la sesión dura 12 h). Es la entrada del sistema, no
de Linux.

**Se fue la luz.** Esperar a que vuelva y pulsar el botón de encendido: la laptop arranca, entra sola y abre la
tienda. Si el sistema pregunta algo al arrancar tras un apagón (chequeo de disco), esperar sin tocar.

**El kiosco no se reabre tras `Alt+F4`.** Quizá quedó en pausa (se quita al reiniciar): `tienda-kiosco-iniciar`. Si el comando no existe,
el instalador no terminó: repetir el Paso 3.

**Volver a empezar.** `sudo bash scripts/pos/desinstalar.sh` deshace los cambios (no desinstala paquetes);
`sudo bash scripts/pos/instalar.sh tienda` los vuelve a poner.

## Opcional: respaldo con un monitor externo (UptimeRobot)

Si la laptop está apagada, el ping no corre. Un monitor gratuito puede hacer lo mismo desde internet:

1. Crear cuenta en <https://uptimerobot.com> (plan gratis).
2. *Add New Monitor* → tipo **HTTP(s)** → URL `https://proyecto-tienda-nbi6.onrender.com/salud` → intervalo de
   5 a 10 min (el mínimo del plan gratis es 5 min).
3. **Ojo con las 750 horas:** un monitor 24/7 mantiene despierto el backend todo el mes y gasta todas las horas.
   Úselo solo como respaldo con **horario de monitoreo** (si el plan lo permite) o actívelo solo cuando la laptop
   falle; la alerta por correo de "caído" sirve aunque no se use para despertar.

## Resumen de archivos (para el mantenimiento)

| Ruta en la laptop | Qué es |
|---|---|
| `/etc/tienda-pos.conf` | Configuración (direcciones, horario, usuario). |
| `/opt/tienda-pos/` | Scripts copiados por el instalador. |
| `/etc/systemd/system/tienda-despierta*.{service,timer}` | Ping de salud (timer, arranque, despertar). |
| `/etc/systemd/logind.conf.d/50-tienda-tapa.conf` | Comportamiento de la tapa. |
| `/etc/lightdm/lightdm.conf.d/90-tienda-autologin.conf` | Inicio de sesión automático. |
| `~/.config/autostart/tienda-kiosco.desktop` | Arranque del kiosco. |
| `~/.config/tienda-kiosco/` | Perfil propio de Chromium (guarda la sesión del ERP). |
