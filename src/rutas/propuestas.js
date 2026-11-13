// Propuestas comerciales y la TRANSACCIÓN DE VENTA (PM03, PM04, RF10, RF11).
const router = require('express').Router();
const pool = require('../db');
const { ErrorNegocio } = require('../errores');

function validarCantidad(valor) {
  const cantidad = Number(valor);
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    throw new ErrorNegocio('La cantidad de buzones debe ser un número entero mayor que cero.');
  }
  return cantidad;
}

// El producto de una propuesta debe ser una versión comercial activa
async function revisarProducto(conn, idProducto) {
  const [[p]] = await conn.query('SELECT tipo_version, activo FROM producto WHERE id_producto = ?', [idProducto]);
  if (!p) throw new ErrorNegocio('El producto no existe.');
  if (p.tipo_version !== 'Comercial') throw new ErrorNegocio('Solo se pueden proponer versiones comerciales.');
  if (!p.activo) throw new ErrorNegocio('Ese producto está desactivado.');
}

router.get('/propuestas', async (req, res) => {
  const valores = [];
  let where = '';
  if (req.query.estado) { where = 'WHERE pp.estado = ?'; valores.push(req.query.estado); }
  const [filas] = await pool.query(`
    SELECT pp.*, pr.nombre AS prospecto, pr.empresa, pr.estado AS estado_prospecto,
      p.nombre AS producto, CONCAT(e.nombres, ' ', e.apellidos) AS vendedor,
      v.id_venta, v.estado AS estado_venta, f.numero AS factura,
      (pp.fecha_validez >= CURDATE()) AS vigente
    FROM propuesta pp
    JOIN prospecto pr ON pr.id_prospecto = pp.id_prospecto
    JOIN producto  p  ON p.id_producto  = pp.id_producto
    JOIN empleado  e  ON e.id_empleado  = pp.id_vendedor
    LEFT JOIN venta   v ON v.id_propuesta = pp.id_propuesta
    LEFT JOIN factura f ON f.id_venta     = v.id_venta
    ${where}
    ORDER BY pp.fecha DESC, pp.id_propuesta DESC`, valores);
  res.json(filas);
});

// Crear propuesta. El precio se COPIA del producto a precio_unitario en el mismo INSERT,
// así un cambio de precio futuro no altera esta propuesta ni su venta.
router.post('/propuestas', async (req, res) => {
  const idProspecto = Number(req.body.id_prospecto);
  const idProducto = Number(req.body.id_producto);
  const cantidad = validarCantidad(req.body.cantidad_buzones);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[prospecto]] = await conn.query(
      'SELECT estado, id_vendedor FROM prospecto WHERE id_prospecto = ? FOR UPDATE', [idProspecto]);
    if (!prospecto) throw new ErrorNegocio('El prospecto no existe.', 404);
    if (prospecto.estado === 'Descartado') throw new ErrorNegocio('El prospecto está descartado; no se le pueden enviar propuestas.');

    // Vendedor: el que se eligió en el formulario o, si no, el asignado al prospecto
    const idVendedor = Number(req.body.id_vendedor) || prospecto.id_vendedor;
    if (!idVendedor) throw new ErrorNegocio('El prospecto no tiene vendedor asignado: elige uno.');
    const [[vendedor]] = await conn.query(
      "SELECT 1 AS ok FROM empleado WHERE id_empleado = ? AND cargo = 'Vendedor' AND estado = 'Activo'", [idVendedor]);
    if (!vendedor) throw new ErrorNegocio('El vendedor elegido no existe o está retirado.');

    await revisarProducto(conn, idProducto);

    const [r] = await conn.query(
      `INSERT INTO propuesta (id_prospecto, id_vendedor, id_producto, fecha, fecha_validez,
                              cantidad_buzones, precio_unitario, total, estado)
       SELECT ?, ?, id_producto, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 15 DAY),
              ?, precio_buzon, precio_buzon * ?, 'Enviada'
       FROM producto WHERE id_producto = ?`,
      [idProspecto, idVendedor, cantidad, cantidad, idProducto]);

    // Enviar una propuesta significa que ya hay contacto con el prospecto
    if (['Nuevo', 'Calificado'].includes(prospecto.estado)) {
      await conn.query(
        "UPDATE prospecto SET estado = 'En contacto', id_vendedor = COALESCE(id_vendedor, ?) WHERE id_prospecto = ?",
        [idVendedor, idProspecto]);
    }

    await conn.commit();
    res.status(201).json({ id_propuesta: r.insertId, mensaje: 'Propuesta enviada (válida por 15 días).' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// Editar producto o cantidad (solo mientras está "Enviada"). Se vuelve a copiar el precio vigente.
router.put('/propuestas/:id', async (req, res) => {
  const idProducto = Number(req.body.id_producto);
  const cantidad = validarCantidad(req.body.cantidad_buzones);
  await revisarProducto(pool, idProducto);
  const [r] = await pool.query(
    `UPDATE propuesta pp JOIN producto p ON p.id_producto = ?
     SET pp.id_producto = p.id_producto, pp.cantidad_buzones = ?,
         pp.precio_unitario = p.precio_buzon, pp.total = p.precio_buzon * ?
     WHERE pp.id_propuesta = ? AND pp.estado = 'Enviada'`,
    [idProducto, cantidad, cantidad, req.params.id]);
  if (r.affectedRows === 0) throw new ErrorNegocio('Solo se puede editar una propuesta en estado "Enviada".', 409);
  res.json({ mensaje: 'Propuesta actualizada.' });
});

router.post('/propuestas/:id/rechazar', async (req, res) => {
  const [r] = await pool.query(
    "UPDATE propuesta SET estado = 'Rechazada' WHERE id_propuesta = ? AND estado = 'Enviada'", [req.params.id]);
  if (r.affectedRows === 0) throw new ErrorNegocio('Solo se puede rechazar una propuesta en estado "Enviada".', 409);
  res.json({ mensaje: 'Propuesta marcada como rechazada.' });
});

// ===========================================================================
// TRANSACCIÓN DE VENTA  (POST /api/propuestas/:id/venta)
//
// Convierte una propuesta "Enviada" en venta. Son 5 cambios en 5 tablas que
// deben pasar TODOS o NINGUNO (atomicidad):
//   venta (INSERT) + factura (INSERT) + propuesta, prospecto y prueba (UPDATE)
//
// ?simularError=true lanza un error justo después de insertar la venta, para
// demostrar que el ROLLBACK deja la base exactamente como estaba.
// ===========================================================================
router.post('/propuestas/:id/venta', async (req, res) => {
  const idPropuesta = Number(req.params.id);
  const simularError = req.query.simularError === 'true';

  // PASO 1. Pedir una conexión al pool y empezar la transacción.
  //   Todas las consultas de la transacción deben ir por ESTA misma conexión
  //   (por eso se usa "conn" y no "pool").
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // PASO 2. Leer la propuesta y BLOQUEARLA con FOR UPDATE.
    //   Si otro vendedor intenta vender la misma propuesta al mismo tiempo,
    //   su consulta se queda esperando aquí hasta que esta transacción termine.
    //   Cuando por fin lee, ya ve el estado "Aceptada" y recibe el error (aislamiento).
    const [[propuesta]] = await conn.query(
      `SELECT id_propuesta, id_prospecto, total, estado,
              (fecha_validez < CURDATE()) AS vencida, fecha_validez
       FROM propuesta WHERE id_propuesta = ? FOR UPDATE`,
      [idPropuesta]);

    if (!propuesta) throw new ErrorNegocio('La propuesta no existe.', 404);
    if (propuesta.estado === 'Aceptada') throw new ErrorNegocio('Esta propuesta ya fue convertida en venta.', 409);
    if (propuesta.estado !== 'Enviada') {
      throw new ErrorNegocio(`La propuesta está "${propuesta.estado}". Solo se puede vender una propuesta "Enviada".`, 409);
    }
    if (propuesta.vencida) {
      throw new ErrorNegocio(`La propuesta venció el ${propuesta.fecha_validez}. Hay que enviar una nueva.`, 409);
    }

    // PASO 3a. Insertar la venta con el total de la propuesta.
    const [rVenta] = await conn.query(
      "INSERT INTO venta (id_propuesta, fecha_venta, total, estado) VALUES (?, NOW(), ?, 'Activa')",
      [idPropuesta, propuesta.total]);
    const idVenta = rVenta.insertId;

    // Error a propósito para la demostración: la venta YA se insertó, pero
    // como lanzamos un error antes del COMMIT, el ROLLBACK la va a deshacer.
    if (simularError) {
      throw new ErrorNegocio(
        `Error simulado después de insertar la venta #${idVenta}. Se hizo ROLLBACK: ` +
        'la venta no quedó guardada y la propuesta, el prospecto y la prueba siguen igual.', 500);
    }

    // PASO 3b. Insertar la factura: saldo = total, estado Pendiente, vence en 30 días.
    //   El número sale del id de la venta (FAC-000035), que ya es único.
    const numero = `FAC-${String(idVenta).padStart(6, '0')}`;
    const [rFactura] = await conn.query(
      `INSERT INTO factura (id_venta, numero, fecha_emision, fecha_vencimiento, valor_total, saldo, estado)
       VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), ?, ?, 'Pendiente')`,
      [idVenta, numero, propuesta.total, propuesta.total]);

    // PASO 4. Actualizar los estados de la cadena.
    await conn.query("UPDATE propuesta SET estado = 'Aceptada' WHERE id_propuesta = ?", [idPropuesta]);
    await conn.query("UPDATE prospecto SET estado = 'Cliente' WHERE id_prospecto = ?", [propuesta.id_prospecto]);
    await conn.query(
      "UPDATE prueba SET estado = 'Convertida' WHERE id_prospecto = ? AND estado = 'Activa'",
      [propuesta.id_prospecto]);

    // PASO 5. Todo salió bien: COMMIT guarda los cambios de forma permanente (durabilidad).
    await conn.commit();

    res.status(201).json({
      id_venta: idVenta,
      id_factura: rFactura.insertId,
      numero,
      total: propuesta.total,
      mensaje: `Venta #${idVenta} registrada con la factura ${numero}. COMMIT realizado.`,
    });
  } catch (err) {
    // PASO 5 (si algo falló). ROLLBACK deshace TODO lo que se hizo desde beginTransaction().
    await conn.rollback();
    throw err; // el manejador de errores responde el mensaje en español
  } finally {
    // PASO 6. Devolver la conexión al pool SIEMPRE, haya salido bien o mal.
    conn.release();
  }
});

module.exports = router;
