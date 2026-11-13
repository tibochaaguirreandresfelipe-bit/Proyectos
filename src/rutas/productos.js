// Productos: CRUD del catálogo de versiones de Zimbra (PA02, RF04).
const router = require('express').Router();
const pool = require('../db');
const { ErrorNegocio } = require('../errores');

// Revisa los datos del formulario antes de ir a la base
function validar(body) {
  const nombre = String(body.nombre || '').trim();
  const precio = Number(body.precio_buzon);
  if (!nombre) throw new ErrorNegocio('El nombre del producto es obligatorio.');
  if (!['Prueba', 'Comercial'].includes(body.tipo_version)) throw new ErrorNegocio('El tipo de versión debe ser Prueba o Comercial.');
  if (body.precio_buzon === '' || Number.isNaN(precio)) throw new ErrorNegocio('El precio por buzón debe ser un número.');
  if (precio < 0) throw new ErrorNegocio('El precio por buzón no puede ser negativo.');
  return {
    nombre,
    descripcion: String(body.descripcion || '').trim() || null,
    tipo_version: body.tipo_version,
    precio_buzon: precio,
    activo: body.activo === false || body.activo === 0 ? 0 : 1,
  };
}

// Lista con cuántas ventas tiene cada producto (para saber si se puede eliminar)
router.get('/productos', async (req, res) => {
  const [filas] = await pool.query(`
    SELECT p.*,
      (SELECT COUNT(*) FROM propuesta pp JOIN venta v ON v.id_propuesta = pp.id_propuesta
        WHERE pp.id_producto = p.id_producto) AS ventas,
      (SELECT COUNT(*) FROM propuesta pp WHERE pp.id_producto = p.id_producto)
      + (SELECT COUNT(*) FROM prueba pr WHERE pr.id_producto = p.id_producto) AS usos
    FROM producto p
    ORDER BY p.activo DESC, p.tipo_version DESC, p.precio_buzon`);
  res.json(filas);
});

router.post('/productos', async (req, res) => {
  const d = validar(req.body);
  const [r] = await pool.query(
    'INSERT INTO producto (nombre, descripcion, tipo_version, precio_buzon, activo) VALUES (?, ?, ?, ?, ?)',
    [d.nombre, d.descripcion, d.tipo_version, d.precio_buzon, d.activo]);
  res.status(201).json({ id_producto: r.insertId, mensaje: 'Producto creado.' });
});

// Cambiar el precio aquí NO cambia las propuestas ni ventas pasadas:
// cada propuesta guardó su propia copia en precio_unitario.
router.put('/productos/:id', async (req, res) => {
  const d = validar(req.body);
  const [r] = await pool.query(
    'UPDATE producto SET nombre = ?, descripcion = ?, tipo_version = ?, precio_buzon = ?, activo = ? WHERE id_producto = ?',
    [d.nombre, d.descripcion, d.tipo_version, d.precio_buzon, d.activo, req.params.id]);
  if (r.affectedRows === 0) throw new ErrorNegocio('El producto no existe.', 404);
  res.json({ mensaje: 'Producto actualizado.' });
});

// Activar o desactivar sin abrir el formulario
router.patch('/productos/:id/activo', async (req, res) => {
  const activo = req.body.activo ? 1 : 0;
  const [r] = await pool.query('UPDATE producto SET activo = ? WHERE id_producto = ?', [activo, req.params.id]);
  if (r.affectedRows === 0) throw new ErrorNegocio('El producto no existe.', 404);
  res.json({ mensaje: activo ? 'Producto activado.' : 'Producto desactivado.' });
});

// "Eliminar": si el producto ya se usó en pruebas, propuestas o ventas no se borra,
// se desactiva (así no se pierde la historia). Solo se borra si nunca se usó.
router.delete('/productos/:id', async (req, res) => {
  const id = req.params.id;
  const [[uso]] = await pool.query(`
    SELECT (SELECT COUNT(*) FROM propuesta WHERE id_producto = ?)
         + (SELECT COUNT(*) FROM prueba WHERE id_producto = ?) AS usos`, [id, id]);
  if (uso.usos > 0) {
    const [r] = await pool.query('UPDATE producto SET activo = 0 WHERE id_producto = ?', [id]);
    if (r.affectedRows === 0) throw new ErrorNegocio('El producto no existe.', 404);
    return res.json({ desactivado: true, mensaje: 'El producto tiene historial (pruebas, propuestas o ventas), así que se desactivó en lugar de eliminarse.' });
  }
  const [r] = await pool.query('DELETE FROM producto WHERE id_producto = ?', [id]);
  if (r.affectedRows === 0) throw new ErrorNegocio('El producto no existe.', 404);
  res.json({ eliminado: true, mensaje: 'Producto eliminado.' });
});

module.exports = router;
