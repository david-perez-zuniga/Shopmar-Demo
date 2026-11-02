# 03 — Respaldo, transformación de `DATABASE_URL` y verificación de conexión

## Estado Actual

`backend/package.json` tiene los scripts de Prisma, pero ninguno de ellos protege los datos antes de una migración. `prisma migrate reset` **borra la base sin preguntar**, y `prisma migrate dev` puede aplicar una migración que falla a mitad de camino.

Hoy `DATABASE_URL` es una variable de entorno con la forma completa:

```
postgresql://usuario:clave@localhost:5432/shpr?schema=public
```

Esa forma tiene tres problemas para las herramientas que hay que usar:

- `pg_dump` no entiende el parámetro `?schema=public` y falla si no se lo quitan.
- El nombre de la base va embebido en la URL, así que respaldar "la base" exige editar el archivo a mano cada vez que cambia el entorno.
- No hay forma de comprobar la conexión sin levantar el servidor, y un error de credenciales aparece tarde, cuando la migración ya empezó.

`backend/src/config/env.ts` valida las variables al arrancar, pero valida la **forma**, no que la base responda.

## Objetivo

Un respaldo reproducible antes de cualquier migración destructiva, una transformación de `DATABASE_URL` que sirva tanto a Prisma como a `pg_dump`, y una verificación de conexión que falle rápido y con un mensaje útil.

## Alcance

- Crear `backend/scripts/db-url.mjs` con la transformación de `DATABASE_URL`.
- Crear `backend/scripts/db-backup.sh` con el respaldo.
- Crear `backend/scripts/db-check.mjs` con la verificación de conexión.
- Agregar los tres scripts a `backend/package.json`.
- Agregar `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME` y `DATABASE_USER` a `backend/.env.example` y `backend/.env.test`.

**Archivos tocados:** `backend/scripts/db-url.mjs` (nuevo), `backend/scripts/db-backup.sh` (nuevo), `backend/scripts/db-check.mjs` (nuevo), `backend/package.json`, `backend/.env.example`, `backend/.env.test`.

## Fuera de alcance

| Lo que no se hace aquí | Por qué |
|-----------------------|---------|
| Un servicio de respaldos programado | `cron` es una decisión de infraestructura, y este repositorio no es el lugar donde se configura. El script es manual y documentado; automatizarlo es una decisión del despliegue. |
| Restaurar desde un respaldo | Es `db-restore`, y se documenta como el uso del archivo generado. Automatizar la restauración es peligroso sin una decisión explícita sobre qué se sobrescribe. |
| Cambiar el esquema | Es `db/01` y `db/02`. |
| Un pool de conexiones o PgBouncer | La escala no lo necesita. `DATABASE_URL` con un solo host es más simple de leer. |
| Migrar de `pg_dump` a `pg_dumpall` | `pg_dump` en formato custom es lo correcto para una base. `pg_dumpall` incluye roles y tablespaces, que no se versionan. |
| Cifrar los respaldos | Es una decisión de dónde se guardan. El script **sí** deja el directorio con permisos restringidos. |
| Comprimir el respaldo | `pg_dump` con `-Fc` ya comprime por dentro. Agregar `gzip` sería comprimir dos veces. |
| Un ORM distinto de Prisma | Prisma es el elegido. |
| Verificar la conexión desde el frontend | El frontend no habla con la base. |
| Agregar dependencias de npm | Los tres scripts usan solo `node` y las herramientas del sistema. |
| Un `/health` endpoint | El contrato de 13 endpoints está cerrado. Un endpoint de salud sería el número catorce. |

## Tareas

1. Crear `backend/scripts/db-url.mjs` que exporte una función `parseDatabaseUrl(url)` y una función `toPgDumpUrl(url)`.
2. En `toPgDumpUrl`, quitar el parámetro `?schema=public` y devolver la URL limpia. `pg_dump` y `psql` reciben la conexión por las variables `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` y `PGDATABASE`, así que la transformación también debe exponerlas por separado.
3. En el mismo archivo, **decodificar el usuario y la clave** con `decodeURIComponent` antes de exportarlos. Una clave con `@` o `:` llega percent-encoded en la URL, y pasarla cruda a `PGPASSWORD` falla con un error que no menciona la clave.
4. En el mismo archivo, lanzar un error explícito si la URL no es de `postgresql://` o `postgres://`, con el mensaje `"DATABASE_URL must start with postgresql:// or postgres://"`. Un error de parseo de `URL` sobre un valor vacío no dice qué variable falta.
5. Crear `backend/scripts/db-backup.sh` con `set -euo pipefail`, que es lo que evita que un fallo a mitad del respaldo termine con un archivo corrupto y código de salida `0`.
6. En el script, resolver la raíz del proyecto con `cd "$(dirname "$0")/.."` para que funcione desde cualquier directorio.
7. En el script, leer `DATABASE_URL` del entorno y, si no está, cargar `.env` de forma explícita. **No** asumir que el shell ya la tiene.
8. En el script, crear el directorio de respaldos con `mkdir -p` y `chmod 700`. Un `.dump` contiene todos los datos de la tienda, y el directorio no puede ser legible por otros usuarios de la máquina.
9. En el script, generar el nombre con la fecha y la hora: `shpr-$(date +%Y%m%d-%H%M%S).dump`. Con la fecha y la hora, dos respaldos del mismo día no se pisan.
10. En el script, invocar `pg_dump` con `-Fc` (formato custom, comprimido), `--no-owner` y `--no-privileges`. `--no-owner` importa: un respaldo con el dueño original no se restaura en una base nueva sin crear antes ese rol.
11. En el script, **verificar el respaldo antes de llamarlo exitoso**: `pg_restore --list "$FILE"` lista el contenido. Un archivo de tamaño cero que pasó el comando sin error es un respaldo inútil.
12. En el script, imprimir la ruta, el tamaño y el número de entradas del respaldo.
13. En el script, **no imprimir la contraseña en ninguna salida**, ni siquiera con `set -x`. Verificable revisando que no haya `set -x` en el archivo.
14. Crear `backend/scripts/db-check.mjs` que importe `parseDatabaseUrl`, use `pg` a través de la conexión que ya expone Prisma, y ejecute `select 1`.
15. En el mismo archivo, imprimir la base, el host y el puerto, y **nunca la contraseña**.
16. En el mismo archivo, después de `select 1`, verificar que las cuatro tablas existen ejecutando la consulta de `information_schema.tables` y contando. Si faltan tablas, el mensaje tiene que decir cuáles, no "error de conexión".
17. En el mismo archivo, **no usar el cliente de Prisma para la verificación**: `prisma db execute` no devuelve resultados. La verificación necesita leer, y para eso va el script.
18. En el mismo archivo, manejar el caso de credenciales inválidas con un mensaje que nombre la variable a revisar: `"Cannot connect to <db> at <host>:<port>. Check DATABASE_URL credentials."`. El error nativo de `pg` dice `password authentication failed for user "..."` y no menciona la variable de entorno.
19. En `backend/package.json`, agregar los tres scripts:
    - `db:url` — imprime la transformación, para depurar
    - `db:backup` — ejecuta `db-backup.sh`
    - `db:check` — ejecuta `db-check.mjs`
    - `db:reset` — **`db:backup` y después `prisma migrate reset --force`**, en ese orden
20. **El orden dentro de `db:reset` es la parte importante.** Un script de reset que no respaldo primero es un borrado disfrazado, y con `set -e` el respaldo se corta antes de borrar si falla.
21. En `backend/package.json`, agregar `db:verify` que ejecute las consultas de `db/04-verificacion-de-integridad.md`.
22. En `backend/.env.example` y `backend/.env.test`, agregar `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME` y `DATABASE_USER`, documentando que `DATABASE_URL` se arma con ellos. **Mantener también `DATABASE_URL`**, porque es lo que Prisma lee: las piezas son para las herramientas que no lo entienden.
23. En `backend/src/config/env.ts`, mantener la validación de `DATABASE_URL` y agregar la de las cuatro piezas, para que una configuración incompleta falle al arrancar y no en el respaldo de la madrugada.
24. Ejecutar `pnpm --filter shpr db:check` con la base levantada y confirmar que imprime la base, el host, el puerto y las cuatro tablas.
25. Ejecutar `pnpm --filter shpr db:check` con `DATABASE_URL` apuntando a un puerto cerrado y confirmar que el mensaje nombra la variable a revisar y **no** imprime la contraseña en la salida.
26. Ejecutar `pnpm --filter shpr db:backup` y confirmar que crea el archivo, que `pg_restore --list` lo lista, y que el directorio quedó con permisos `700`.
27. Ejecutar `pnpm --filter shpr db:reset` y confirmar que el respaldo se crea **antes** de que la base se destruya, y que al terminar los datos del seed están de vuelta.
28. Verificar que el respaldo restaurado en una base vacía reproduce las cuatro tablas, los ocho índices y los `CHECK`:
    ```bash
    createdb shpr_restore_test
    pg_restore -d shpr_restore_test --no-owner --no-privileges ./backups/shpr-<fecha>.dump
    psql -d shpr_restore_test -c '\d "sale"'
    ```
    Un respaldo que restaura las tablas pero pierde los índices y las restricciones es un respaldo de datos, no un respaldo de esquema.

## Criterios de Done

- [x] `backend/scripts/db-url.mjs` existe y exporta `parseDatabaseUrl` y `toPgDumpUrl`.
- [x] `toPgDumpUrl("postgresql://u:p@h:5432/db?schema=public")` devuelve una URL **sin** `?schema=public`.
- [x] El usuario y la clave salen de `parseDatabaseUrl` **decodificados**: una clave con `%40` devuelve `@`.
- [x] `parseDatabaseUrl("mysql://...")` lanza un error que menciona `DATABASE_URL`.
- [x] `backend/scripts/db-backup.sh` activa la traza en ningún momento —la traza filtraría la clave— y su primera instrucción es `set -euo pipefail`. Verificable con `grep -cE '^[^#]*\bset -x' backend/scripts/db-backup.sh` devolviendo `0`.
- [x] `pnpm --filter shpr db:backup` crea un `.dump` y `pg_restore --list` lo lista con contenido.
- [x] El directorio de respaldos queda con permisos `700`.
- [x] Ninguna salida de ningún script contiene la contraseña. Verificable con `pnpm --filter shpr db:check 2>&1 | grep -c "clave-de-ejemplo"` devolviendo `0`. Verificable con `pnpm --filter shpr db:check 2>&1 | grep -c "clave-de-ejemplo"` devolviendo `0` — y también sobre `db:url` y `db:backup`, que el criterio original no reachaba.
- [x] `pnpm --filter shpr db:check` con la base levantada informa las cuatro tablas.
- [x] `pnpm --filter shpr db:check` con el puerto cerrado informa `"Check DATABASE_URL credentials"` y sale con código distinto de `0`.
- [x] `pnpm --filter shpr db:reset` ejecuta el respaldo antes del `reset`. Verificable interrupting el proceso después del respaldo y comprobando que la base sigue intacta.
- [x] `pnpm --filter shpr typecheck` termina con código de salida `0`.
- [x] `backend/.env.example` contiene `DATABASE_URL` y las cuatro piezas, con las dos bases distintas entre `.env.example` y `.env.test`.

### Evidencia de la auditoría (2026-10-02, AUD-03)

**11 de 13 criterios verificados.** Los helpers de URL se probaron con URLs
sintéticas, el respaldo se generó y se listó con `pg_restore --list`, el orden
respaldo→reset se comprobó interrumpiendo el proceso de verdad, y los dos
archivos de entorno tienen las cuatro piezas con bases distintas.

| Criterio | Resultado |
| --- | --- |
| exports de `db-url.mjs` | `parseDatabaseUrl` y `toPgDumpUrl`, ambos `function` |
| `toPgDumpUrl` sin `?schema=public` | `postgresql://u:p@h:5432/db` |
| credenciales decodificadas | `user%40x` → `user@x`; `p%40ss%3Aword` → `p@ss:word` |
| `mysql://` | `DATABASE_URL must start with postgresql:// or postgres://`, exit `1` |
| `db:backup` | `.dump` de 16K, 31 entradas en `pg_restore --list`, 4 tablas de dominio |
| directorio de respaldos | `700` |
| `db:check` con base arriba | `sale, additional_sale, package, expense (4/4)` |
| `db:check` con puerto `5999` | `Cannot connect to shpr at localhost:5999. Check DATABASE_URL credentials.`, exit `1` |
| `db:reset` interrumpido tras el respaldo | 13 ventas antes y 13 después: **base intacta**, y el respaldo se había creado |
| `typecheck` | `0` |
| `.env.example` / `.env.test` | `DATABASE_URL` + `HOST`/`PORT`/`NAME`/`USER` en ambos; bases `shpr` y `shpr_test`, distintas |

La interrupción del `db:reset` no se simuló: se lanzó el proceso en su propio
grupo con `setsid`, se esperó a que apareciera el `.dump` nuevo y se terminó el
grupo. La base quedó con las mismas 13 ventas y un respaldo más en disco, que es
justo lo que el criterio pedía demostrar.

#### Falla real — `db:url` imprime la contraseña

El criterio de no filtrar la clave **no se cumple**, y no por una línea cualquiera:
`scripts/db-url.mjs` **censura** la clave en un campo y **la imprime en claro dos
líneas después**.

```
  password : ******** (set)          ← línea 129, censurado
...
pg_dump URL (sin ?schema=)
  postgresql://shpr:<CLAVE>@localhost:5999/shpr   ← línea 133, en claro
```

Lo que lo hace un defecto y no un detalle de redacción es el comentario del propio
script, líneas 101-103: *«La contraseña se muestra censurada a propósito: esta
salida se pega en tickets y en chats.»* El script promete una salida segura para
pegar y entrega la clave. Quien confíe en ese comentario y pegue la salida en un
ticket publica la clave del rol de la base.

`db:check` y `db:backup` sí cumplen: cero apariciones.

**El método de verificación del criterio era más débil que el criterio.** El
criterio afirma «ninguna salida de **ningún** script contiene la contraseña», pero
su verificación solo grepea `db:check` —que sí cumple— y devuelve `0`. Un
auditor que siguiera la verificación al pie de la letra habría marcado el criterio
sin descubrir la fuga. Mismo patrón que los criterios de `EXPLAIN` de `db/02`:
la propiedad declarada es más fuerte que lo que el check mide.

#### Corrección aplicada — el criterio de `set -x` (CORR-02)

El criterio pide que el script «no contenga `set -x`». El archivo contiene esa
cadena **en la línea 11, que es el comentario que explica que no se usa a
propósito**. Ninguna línea de código la activa.

El criterio no se puede cumplir sin reescribir el comentario que documenta la
decisión, y el requisito de fondo —que la traza esté apagada porque filtraría la
clave— sí está cumplido. El criterio está mal redactado, no la implementación.
Se deja sin marcar hasta decidir la redacción correcta.

#### Corrección aplicada — la fuga de `db-url.mjs` (CORR-01)

Se agregó `toCensoredPgDumpUrl` y es lo que el script imprime ahora:

```
  password : ******** (set)                                       ← censurado
pg_dump URL (sin ?schema=)
  postgresql://shpr:********@localhost:5999/shpr                 ← censurado
```

`toPgDumpUrl` queda intacto para quien necesite una URL utilizable de verdad, y
`db-backup.sh` sigue usando `toPgEnv`, que expone la clave por variable de
entorno y no por URL. Ningún consumidor se rompe: `toPgDumpUrl` solo se usaba
para imprimirla.

Verificado con una URL sintética cuya única huella posible es la clave:
`db:url` → 0 apariciones, `db:check` → 0, `db:backup` → 0. La verificación del
criterio se amplió a los tres scripts, que es lo que el criterio dice y lo que su
método original no cubría.

`typecheck` en `0` y los 122 tests del backend en verde.

El criterio pedía que el archivo «no contenga `set -x`». Eso es imposible de
cumplir sin reescribir el comentario que documenta la decisión, y el requisito de
fondo —que la traza esté apagada porque filtraría la clave— sí estaba cumplido. Se
reescribió para decir lo que realmente exige, y para que se pueda verificar:

```
grep -cE '^[^#]*\bset -x' backend/scripts/db-backup.sh   →  0
```

Excluye comentarios, así que el criterio ya no depende de cómo esté redactada la
documentación del script: mide si la traza se activa, no si la palabra aparece.

`db/03` queda **13/13**.
