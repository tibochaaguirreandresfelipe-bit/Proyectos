// Dashboard: 4 indicadores, 2 gráficas (Chart.js) y últimas ventas.
let graficas = []; // se destruyen al volver a dibujar para no duplicarlas

const kpi = (titulo, valor, detalle) => `<div class="border border-slate-300 bg-white px-3 py-2.5">
  <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">${titulo}</p>
  <p class="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">${valor}</p>
  <p class="text-xs text-slate-500">${detalle}</p></div>`;

vistas.dashboard = async (cont) => {
  const d = await api('/api/dashboard');
  graficas.forEach((g) => g.destroy());
  graficas = [];

  const filas = d.ultimasVentas.map((v) => `<tr>
    ${celda(v.id_venta, 'text-right tabular-nums')}
    ${celda(fecha(v.fecha_venta), 'whitespace-nowrap tabular-nums')}
    ${celda(`${esc(v.prospecto)} <span class="text-slate-500">· ${esc(v.empresa || 'Persona natural')}</span>`)}
    ${celda(esc(v.producto))}
    ${celda(numero(v.cantidad_buzones), 'text-right tabular-nums')}
    ${celda(esc(v.vendedor), 'whitespace-nowrap')}
    ${celda(usd(v.total), 'whitespace-nowrap text-right tabular-nums')}
    ${celda(etiqueta(v.estado))}</tr>`);

  cont.innerHTML = `
    ${encabezado('Dashboard', 'Resumen del ciclo de venta: de prospecto a cliente con su factura cobrada.')}
    <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      ${kpi('Prospectos activos', numero(d.kpi.prospectos_activos), 'Nuevos, calificados y en contacto')}
      ${kpi('Clientes', numero(d.kpi.clientes), 'Prospectos que ya compraron')}
      ${kpi('Ventas del mes', usd(d.kpi.ventas_mes_total), `${numero(d.kpi.ventas_mes_cantidad)} ventas activas`)}
      ${kpi('Total facturado', usd(d.kpi.total_facturado), `Cartera pendiente: ${usd(d.kpi.cartera_pendiente)}`)}
    </div>
    <div class="mt-3 grid gap-3 lg:grid-cols-5">
      ${panel('Ventas por mes (USD)', '<div class="h-60 p-3"><canvas id="gVentas" aria-label="Gráfica de ventas por mes"></canvas></div>', '<span class="text-[11px] text-slate-500">Últimos 6 meses, sin anuladas</span>', 'lg:col-span-3')}
      ${panel('Prospectos por estado', '<div class="h-60 p-3"><canvas id="gEstados" aria-label="Gráfica de prospectos por estado"></canvas></div>', '', 'lg:col-span-2')}
    </div>
    <div class="mt-3">${panel('Últimas ventas', tabla(
      [{ titulo: 'Venta', clase: 'text-right' }, { titulo: 'Fecha' }, { titulo: 'Cliente' }, { titulo: 'Producto' }, { titulo: 'Buzones', clase: 'text-right' }, { titulo: 'Vendedor' }, { titulo: 'Total', clase: 'text-right' }, { titulo: 'Estado' }],
      filas,
      estadoVacio('Todavía no hay ventas', 'Cuando conviertas una propuesta en venta aparecerá aquí.')),
      '<a href="#propuestas" class="text-xs text-marca hover:underline">Ir a propuestas</a>')}</div>`;

  // Estilo común: una sola serie por gráfica, barras rectas, rejilla gris suave
  Chart.defaults.font.family = '"Segoe UI", Tahoma, Arial, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = '#475569';
  const rejilla = { color: '#E2E8F0' };

  graficas.push(new Chart($('#gVentas'), {
    type: 'bar',
    data: {
      labels: d.porMes.map((m) => `${MESES[Number(m.mes.slice(5)) - 1]} ${m.mes.slice(0, 4)}`),
      datasets: [{ label: 'Ventas (USD)', data: d.porMes.map((m) => m.total), backgroundColor: '#1D4F91', maxBarThickness: 44 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => ` ${usd(c.raw)} · ${d.porMes[c.dataIndex].cantidad} ventas` } },
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: rejilla, beginAtZero: true, ticks: { callback: (v) => `${numero(v / 1000)} mil` } },
      },
    },
  }));

  graficas.push(new Chart($('#gEstados'), {
    type: 'bar',
    data: {
      labels: d.porEstado.map((e) => e.estado),
      datasets: [{ label: 'Prospectos', data: d.porEstado.map((e) => e.cantidad), backgroundColor: '#64748B', maxBarThickness: 26 }],
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      layout: { padding: { left: 4 } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.raw} prospectos` } } },
      scales: {
        x: { grid: rejilla, beginAtZero: true, ticks: { precision: 0 } },
        y: { grid: { display: false } },
      },
    },
  }));
};
