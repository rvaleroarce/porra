/* =========================================================================
   Copia de seguridad de la base de datos — sin Docker

   `supabase db dump` levanta pg_dump dentro de un contenedor, así que exige
   Docker Desktop. Esto hace lo mismo hablando con Postgres directamente:
   lee todas las tablas de `public` y escribe dos ficheros en backups/

     · <fecha>-datos.sql   INSERTs en orden de dependencias, restaurable
                           sobre un esquema ya creado (schema.sql)
     · <fecha>-datos.json  lo mismo en JSON, para consultar de un vistazo

   La estructura no se vuelca: ya está en git.

   Uso:
     npm run backup
     npm run backup -- "postgresql://postgres:...@db.xxx.supabase.co:5432/postgres"

   Sin argumento, pide la cadena de conexión por teclado sin mostrarla.
   ========================================================================= */

import pg from 'pg';
import readline from 'node:readline';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ    = dirname(dirname(fileURLToPath(import.meta.url)));
const DESTINO = join(RAIZ, 'backups');

/** Pregunta ocultando lo que se teclea (la cadena lleva la contraseña). */
function preguntarOculto(texto) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin, output: process.stdout, terminal: true,
    });
    rl.question(texto, (respuesta) => {
      rl.close();
      process.stdout.write('\n');
      resolve(respuesta.trim());
    });
    // El prompt ya se ha escrito; a partir de aquí se traga las pulsaciones.
    rl._writeToOutput = () => {};
  });
}

/** Un valor de Postgres como literal SQL. */
function literal(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number')  return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date)      return `'${v.toISOString()}'`;
  if (Buffer.isBuffer(v))     return `'\\x${v.toString('hex')}'`;
  if (typeof v === 'object')  return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

const id = (nombre) => `"${nombre.replace(/"/g, '""')}"`;

/**
 * Ordena las tablas para que ninguna se inserte antes que aquellas de las que
 * depende por clave foránea. Sin esto, restaurar el volcado falla.
 */
function ordenarPorDependencias(tablas, aristas) {
  const pendientes = new Set(tablas);
  const orden = [];
  while (pendientes.size) {
    const libres = [...pendientes].filter((t) =>
      !aristas.some(({ hija, padre }) =>
        hija === t && padre !== t && pendientes.has(padre)),
    );
    // Si hay un ciclo de FK, se corta por lo sano y se avisa al final.
    const lote = libres.length ? libres : [...pendientes];
    lote.sort();
    for (const t of lote) { orden.push(t); pendientes.delete(t); }
    if (!libres.length) break;
  }
  return [...orden, ...pendientes];
}

async function conectar(cadena) {
  const intento = async (ssl) => {
    const cliente = new pg.Client({
      connectionString: cadena,
      ssl,
      // Sin esto, una cadena mal escrita deja el script colgado sin decir nada.
      connectionTimeoutMillis: 15000,
    });
    await cliente.connect();
    return cliente;
  };

  // Postgres local sin TLS: hay que saberlo antes, porque negociar TLS contra
  // un servidor que no lo habla se queda esperando en vez de fallar.
  if (/[?&]sslmode=disable\b/i.test(cadena)) return intento(false);

  try {
    return await intento({ rejectUnauthorized: true });
  } catch (e) {
    if (/does not support SSL/i.test(e.message)) {
      return intento(false);            // Postgres local sin TLS
    }
    if (/certificate|self.signed|SELF_SIGNED|unable to verify/i.test(e.message)) {
      console.log('Aviso: no se ha podido verificar el certificado del servidor; se sigue con TLS sin validar.');
      return intento({ rejectUnauthorized: false });
    }
    throw e;
  }
}

const main = async () => {
  const cadena = process.argv[2]
    || process.env.SUPABASE_DB_URL
    || await preguntarOculto('Cadena de conexión (Supabase → Connect → Session pooler): ');

  if (!cadena) throw new Error('Hace falta la cadena de conexión.');

  const db = await conectar(cadena);
  console.log('Conectado.\n');

  const { rows: tablasRows } = await db.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `);
  const { rows: fks } = await db.query(`
    select tc.table_name as hija, ccu.table_name as padre
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
     and ccu.table_schema    = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
  `);

  const tablas = ordenarPorDependencias(tablasRows.map((r) => r.table_name), fks);

  const partes = [
    '-- Volcado de datos (sin estructura: está en supabase/schema.sql)',
    `-- Generado: ${new Date().toISOString()}`,
    '-- Tablas en orden de dependencias; restaurar sobre un esquema ya creado.',
    '',
    'begin;',
    '',
  ];
  const comoJson = {};
  let total = 0;

  for (const tabla of tablas) {
    const { rows, fields } = await db.query(`select * from ${id(tabla)}`);
    comoJson[tabla] = rows;
    total += rows.length;
    console.log(`${String(rows.length).padStart(6)}  ${tabla}`);

    partes.push(`-- ${tabla} (${rows.length})`);
    if (!rows.length) { partes.push(''); continue; }

    const columnas = fields.map((f) => f.name);
    const cabecera = `insert into ${id(tabla)} (${columnas.map(id).join(', ')}) values`;
    for (const fila of rows) {
      partes.push(`${cabecera} (${columnas.map((c) => literal(fila[c])).join(', ')});`);
    }
    partes.push('');
  }

  partes.push('commit;', '');
  await db.end();

  mkdirSync(DESTINO, { recursive: true });
  const sello = new Date().toISOString().slice(0, 10);
  const fSql  = join(DESTINO, `${sello}-datos.sql`);
  const fJson = join(DESTINO, `${sello}-datos.json`);
  writeFileSync(fSql, partes.join('\n'), 'utf8');
  writeFileSync(fJson, JSON.stringify(comoJson, null, 2), 'utf8');

  console.log(`\n${total} filas en ${tablas.length} tablas`);
  console.log(`  ${fSql}`);
  console.log(`  ${fJson}`);
  console.log('\nLlevan teléfonos, emails y tokens de participantes reales.');
  console.log("La carpeta 'backups' está en .gitignore: no los subas al repositorio.");
};

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
