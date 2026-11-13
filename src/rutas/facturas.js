// Facturas y pagos (PM04, RF12).
const router = require('express').Router();
const pool = require('../db');
const { ErrorNegocio } = require('../errores');

const MEDIOS = ['Transferencia', 'Tarjeta', 'Consignación'];
// El dinero se compara en centavos (enteros) para evitar errores de decimales: 0.1 + 0.2 ≠ 0.3
const centavos = (n) => Math.round(Number(n) * 100);

router.get('/facturas', async (req, res) => {
  const valores = [];
  let where = '';
  if (req.query.estado) { where = 'WHERE f.estado = ?'; valores.push(req.query.estado); }
  const [filas] = await pool.query(`
    SELECT f.*, v.fecha_venta, pr.nombre AS prospecto, pr.empresa, p.nombre AS producto,
      pp.cantidad_buzones,
      (SELECT COUNT(*) FROM pago g WHERE g.id_factura = f.id_factura) AS num_pagos
    FROM factura f
    JOIN venta     v  ON v.id_venta      = f.id_venta
    JOIN propuesta pp ON pp.id_propuesta = v.id_propuesta
    JOIN prospecto pr ON pr.id_prospecto = pp.id_prospecto
    JOIN producto  p  ON p.id_producto   = pp.id_producto
    ${where}
    ORDER BY f.fecha_emision DESC, f.id_factura DESC`, valores);
  res.json(filas);
});

router.get('/facturas/:id/pagos', async (req, res) => {
  const [filas] = await pool.query(
    'SELECT * FROM pago WHERE id_factura = ? ORDER BY fecha_pago', [req.params.id]);
  res.json(filas);
});

// ---------------------------------------------------------------------------
// TRANSACCIÓN DE PAGO: insertar el pago y descontar el saldo van juntos.
// Si el saldo llega a cero, la factura pasa a "Pagada".
// ---------------------------------------------------------------------------
router.post('/facturas/:id/pagos', async (req, res) => {
  const idFactura = Number(req.params.id);
  const valor = Number(req.body.valor);
  const medio = req.body.medio_pago;
  if (!(valor > 0)) throw new ErrorNegocio('El valor del pago debe ser mayor que cero.');
  if (!MEDIOS.includes(medio)) throw new ErrorNegocio('Elige un medio de pago de la lista.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Bloquear la factura: dos pagos al mismo tiempo no pueden leer el mismo saldo
    const [[factura]] = await conn.query(
      'SELECT numero, saldo, estado FROM factura WHERE id_factura = ? FOR UPDATE', [idFactura]);
    if (!factura) throw new ErrorNegocio('La factura no existe.', 404);
    if (factura.estado === 'Anulada') throw new ErrorNegocio('La factura está anulada; no recibe pagos.', 409);
    if (factura.estado === 'Pagada') throw new ErrorNegocio('La factura ya está pagada.', 409);
    if (centavos(valor) > centavos(factura.saldo)) {
      throw new ErrorNegocio(`El pago (USD ${valor.toFixed(2)}) supera el saldo de la factura (USD ${Number(factura.saldo).toFixed(2)}).`);
    }

    await conn.query(
      'INSERT INTO pago (id_factura, fecha_pago, valor, medio_pago) VALUES (?, NOW(), ?, ?)',
      [idFactura, valor, medio]);

    const nuevoSaldo = (centavos(factura.saldo) - centavos(valor)) / 100;
    const nuevoEstado = nuevoSaldo === 0 ? 'Pagada' : factura.estado; // una vencida sigue vencida hasta pagarse
    await conn.query('UPDATE factura SET saldo = ?, estado = ? WHERE id_factura = ?', [nuevoSaldo, nuevoEstado, idFactura]);

    await conn.commit();
    res.status(201).json({
      saldo: nuevoSaldo,
      estado: nuevoEstado,
      mensaje: nuevoEstado === 'Pagada'
        ? `Pago registrado. La factura ${factura.numero} quedó pagada.`
        : `Pago registrado. Saldo pendiente: USD ${nuevoSaldo.toFixed(2)}.`,
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

module.exports = router;
