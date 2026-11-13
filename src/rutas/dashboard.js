// Dashboard: indicadores, datos para las gráficas y últimas ventas.
const router = require('express').Router();
const pool = require('../db');

router.get('/dashboard', async (req, res) => {
  // Las 4 tarjetas en una sola consulta
  const [[kpi]] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM prospecto WHERE estado IN ('Nuevo','Calificado','En contacto')) AS prospectos_activos,
      (SELECT COUNT(*) FROM prospecto WHERE estado = 'Cliente') AS clientes,
      (SELECT COUNT(*) FROM venta WHERE estado = 'Activa'
          AND fecha_venta >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS ventas_mes_cantidad,
      (SELECT IFNULL(SUM(total), 0) FROM venta WHERE estado = 'Activa'
          AND fecha_venta >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS ventas_mes_total,
      (SELECT IFNULL(SUM(valor_total), 0) FROM factura WHERE estado <> 'Anulada') AS total_facturado,
      (SELECT IFNULL(SUM(saldo), 0) FROM factura WHERE estado IN ('Pendiente','Vencida')) AS cartera_pendiente`);

  // Embudo: prospectos por estado (en el orden del ciclo de venta)
  const [porEstado] = await pool.query(`
    SELECT estado, COUNT(*) AS cantidad FROM prospecto
    GROUP BY estado ORDER BY FIELD(estado, 'Nuevo','Calificado','En contacto','Cliente','Descartado')`);

  // Ventas activas de los últimos 6 meses
  const [porMes] = await pool.query(`
    SELECT DATE_FORMAT(fecha_venta, '%Y-%m') AS mes, COUNT(*) AS cantidad, SUM(total) AS total
    FROM venta
    WHERE estado = 'Activa' AND fecha_venta >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
    GROUP BY mes ORDER BY mes`);

  const [ultimasVentas] = await pool.query(`
    SELECT v.id_venta, v.fecha_venta, v.total, v.estado, pr.nombre AS prospecto, pr.empresa,
           p.nombre AS producto, pp.cantidad_buzones,
           CONCAT(e.nombres, ' ', e.apellidos) AS vendedor
    FROM venta v
    JOIN propuesta pp ON pp.id_propuesta = v.id_propuesta
    JOIN prospecto pr ON pr.id_prospecto = pp.id_prospecto
    JOIN producto  p  ON p.id_producto  = pp.id_producto
    JOIN empleado  e  ON e.id_empleado  = pp.id_vendedor
    ORDER BY v.fecha_venta DESC LIMIT 8`);

  res.json({ kpi, porEstado, porMes, ultimasVentas });
});

module.exports = router;
