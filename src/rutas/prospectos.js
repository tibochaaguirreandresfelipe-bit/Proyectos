// Prospectos: listado con filtros, ficha con historial y registro con su prueba de 60 días (PM01, PM02).
const router = require('express').Router();
const pool = require('../db');
const { ErrorNegocio } = require('../errores');

const CANALES = ['Búsqueda orgánica', 'Publicidad', 'Redes sociales', 'Referido', 'Correo'];
const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarProspecto(body) {
  const d = {
    nombre: String(body.nombre || '').trim(),
    empresa: String(body.empresa || '').trim() || null,
    correo: String(body.correo || '').trim().toLowerCase(),
    telefono: String(body.telefono || '').trim() || null,
    pais: String(body.pais || '').trim(),
    canal: body.canal,
  };
  if (!d.nombre) throw new ErrorNegocio('El nombre es obligatorio.');
  if (!FORMATO_CORREO.test(d.correo)) throw new ErrorNegocio('Escribe un correo válido, por ejemplo nombre@empresa.com.');
  if (!d.pais) throw new ErrorNegocio('El país es obligatorio.');
  if (!CANALES.includes(d.canal)) throw new ErrorNegocio('Elige un canal de llegada de la lista.');
  return d;
}

// Vendedores activos con su carga actual (para los filtros y para asignar)
router.get('/vendedores', async (req, res) => {
  const [filas] = await pool.query(`
    SELECT e.id_empleado, CONCAT(e.nombres, ' ', e.apellidos) AS nombre,
      (SELECT COUNT(*) FROM prospecto p WHERE p.id_vendedor = e.id_empleado
         AND p.estado IN ('Calificado','En contacto')) AS prospectos_abiertos
    FROM empleado e
    WHERE e.cargo = 'Vendedor' AND e.estado = 'Activo'
    ORDER BY nombre`);
  res.json(filas);
});

router.get('/prospectos/paises', async (req, res) => {
  const [filas] = await pool.query('SELECT DISTINCT pais FROM prospecto ORDER BY pais');
  res.json(filas.map((f) => f.pais));
});

// Listado. Filtros opcionales: ?estado=...&vendedor=...&pais=...
// Se arma el WHERE con "?" (consulta parametrizada), nunca pegando el texto del usuario.
router.get('/prospectos', async (req, res) => {
  const condiciones = [];
  const valores = [];
  if (req.query.estado) { condiciones.push('p.estado = ?'); valores.push(req.query.estado); }
  if (req.query.vendedor === 'sin') condiciones.push('p.id_vendedor IS NULL');
  else if (req.query.vendedor) { condiciones.push('p.id_vendedor = ?'); valores.push(req.query.vendedor); }
  if (req.query.pais) { condiciones.push('p.pais = ?'); valores.push(req.query.pais); }
  const where = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';

  const [filas] = await pool.query(`
    SELECT p.*, CONCAT(e.nombres, ' ', e.apellidos) AS vendedor,
      (SELECT DATEDIFF(MAX(t.fecha_vencimiento), CURDATE()) FROM prueba t
        WHERE t.id_prospecto = p.id_prospecto AND t.estado = 'Activa') AS dias_prueba
    FROM prospecto p
    LEFT JOIN empleado e ON e.id_empleado = p.id_vendedor
    ${where}
    ORDER BY p.fecha_registro DESC`, valores);
  res.json(filas);
});

// Ficha del prospecto con todo su historial
router.get('/prospectos/:id', async (req, res) => {
  const id = req.params.id;
  const [[prospecto]] = await pool.query(`
    SELECT p.*, CONCAT(e.nombres, ' ', e.apellidos) AS vendedor
    FROM prospecto p LEFT JOIN empleado e ON e.id_empleado = p.id_vendedor
    WHERE p.id_prospecto = ?`, [id]);
  if (!prospecto) throw new ErrorNegocio('El prospecto no existe.', 404);

  const [pruebas] = await pool.query(`
    SELECT t.*, pr.nombre AS producto FROM prueba t JOIN producto pr ON pr.id_producto = t.id_producto
    WHERE t.id_prospecto = ? ORDER BY t.fecha_inicio DESC`, [id]);
  const [actividades] = await pool.query(
    'SELECT * FROM actividad_web WHERE id_prospecto = ? ORDER BY fecha_hora DESC', [id]);
  const [contactos] = await pool.query(`
    SELECT c.*, CONCAT(e.nombres, ' ', e.apellidos) AS vendedor
    FROM contacto c JOIN empleado e ON e.id_empleado = c.id_vendedor
    WHERE c.id_prospecto = ? ORDER BY c.fecha_hora DESC`, [id]);
  const [propuestas] = await pool.query(`
    SELECT pp.*, pr.nombre AS producto, v.id_venta, v.estado AS estado_venta, f.numero AS factura
    FROM propuesta pp
    JOIN producto pr ON pr.id_producto = pp.id_producto
    LEFT JOIN venta v ON v.id_propuesta = pp.id_propuesta
    LEFT JOIN factura f ON f.id_venta = v.id_venta
    WHERE pp.id_prospecto = ? ORDER BY pp.fecha DESC`, [id]);

  res.json({ prospecto, pruebas, actividades, contactos, propuestas });
});

// ---------------------------------------------------------------------------
// TRANSACCIÓN DE REGISTRO (RF05): prospecto + prueba de 60 días, con SAVEPOINT.
// Si la prueba falla, se deshace SOLO la prueba (ROLLBACK TO SAVEPOINT) y el
// prospecto queda guardado. Con ?simularError=true la prueba falla a propósito.
// ---------------------------------------------------------------------------
router.post('/prospectos', async (req, res) => {
  const d = validarProspecto(req.body);
  const idProducto = Number(req.body.id_producto);
  const simularError = req.query.simularError === 'true';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. ¿Ya existe ese correo? Si existe se actualizan sus datos (HU01) en vez de duplicarlo.
    //    FOR UPDATE bloquea la fila hasta el COMMIT.
    const [[existente]] = await conn.query(
      'SELECT id_prospecto FROM prospecto WHERE correo = ? FOR UPDATE', [d.correo]);
    let idProspecto;
    if (existente) {
      idProspecto = existente.id_prospecto;
      await conn.query(
        'UPDATE prospecto SET nombre = ?, empresa = ?, telefono = ?, pais = ? WHERE id_prospecto = ?',
        [d.nombre, d.empresa, d.telefono, d.pais, idProspecto]);
    } else {
      const [r] = await conn.query(
        `INSERT INTO prospecto (nombre, empresa, correo, telefono, pais, canal, puntaje, estado, fecha_registro)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'Nuevo', NOW())`,
        [d.nombre, d.empresa, d.correo, d.telefono, d.pais, d.canal]);
      idProspecto = r.insertId;
    }

    // 2. Punto de guardado: hasta aquí el prospecto ya está listo.
    await conn.query('SAVEPOINT antes_de_prueba');

    // 3. Crear la prueba. Si algo falla, se vuelve al SAVEPOINT.
    let prueba = null;
    let avisoPrueba = null;
    try {
      if (simularError) throw new ErrorNegocio('Error simulado al crear la prueba.');

      const [[producto]] = await conn.query(
        'SELECT nombre, tipo_version, activo FROM producto WHERE id_producto = ?', [idProducto]);
      if (!producto || producto.tipo_version !== 'Prueba' || !producto.activo) {
        throw new ErrorNegocio('El producto elegido no es una versión de prueba activa.');
      }
      // Regla RF05: no puede haber dos pruebas activas del mismo producto
      const [[activa]] = await conn.query(
        "SELECT id_prueba FROM prueba WHERE id_prospecto = ? AND id_producto = ? AND estado = 'Activa' FOR UPDATE",
        [idProspecto, idProducto]);
      if (activa) throw new ErrorNegocio('El prospecto ya tiene una prueba activa de ese producto.');

      const [r] = await conn.query(
        `INSERT INTO prueba (id_prospecto, id_producto, fecha_inicio, fecha_vencimiento, estado)
         VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 60 DAY), 'Activa')`,
        [idProspecto, idProducto]);
      prueba = { id_prueba: r.insertId, producto: producto.nombre };
    } catch (errPrueba) {
      await conn.query('ROLLBACK TO SAVEPOINT antes_de_prueba');
      avisoPrueba = errPrueba instanceof ErrorNegocio ? errPrueba.message : 'No se pudo crear la prueba.';
    }

    // 4. Confirmar: el prospecto queda guardado, con o sin prueba.
    await conn.commit();

    res.status(existente ? 200 : 201).json({
      id_prospecto: idProspecto,
      actualizado: Boolean(existente),
      prueba,
      avisoPrueba,
      mensaje: (existente ? 'El correo ya estaba registrado: se actualizaron sus datos.' : 'Prospecto registrado.')
        + (prueba ? ' Prueba de 60 días activada.' : ` La prueba NO se creó (ROLLBACK TO SAVEPOINT): ${avisoPrueba}`),
    });
  } catch (err) {
    await conn.rollback(); // falló algo antes del SAVEPOINT: no se guarda nada
    throw err;
  } finally {
    conn.release();
  }
});

// Editar datos y vendedor asignado
router.put('/prospectos/:id', async (req, res) => {
  const d = validarProspecto(req.body);
  const idVendedor = req.body.id_vendedor ? Number(req.body.id_vendedor) : null;
  if (idVendedor) {
    const [[v]] = await pool.query(
      "SELECT 1 AS ok FROM empleado WHERE id_empleado = ? AND cargo = 'Vendedor' AND estado = 'Activo'", [idVendedor]);
    if (!v) throw new ErrorNegocio('El vendedor elegido no existe o está retirado.');
  }
  const [r] = await pool.query(
    `UPDATE prospecto SET nombre = ?, empresa = ?, correo = ?, telefono = ?, pais = ?, canal = ?, id_vendedor = ?
     WHERE id_prospecto = ?`,
    [d.nombre, d.empresa, d.correo, d.telefono, d.pais, d.canal, idVendedor, req.params.id]);
  if (r.affectedRows === 0) throw new ErrorNegocio('El prospecto no existe.', 404);
  res.json({ mensaje: 'Prospecto actualizado.' });
});

// Los prospectos no se borran: se descartan (cambio de estado)
router.post('/prospectos/:id/descartar', async (req, res) => {
  const [r] = await pool.query(
    "UPDATE prospecto SET estado = 'Descartado' WHERE id_prospecto = ? AND estado NOT IN ('Cliente','Descartado')",
    [req.params.id]);
  if (r.affectedRows === 0) throw new ErrorNegocio('Solo se puede descartar un prospecto que no sea cliente ni esté ya descartado.', 409);
  res.json({ mensaje: 'Prospecto descartado.' });
});

module.exports = router;
