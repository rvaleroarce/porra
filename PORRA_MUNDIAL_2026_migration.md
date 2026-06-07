# Porra Mundial 2026 — Documento de migración a arquitectura web seria

## Contexto del proyecto

Aplicación web de porra deportiva, nacida para el Mundial de Fútbol 2026. Desarrollada
inicialmente como prototipo HTML + Google Apps Script, ahora se migra a una arquitectura
web real, ligera y mantenible.

La lógica de negocio, el modelo de puntuación y el diseño visual ya están **validados en
producción básica**. Esta migración NO es un rediseño: traslada lo que ya funciona a una
base sólida y, de paso, **generaliza el modelo** para soportar varias porras sobre un mismo
torneo.

---

## Decisiones de arquitectura (tomadas)

1. **Stack: Vite + React + TypeScript + Tailwind + Supabase.** Desplegado como SPA estática
   (Vercel o Netlify). Se descartó Next.js: para esta app (una porra entre amigos, lectura
   mayoritaria) el aparato full-stack de Next es más superficie de mantenimiento de la que el
   problema pide. Vite + Supabase resuelve los tres dolores reales —HTML monolítico, lentitud
   del cold start de Apps Script, y falta de mantenibilidad— con la mitad de piezas.

2. **Modelo de dos niveles: `Torneo` y `Porra`.** Se separa la *verdad objetiva del torneo*
   (equipos, partidos, cruces, resultados reales) de la *competición subjetiva* (un grupo de
   usuarios que pronostica, con sus reglas y su clasificación). Un torneo tiene N porras.

3. **Una `Porra` es un subconjunto de partidos del torneo** (de 1 partido a todos), con sus
   propios usuarios, pronósticos, reglas y clasificación. El subconjunto se define mediante un
   **"tipo de porra"** (ver sección dedicada) y se materializa al crearla.

4. **Pronósticos y reglas son por porra; resultados reales son por torneo.** El mismo partido
   se mete una sola vez como resultado y todas las porras de ese torneo se recalculan solas.

---

## Arquitectura actual (lo que se sustituye)

```
porra-app.html   ← SPA monolítica, ~1000 líneas, HTML+CSS+JS mezclados, render manual
Codigo.gs        ← Google Apps Script como backend (~414 líneas)
Google Sheets    ← "base de datos" (8 hojas)
```

**Problemas que motivan la migración:**
- HTML monolítico difícil de mantener; render manual con `innerHTML`, sin tipos, sin tests.
- Apps Script tiene cold start de 1-3 s por petición.
- Google Sheets no es una base de datos real (sin transacciones, sin integridad referencial).
- CORS problemático con Apps Script.
- Modelo de una sola porra: imposible reutilizar para varios grupos o futuros torneos.

---

## Modelo de datos

### Niveles

```
Torneo  ─┬─ estructura fija (equipos, grupos, partidos, cruces)   → fixture en código (seed)
         ├─ resultados reales                                      → BD (results)
         └─ asignación de equipos a los cruces                     → BD (bracket_teams)

Porra   ─┬─ subconjunto de partidos (su "ámbito")                  → BD (porra_matches)
         ├─ estado de fases (abierta/cerrada, fecha límite)        → BD (porra_phases)
         ├─ reglas de puntos                                       → BD (columnas de porras)
         ├─ usuarios                                               → BD (users)
         ├─ pronósticos                                            → BD (predictions)
         └─ envíos bloqueados por fase                             → BD (phase_submissions)
```

**Nota sobre el fixture:** la estructura inmutable del torneo (los 48 equipos, 12 grupos, 72
partidos de grupos y la estructura de cruces) vive en un archivo TypeScript de seed
(`src/lib/fixture.ts`), **no** en tablas. Es un recurso estático que no cambia. Solo lo
*dinámico* (resultados, asignaciones de cruces, y todo lo de las porras) va a Supabase. Para
v1 hay un único torneo cuyo fixture es ese archivo; añadir un segundo torneo en el futuro =
añadir otra definición de fixture, sin construir una UI de autoría de partidos.

### Entidades

#### `torneos`
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
slug        text UNIQUE NOT NULL    -- 'mundial-2026' (enlaza con el fixture en código)
name        text NOT NULL          -- 'Mundial 2026'
created_at  timestamptz DEFAULT now()
```

#### `porras`
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
torneo_id   uuid REFERENCES torneos(id) ON DELETE CASCADE
slug        text UNIQUE NOT NULL    -- identificador del enlace de la porra
name        text NOT NULL          -- 'Porra del bar', 'Solo fase de grupos', ...
tipo        text NOT NULL          -- clave del "tipo de porra" usado al crearla ('TODOS', ...)
exact_pts   integer DEFAULT 3      -- puntos por marcador exacto   (regla POR PORRA)
sign_pts    integer DEFAULT 1      -- puntos por acertar el signo (1X2)
miss_pts    integer DEFAULT 0      -- puntos por fallo
created_at  timestamptz DEFAULT now()
```

#### `porra_matches` (el ámbito materializado: qué partidos cuentan en la porra)
```sql
porra_id    uuid REFERENCES porras(id) ON DELETE CASCADE
match_id    text NOT NULL          -- 'H2', 'R32-1', ...
phase_id    text NOT NULL          -- 'GROUPS' | 'R32' | ... (denormalizado para filtrar rápido)
PRIMARY KEY (porra_id, match_id)
```
> Se rellena **una sola vez al crear la porra**, ejecutando la función del "tipo de porra".
> A partir de ahí, UI, pronósticos, fechas y puntuación solo leen esta tabla.

#### `porra_phases` (estado de cada fase, por porra)
```sql
porra_id    uuid REFERENCES porras(id) ON DELETE CASCADE
phase_id    text NOT NULL          -- solo las fases que toca el ámbito de la porra
open        boolean DEFAULT false  -- el admin la abre/cierra
deadline    date                   -- fecha límite de envío
order_num   integer                -- para ordenar las fases
PRIMARY KEY (porra_id, phase_id)
```

#### `users` (participantes — pertenecen a UNA porra)
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
porra_id    uuid REFERENCES porras(id) ON DELETE CASCADE
name        text NOT NULL
phone       text NOT NULL          -- solo visible para el admin
email       text                   -- opcional; solo para autorrecuperación por magic-link
alias       text                   -- nombre en clasificación (opcional)
paid        boolean DEFAULT false  -- admin lo activa al recibir Bizum
role        text DEFAULT 'user'    -- 'user' | 'admin'
token       text UNIQUE NOT NULL   -- token de acceso personal (enlace)
created_at  timestamptz DEFAULT now()
```

#### `predictions` (pronósticos — POR PORRA)
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
porra_id    uuid REFERENCES porras(id) ON DELETE CASCADE
user_id     uuid REFERENCES users(id) ON DELETE CASCADE
match_id    text NOT NULL
phase_id    text NOT NULL
home_score  integer
away_score  integer
created_at  timestamptz DEFAULT now()
updated_at  timestamptz DEFAULT now()
UNIQUE (porra_id, user_id, match_id)
```
> Clave: el mismo usuario en dos porras pronostica el mismo partido por separado, porque cada
> porra tiene sus propios plazos y reglas. Por eso la unicidad incluye `porra_id`.

#### `phase_submissions` (envíos bloqueados por fase)
```sql
porra_id     uuid REFERENCES porras(id) ON DELETE CASCADE
user_id      uuid REFERENCES users(id) ON DELETE CASCADE
phase_id     text NOT NULL
submitted_at timestamptz DEFAULT now()
PRIMARY KEY (user_id, phase_id)
```

#### `results` (resultados reales — POR TORNEO, los mete el admin)
```sql
torneo_id   uuid REFERENCES torneos(id) ON DELETE CASCADE
match_id    text NOT NULL
home_score  integer
away_score  integer
updated_at  timestamptz DEFAULT now()
PRIMARY KEY (torneo_id, match_id)
```

#### `bracket_teams` (equipos asignados a los cruces — POR TORNEO)
```sql
torneo_id   uuid REFERENCES torneos(id) ON DELETE CASCADE
phase_id    text NOT NULL
match_id    text NOT NULL          -- ej: 'R32-1', 'QF-2'
home        text                   -- equipo local asignado por admin
away        text                   -- equipo visitante asignado por admin
PRIMARY KEY (torneo_id, phase_id, match_id)
```

### Notas sobre el modelo
- Las **reglas de puntos** dejan de ser un singleton global: son columnas de `porras`. Cuesta lo
  mismo y permite que una porra puntúe a 3/1/0 y otra a 2/1/0 sin rediseñar nada.
- El **estado de fase** (abierta/fecha límite) es por porra: una porra "de cuartos a la final"
  ni siquiera tendrá filas de fase de grupos.
- Las eliminatorias tienen cruces predefinidos estructuralmente ("1º A vs 3º C/E/F/H") en el
  fixture, pero los equipos reales los asigna el admin en `bracket_teams` cuando termina la
  fase anterior.

---

## Tipos de porra (cómo se define el ámbito y por qué es extensible)

Un **"tipo de porra"** es, conceptualmente, **una función que, dado un torneo, devuelve qué
partidos entran en la porra**:

```typescript
type TipoPorra = {
  key: string;            // 'TODOS', 'SOLO_GRUPOS', ...
  label: string;          // 'Todos los partidos'
  resolveMatches(torneo: Torneo): { matchId: string; phaseId: string }[];
};
```

Al **crear** una porra se elige un tipo, se ejecuta `resolveMatches(...)` y el resultado se
**materializa** en `porra_matches`; de ahí se derivan también las filas de `porra_phases` (solo
las fases que toca el ámbito). Como todos los tipos de v1 son **estáticos** (el conjunto de
partidos se conoce al crear la porra, no depende de cómo avance el torneo), no hace falta ningún
resolutor dinámico: se calcula una vez y ya.

**La extensibilidad vive en una sola costura:** añadir un tipo nuevo = escribir una función
`resolveMatches` más. No se toca la BD, ni el motor de puntos, ni la UI, porque todo lo demás
solo lee `porra_matches`.

### Tipos previstos
- **`TODOS`** (v1): todos los partidos del torneo, con todas sus fases y fechas. Equivale a la
  app actual.
- **`SOLO_GRUPOS`** (futuro, trivial): solo los 72 partidos de la fase de grupos.
- **`DESDE_CUARTOS`** (futuro, trivial): QF, SF, tercer puesto y final.
- **`SELECCION`** (futuro): partidos elegidos a mano por el admin.

> Caso explícitamente **fuera de v1**: "solo los partidos de un equipo" (p. ej. solo España).
> Es el único ámbito *dinámico* —los partidos de eliminatoria de un equipo no existen hasta que
> se clasifica y se le asigna un cruce—, así que requeriría re-resolver el ámbito al asignar
> cruces. El campo `porras.tipo` ya deja sitio para ello, pero se implementaría en una fase
> posterior con un resolutor que se reejecuta cuando cambian los `bracket_teams`.

**Arranque acordado:** se implementa solo `TODOS` en v1, dejando el modelo y la costura
preparados para añadir el resto sin rediseño.

---

## Lógica de negocio (motor de puntos)

```typescript
type ScoreKind = 'exact' | 'sign' | 'miss';

function scoreMatch(
  prediction: { home: number; away: number },
  result: { home: number; away: number },
  rules: { exact: number; sign: number; miss: number }
): { kind: ScoreKind; points: number } {
  if (prediction.home === result.home && prediction.away === result.away) {
    return { kind: 'exact', points: rules.exact };
  }
  const sign = (h: number, a: number) => (h > a ? 1 : h < a ? -1 : 0);
  if (sign(prediction.home, prediction.away) === sign(result.home, result.away)) {
    return { kind: 'sign', points: rules.sign };
  }
  return { kind: 'miss', points: rules.miss };
}
```

> **Mejora respecto al prototipo:** el `Codigo.gs` actual deduce si un acierto fue "exacto" o
> "de signo" comparando el *valor de los puntos* (`if (s === rules.exact && rules.exact >= rules.sign)`),
> lo que se descuadra si el admin configura `exact == sign`. La versión migrada devuelve el
> **tipo** de acierto explícitamente, así que el desglose exactos/signos es siempre correcto
> sea cual sea la configuración de puntos.

La clasificación de una porra suma los puntos de **sus** partidos (los de `porra_matches`),
sobre los pronósticos de **sus** usuarios. Solo aparecen en la clasificación los usuarios con
`paid = true`.

---

## Flujo de usuario

### Participante (usuario normal)
1. **Entra por el enlace de una porra concreta** (`/p/SLUG_PORRA`). Si no tiene token, se da
   de alta: nombre + móvil + alias (opcional). Se genera un `token` UUID. Se le muestra su
   **enlace personal** (`/p/SLUG_PORRA?u=TOKEN`) para guardar en favoritos. Queda `paid = false`.
2. **Pendiente de pago**: puede rellenar su porra pero NO aparece en la clasificación.
3. **El admin marca pagado**: el usuario entra en la clasificación.
4. **Rellena su porra**: predice el marcador exacto de cada partido de la fase activa (de entre
   los partidos del ámbito de la porra).
5. **Botón "Completar resto a 0-0"**: rellena solo los huecos, no sobreescribe lo ya puesto.
6. **Botón "Enviar porra"**: confirma con diálogo si hay huecos. Una vez enviado, queda
   **bloqueado** para esa fase.
7. **Fecha límite por fase**: si pasa sin enviar, tampoco puede enviar. Bloqueado por fecha.
8. **Recuperación de enlace**: si pierde el enlace, el admin se lo reenvía por WhatsApp.

### Organizador (admin)
1. **Acceso con login real** (Supabase Auth, magic-link por email): pantalla separada. Sin PIN.
2. **Panel de fases** (de la porra): abre/cierra cada fase, fija fecha límite. La asignación de
   equipos a los cruces de eliminatorias es **del torneo** (afecta a todas sus porras).
3. **Panel de resultados** (del torneo): mete el marcador real de cada partido. Todas las porras
   del torneo se recalculan automáticamente.
4. **Panel de reglas** (de la porra): puntos por exacto / signo / fallo.
5. **Panel de usuarios** (de la porra): ve participantes con nombre, alias, móvil, estado de
   pago. Marca pagado/pendiente. Botón de WhatsApp con mensaje pre-escrito que incluye el enlace
   personal. Botón para copiar el enlace.

> **Roles a futuro:** conceptualmente hay un *super-admin* (gestiona el torneo y mete
> resultados reales) y un *admin de porra* (gestiona usuarios, reglas y plazos de su porra). En
> v1 se mantiene un único rol admin (un PIN) que puede ambas cosas; el modelo no impide separar
> los roles más adelante.

---

## Fixture estático (estructura del torneo)

> Vive en `src/lib/fixture.ts`. Se extrae *verbatim* de `porra-app.html` (`const FIXTURE`) y
> `Codigo.gs`. No se reinventa.

### Estructura de fases
```
GROUPS  → Fase de grupos    (72 partidos, 12 grupos A-L, 4 equipos por grupo)
R32     → Dieciseisavos     (32 equipos, 16 partidos)
R16     → Octavos           (16 equipos, 8 partidos)
QF      → Cuartos           (8 equipos, 4 partidos)
SF      → Semifinales       (4 equipos, 2 partidos)
TP      → Tercer puesto     (1 partido)
FN      → Final             (1 partido)
```

### Los 12 grupos (Mundial 2026 — sorteo real)
```
A: México, Sudáfrica, Corea del Sur, Chequia
B: Canadá, Suiza, Qatar, Bosnia y Herzegovina
C: Brasil, Marruecos, Haití, Escocia
D: Estados Unidos, Paraguay, Australia, Turquía
E: Alemania, Curazao, Costa de Marfil, Ecuador
F: Países Bajos, Japón, Túnez, Suecia
G: Bélgica, Egipto, Irán, Nueva Zelanda
H: España, Cabo Verde, Arabia Saudita, Uruguay
I: Francia, Senegal, Noruega, Iraq
J: Argentina, Argelia, Austria, Jordania
K: Portugal, Colombia, Uzbekistán, DR Congo
L: Inglaterra, Croacia, Ghana, Panamá
```

### Cruces de dieciseisavos (estructura prefijada)
```
R32-1:  1º A  vs  3º C/E/F/H        R32-9:  1º G  vs  3º A/E/H/I/J
R32-2:  2º A  vs  2º B              R32-10: 2º G  vs  2º H
R32-3:  1º B  vs  3º E/F/G/I        R32-11: 1º H  vs  3º B/E/F/I
R32-4:  1º C  vs  2º F              R32-12: 1º I  vs  2º L
R32-5:  1º D  vs  3º B/E/F/I/J      R32-13: 1º J  vs  2º D
R32-6:  2º C  vs  2º E              R32-14: 2º I  vs  2º J
R32-7:  1º E  vs  3º A/B/C/D        R32-15: 1º K  vs  3º D/E/I/J/L
R32-8:  1º F  vs  2º C              R32-16: 1º L  vs  2º K
```

Las eliminatorias siguientes (R16 en adelante) se definen como "Ganador del partido X". El
fixture incluye banderas por país (emoji) y, en grupos, fecha y sede de cada partido.

---

## Acceso y seguridad

### Modelo elegido: híbrido (tokens para amigos, login real para admin), sobre RLS

El cimiento es **Row Level Security (RLS) de Postgres/Supabase**: la base de datos decide, fila
por fila, quién puede leer/escribir qué — *aunque el cliente tenga la `anon key` pública*. La
seguridad vive en la capa de datos, no en "confiar en que el cliente se porte bien" (que es como
funciona hoy el prototipo: el único portero es un `if (pin === ...)` en Apps Script).

Decisión tomada: **participantes sin registro (token capability) + admin con Supabase Auth**. Se
descartó el PIN único compartido porque (a) es un secreto que, filtrado una vez, compromete todo
y no caduca, y (b) no puede expresar el futuro super-admin / admin-de-porra, que son *roles sobre
cuentas*.

### Participantes (sin registro, cero fricción)
- Solo nombre + móvil + alias opcional (+ **email opcional**, ver recuperación), **dentro de una
  porra**. Obligarles a crear cuenta mataría la adopción; por eso NO usan Auth de forma
  obligatoria.
- Token UUID (largo, no adivinable) generado al alta; vive en `localStorage`. Identifica al
  usuario y, por tanto, su porra.
- **Enlace de la porra**: `https://dominio/p/SLUG_PORRA` (para unirse).
- **Enlace personal**: `https://dominio/p/SLUG_PORRA?u=TOKEN` (para volver a tu porra).
- El token es un *enlace-capacidad*: con él solo puedes leer/escribir **tus propias filas** (lo
  impone RLS, no el JS). Nunca da acceso a teléfonos ni pronósticos de otros, ni a escribir
  resultados.

#### Pérdida del token / recuperación de acceso
El `localStorage` se pierde con facilidad (borrar datos, cambiar de móvil, modo incógnito), así
que **la copia duradera del acceso NO es el `localStorage`, es el enlace personal**, que vive en
el chat de WhatsApp con el organizador y en el favorito del navegador. La UX debe insistir en
guardarlo al darse de alta. Sobre eso, recuperación por capas:

1. **Admin reenvía (por defecto).** El organizador busca al usuario en su panel, ve su token y
   reenvía el enlace personal por WhatsApp. Robusto, cero infraestructura.
2. **Autorrecuperación por email (opcional).** Quien rellenó el email opcional puede pulsar
   "recuperar acceso", introducirlo y recibir un **magic-link** (reutilizando el mismo Supabase
   Auth del admin) que le devuelve a su porra. Opt-in: no añade fricción a quien no lo quiere.

**Descartado a propósito:** recuperar **solo con el teléfono**. El móvil es semi-público dentro
del grupo; bastaría para suplantar a alguien y enviar/cambiar su porra. El teléfono por sí solo
no recupera acceso.

#### Guard anti-duplicados
Al registrarse, si el **móvil ya existe en esa porra**, NO se crea un usuario nuevo: la app
detecta "esto pareces tú" y ofrece **recuperar** (capa 1 o 2) en lugar de duplicar. Evita
usuarios fantasma y encamina hacia la recuperación.

### Admin (login real)
- **Supabase Auth con magic-link por email** (sin contraseña). Cuentas reales → sesiones JWT,
  varios admins posibles, y encaja con el modelo super-admin (gestiona torneo y resultados) /
  admin-de-porra (gestiona su grupo).
- Las políticas RLS conceden escritura de `results`, `bracket_teams`, pagos y lectura de
  teléfonos **solo a admins autenticados**.
- No hay PIN. No hay secreto compartido que filtrar.

### Datos personales (PII)
- Los **teléfonos** solo son legibles por admins (política RLS). Nunca viajan al cliente de un
  participante ni aparecen en la clasificación pública.

### Seguridad de pronósticos (en servidor, no solo en cliente)
- Si una fase está enviada (`phase_submissions`) o pasó su `deadline`, la escritura se **rechaza
  en servidor** (RLS + constraints, o la Edge Function de escritura). El cliente además lo
  bloquea visualmente.

### Higiene del repositorio
- El repo es **público**. Ningún secreto en el código: `service_role key` y credenciales solo en
  funciones server-side / variables de entorno del proveedor. La `anon key` sí puede ir en el
  cliente (es pública por diseño; la protege RLS).
- Nota del prototipo: el `ADMIN_PIN` actual vive en `Codigo.gs`, que está en `.gitignore` (no se
  subió). Aun así, al apagar el backend de Apps Script conviene **rotarlo/retirarlo**, ya que la
  URL del Web App sí es pública en `porra-app.html`.

---

## Capa de datos (Vite + Supabase, sin servidor propio)

No hay API Routes ni backend propio. El cliente habla con Supabase:

- **Lecturas públicas** (estado de la porra: fases, resultados del torneo, clasificación,
  bracket) → directas vía `supabase-js` con **RLS** que permite lectura anónima.
- **Escrituras críticas** (alta, guardar pronósticos, enviar fase, y todas las de admin) → o
  bien directas con **políticas RLS** que las validan (fase abierta, no enviada, no vencida; rol
  admin autenticado), o bien a través de **funciones server-side** (RPC de Postgres / Edge
  Functions) cuando la lógica no se exprese cómodamente solo con RLS. El cliente nunca escribe
  tablas críticas sin pasar el filtro de la BD.

Esto reproduce limpiamente las "acciones" del actual `Codigo.gs` (`register`, `savePred`,
`submitPhase`, `setResult`, `setPaid`, ...), pero con validación transaccional real.

### Operaciones (equivalente a los endpoints del prototipo)

| Operación        | Tipo    | Entrada                                   | Notas |
|------------------|---------|-------------------------------------------|-------|
| `boot`           | lectura | `porraSlug`, `token?`                      | Estado de la porra + (si hay token) datos del usuario, en una llamada. `me = null` si el token no existe. |
| `register`       | escr.   | `porraSlug, name, phone, alias`           | Crea usuario en la porra, devuelve `{ user, token }`. |
| `savePred`       | escr.   | `token, phase, preds`                      | Valida fase abierta, no enviada, no vencida. Upsert por `(porra,user,match)`. |
| `submitPhase`    | escr.   | `token, phase, preds?`                     | Guarda pronósticos opcionales y bloquea la fase. Idempotente. |
| `adminState`     | lectura | `porraSlug`                                | Como `boot` + `users` con teléfonos y tokens. **Requiere sesión admin.** |
| `setResult`      | escr.   | `torneoId, matchId, home, away`            | Resultado real (nivel torneo). **Sesión admin.** |
| `setBracket`     | escr.   | `torneoId, phase, matchId, home, away`     | Asigna equipos a un cruce (nivel torneo). **Sesión admin.** |
| `setPhase`       | escr.   | `porraId, phase, open, deadline`           | Estado de fase (nivel porra). **Sesión admin.** |
| `setRules`       | escr.   | `porraId, exact, sign, miss`               | Reglas (nivel porra). **Sesión admin.** |
| `setPaid`        | escr.   | `userId, paid`                             | Marca pagado. **Sesión admin.** |
| `deleteUser`     | escr.   | `userId`                                   | Elimina usuario. **Sesión admin.** |
| `createPorra`    | escr.   | `torneoId, name, tipo`                     | Crea porra y **materializa** `porra_matches`/`porra_phases`. **Sesión admin.** |

> "Sesión admin" = JWT de Supabase Auth con rol admin; lo comprueban las políticas RLS / la
> función. No viaja ningún PIN.

---

## Diseño y UX

### Principios
- **Mobile-first**: el uso principal es el móvil del participante.
- **Ligero**: sin librerías pesadas de UI; Tailwind basta.
- **Banderitas**: emoji de bandera por país (funcionan en iOS/Android/Mac; en Windows 10 no,
  pero el uso principal es móvil).
- **Feedback inmediato**: spinners, toasts de confirmación, estados de carga visibles.
- **Pantallas, no modales, para acciones críticas**: alta, login de admin y envío van en rutas
  propias, no en modales (los modales con eventos async dan problemas con extensiones de
  navegador). Esta es una lección ya aprendida del prototipo: respetarla.

### Paleta de colores (mantener del prototipo)
```css
--bg:      #0b1020   /* fondo principal */
--bg2:     #121a33   /* fondo secundario */
--card:    #161f3d   /* tarjetas */
--line:    #26315a   /* bordes */
--ink:     #eaf0ff   /* texto principal */
--muted:   #8b97c4   /* texto secundario */
--faint:   #5663a0   /* texto terciario */
--accent:  #ff5a36   /* naranja-rojo principal */
--accent2: #ffb627   /* amarillo dorado */
--green:   #3ddc97   /* éxito */
--gold:    #ffd24a   /* acierto exacto */
--blue:    #4ea8ff   /* info / admin */
```

### Header
```
Gradiente naranja-amarillo (accent → accent2)
Título: "Mundial 2026" en Bricolage Grotesque 800
Subtítulo: "Canadá · México · EE. UU."
```

### Navegación por pestañas
- **Usuario**: "📝 Mi porra" | "🏆 Clasificación"
- **Admin**: "🏆 Clasificación" | "⚙️ Admin"
- Pestañas completamente separadas según rol; el usuario nunca ve opciones de admin.

### Vista "Mi porra"
- Selector de fase (pills con scroll). Fases cerradas con 🔒. Solo se muestran las fases del
  ámbito de la porra.
- Selector de grupo (chips A-L) para la fase de grupos.
- Tarjeta de estado de la fase: barra de progreso, badge de fecha límite, mensaje de
  enviada/bloqueada.
- Lista de partidos: banderitas, nombres, inputs de marcador (home:away). Solo los partidos del
  ámbito de la porra.
- Cuando hay resultado real, cada partido muestra su puntuación (+3 Exacto / +1 Signo / 0 Fallo)
  con color.
- Barra sticky inferior: "Completar resto a 0-0" + "Enviar porra ➜".
- Inputs y botón de enviar **bloqueados durante la carga inicial** (hasta confirmar estado con
  el servidor), si ya se envió, o si pasó la fecha límite.

### Vista "Clasificación"
- Stats: partidos jugados / participantes pagados / regla de puntos activa.
- Tabla con posición (🥇🥈🥉 para los tres primeros), alias/nombre, aciertos exactos, aciertos
  de signo, puntos totales. Fila del usuario actual resaltada. Solo usuarios `paid = true`.

### Panel "Admin"
- Secciones: Fases | Resultados | Reglas | Usuarios (y, a futuro, Porras del torneo).
- **Fases** (porra): toggle abierta/cerrada, fecha límite.
- **Resultados** (torneo): navegador de fases/grupos, inputs de marcador. Inputs para asignar
  equipos reales a los cruces (datalist de los 48 países).
- **Reglas** (porra): inputs numéricos para exacto/signo/fallo. Se guardan al cambiar.
- **Usuarios** (porra): resumen pagados/pendientes/total. Lista con nombre, alias, móvil,
  estado. Botones: "Marcar pagado", "WhatsApp" (`wa.me/34XXXXXXXXX?text=...` con mensaje
  pre-escrito y enlace personal), "Enlace" (copia al portapapeles), "✕" (elimina).

---

## Estructura de carpetas propuesta (Vite + React)

```
/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── src/
│   ├── main.tsx                ← entrada, router
│   ├── App.tsx
│   ├── routes/
│   │   ├── PorraView.tsx       ← vista participante (Mi porra + Clasificación)
│   │   ├── Register.tsx        ← alta de participante en una porra
│   │   ├── Admin.tsx           ← panel admin (Clasificación + Admin)
│   │   └── AdminLogin.tsx      ← pantalla de PIN
│   ├── components/
│   │   ├── MatchCard.tsx       ← tarjeta de partido con inputs
│   │   ├── PhaseSelector.tsx   ← pills de fases
│   │   ├── GroupChips.tsx      ← chips A-L
│   │   ├── Standings.tsx       ← tabla de clasificación
│   │   ├── LoadingOverlay.tsx  ← overlay de carga
│   │   └── Toast.tsx           ← notificaciones
│   ├── lib/
│   │   ├── fixture.ts          ← estructura del torneo (equipos, grupos, partidos, cruces, banderas)
│   │   ├── porraTypes.ts       ← funciones "tipo de porra" (resolveMatches)
│   │   ├── scoring.ts          ← motor de puntos (scoreMatch, computeStandings)
│   │   ├── supabase.ts         ← cliente de Supabase
│   │   └── api.ts              ← wrappers de lectura/RPC
│   ├── hooks/
│   │   ├── useBootData.ts      ← carga inicial (estado de la porra + usuario)
│   │   └── useToken.ts         ← token en localStorage
│   └── types/
│       └── index.ts            ← tipos del dominio (Torneo, Porra, Match, Prediction, ...)
├── supabase/
│   ├── migrations/             ← SQL del esquema
│   ├── seed.sql                ← torneo 'mundial-2026' + fases base
│   └── functions/              ← RPC / Edge Functions de las escrituras críticas
└── public/
    └── flags/                  ← (opcional) banderas en imagen si se quieren reales
```

> Enrutado con React Router (URLs limpias: `/p/:slug`, `/p/:slug/register`, `/admin`). El
> prototipo hace enrutado por estado; cualquiera de los dos sirve, pero con varias porras las
> URLs propias son más cómodas.

---

## Variables de entorno

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...           ← pública (cliente), protegida por RLS
SUPABASE_SERVICE_ROLE_KEY=eyJ...        ← solo en funciones server-side, nunca en cliente
```
> Sin `ADMIN_PIN`: el admin entra con Supabase Auth (magic-link). El rol admin se marca en la
> propia BD (p. ej. `users.role = 'admin'` o una tabla `admins`) y lo comprueban las políticas
> RLS.

---

## Qué se mantiene del prototipo
- **Toda la lógica de negocio** (motor de puntos, flujo de fases, bloqueo al enviar, fechas
  límite) ya validada. Se reutiliza (con la mejora del *tipo* de acierto en `scoreMatch`).
- **El fixture completo** (grupos, equipos, partidos, estructura de cruces, banderas) — extraer
  de `Codigo.gs` y `porra-app.html` a `src/lib/fixture.ts`.
- **El diseño visual** — paleta, tipografía, estructura de componentes.
- **Los flujos de UX** — pantallas propias (no modales) para alta, login de admin y envío.

## Qué se mejora
- Respuesta instantánea (sin cold start de Apps Script).
- Código mantenible: componentes, tipos, separación de responsabilidades.
- BD real con integridad referencial (PostgreSQL vs Sheets).
- Sin problemas de CORS.
- **Modelo de dos niveles**: varias porras sobre un torneo, con ámbitos distintos, reutilizable
  para futuros torneos.
- Deploy automático desde GitHub (push → despliegue en ~1 min).
- Opción futura de tiempo real (Supabase Realtime) para clasificación en vivo.

---

## Notas importantes para Claude Code

1. **No reinventar el diseño**: el prototipo tiene un diseño validado. Usar su paleta y
   estructura visual.

2. **El fixture es estático**: la estructura del torneo (72 partidos de grupos + cruces) vive en
   `src/lib/fixture.ts`, no en la BD. Solo lo dinámico (resultados, asignaciones, y todo lo de
   las porras) va a Supabase.

3. **Dos niveles, no uno**: `Torneo` (verdad objetiva: equipos, partidos, resultados, cruces) y
   `Porra` (subconjunto de partidos + usuarios + reglas + pronósticos + clasificación). Los
   resultados reales son del torneo; los pronósticos y reglas, de cada porra.

4. **Una porra = un subconjunto de partidos materializado**: al crearla se ejecuta la función
   del "tipo de porra" y se rellena `porra_matches`. v1 solo implementa el tipo `TODOS`, pero la
   costura (una función `resolveMatches` por tipo) debe quedar lista para añadir más sin tocar
   BD/UI/puntuación.

5. **Pronósticos por porra**: la unicidad es `(porra_id, user_id, match_id)`. El mismo usuario en
   dos porras pronostica por separado.

6. **Pantallas, no modales** para alta, login de admin y confirmación: evita problemas con
   extensiones de navegador que interceptan eventos async.

7. **Bloquear en servidor y en cliente**: "fase enviada" y "fecha límite" se validan en las
   funciones server-side, no solo en el cliente.

8. **El botón "Enviar" bloqueado durante la carga inicial**: hasta que el servidor confirme el
   estado real del usuario, inputs y botón de enviar deshabilitados. Evita mostrar "enviar" a
   alguien que ya envió.

9. **Admin separado del usuario**: rutas y layouts separados. El admin entra con Supabase Auth
   (magic-link); el rol admin lo imponen las políticas RLS. Sin PIN compartido. RLS es el
   cimiento: la BD impide leer teléfonos ajenos o escribir resultados aunque el cliente tenga la
   `anon key`.

10. **WhatsApp desde admin**: el botón abre `https://wa.me/34XXXXXXXXX?text=...` con el mensaje
    formateado. El número se normaliza: si tiene 9 dígitos se asume España (+34). El mensaje
    incluye el enlace personal del usuario.

11. **Clasificación solo para pagados**: `paid = false` → no aparece, aunque tenga pronósticos
    enviados.

12. **Corregir el desglose de aciertos**: `scoreMatch` devuelve el *tipo* (`exact`/`sign`/`miss`),
    no se deduce del valor de los puntos (bug latente del `Codigo.gs` si `exact == sign`).
```
