// Facturas con su saldo y registro de pagos (transacción en el backend).
const ESTADOS_FACTURA = ['Pendiente', 'Pagada', 'Vencida', 'Anulada'];
let filtroFacturas = '';

// Porcentaje pagado de la factura
const porcentajePagado = (f) => (f.valor_total > 0 ? Math.round(((f.valor_total - f.saldo) / f.valor_total) * 100) : 0);

function abrirPago(f) {
  abrirModal({
    titulo: `Registrar pago · factura ${esc(f.numero)}`,
    subtitulo: `${esc(f.prospecto)} — saldo pendiente <b>${usd(f.saldo)}</b>`,
    cuerpo: `
      <div class="grid gap-3 sm:grid-cols-2">
        ${campo('Valor (USD)', `<div class="flex gap-1">${input('valor', '', `type="number" min="0.01" max="${f.saldo}" step="0.01" required placeholder="0.00"`)}
          ${boton('Todo', 'secundario', 'data-todo title="Pagar el saldo completo"')}</div>`, 'No puede superar el saldo.')}
        ${campo('Medio de pago', select('medio_pago', [['Transferencia', 'Transferencia'], ['Tarjeta', 'Tarjeta'], ['Consignación', 'Consignación']]))}
      </div>
      <p class="text-[11px] text-slate-500">El pago y el nuevo saldo se guardan en una sola transacción. Si el saldo llega a cero, la factura pasa a "Pagada".</p>`,
    textoBoton: 'Registrar pago',
    alAbrir: (form) => { $('[data-todo]', form).onclick = () => { form.valor.value = Number(f.saldo).toFixed(2); }; },
    onGuardar: async (d) => {
      const r = await api(`/api/facturas/${f.id_factura}/pagos`, { method: 'POST', body: d });
      toast(r.mensaje); recargar();
    },
  });
}

async function verPagos(f) {
  const pagos = await api(`/api/facturas/${f.id_factura}/pagos`);
  abrirModal({
    titulo: `Pagos de la factura ${esc(f.numero)}`,
    subtitulo: `${esc(f.prospecto)} · total ${usd(f.valor_total)}`,
    cuerpo: pagos.length
      ? `<div class="border border-slate-300">${tabla(
          [{ titulo: 'Fecha' }, { titulo: 'Medio' }, { titulo: 'Valor', clase: 'text-right' }],
          pagos.map((p) => `<tr>${celda(fechaHora(p.fecha_pago), 'tabular-nums')}${celda(esc(p.medio_pago))}${celda(usd(p.valor), 'text-right tabular-nums')}</tr>`), '')}</div>
        <p class="text-right">Saldo pendiente: <b class="tabular-nums">${usd(f.saldo)}</b></p>`
      : '<p class="py-4 text-center text-slate-500">Esta factura todavía no tiene pagos.</p>',
  });
}

vistas.facturas = async (cont) => {
  const facturas = await api('/api/facturas' + (filtroFacturas ? `?estado=${encodeURIComponent(filtroFacturas)}` : ''));
  const activas = facturas.filter((f) => f.estado !== 'Anulada');
  const totalFacturado = activas.reduce((s, f) => s + f.valor_total, 0);
  const saldo = activas.reduce((s, f) => s + f.saldo, 0);

  const filas = facturas.map((f) => `<tr>
    ${celda(`<b>${esc(f.numero)}</b>`, 'whitespace-nowrap')}
    ${celda(f.id_venta, 'text-right tabular-nums')}
    ${celda(`${esc(f.prospecto)}<div class="text-xs text-slate-500">${esc(f.empresa || 'Persona natural')}</div>`)}
    ${celda(`${esc(f.producto)}<div class="text-xs text-slate-500">${numero(f.cantidad_buzones)} buzones</div>`)}
    ${celda(fecha(f.fecha_emision), 'whitespace-nowrap tabular-nums')}
    ${celda(fecha(f.fecha_vencimiento), `whitespace-nowrap tabular-nums ${f.estado === 'Vencida' ? 'font-semibold text-red-700' : ''}`)}
    ${celda(usd(f.valor_total), 'whitespace-nowrap text-right tabular-nums')}
    ${celda(`<b>${usd(f.saldo)}</b>`, 'whitespace-nowrap text-right tabular-nums')}
    ${celda(f.estado === 'Anulada' ? '' : `<div class="flex items-center gap-1.5"><div class="w-12">${barraProgreso(porcentajePagado(f), porcentajePagado(f) === 100 ? 'bg-green-600' : 'bg-marca')}</div><span class="text-xs tabular-nums">${porcentajePagado(f)}%</span></div>`)}
    ${celda(etiqueta(f.estado))}
    ${celda(`${['Pendiente', 'Vencida'].includes(f.estado) ? botonMini('Registrar pago', 'pagar', f.id_factura, 'primario') : ''}${botonMini(`Pagos (${f.num_pagos})`, 'pagos', f.id_factura)}`, 'whitespace-nowrap')}</tr>`);

  cont.innerHTML = `
    ${encabezado('Facturas y pagos', 'Cada venta genera una factura. Los pagos descuentan el saldo hasta dejarla pagada.')}
    ${panel('', `${barraFiltros(`${buscador('Buscar por número, cliente o producto…')}
        <span class="text-xs text-slate-500 sm:ml-auto">Estado:</span>
        ${select('estado', [['', 'Todos'], ...ESTADOS_FACTURA.map((e) => [e, e])], filtroFacturas, 'data-filtro', 'sm:w-40')}`)}
      ${tabla(
        [{ titulo: 'Factura' }, { titulo: 'Venta', clase: 'text-right' }, { titulo: 'Cliente' }, { titulo: 'Producto' }, { titulo: 'Emisión' }, { titulo: 'Vence' }, { titulo: 'Total', clase: 'text-right' }, { titulo: 'Saldo', clase: 'text-right' }, { titulo: 'Pagado' }, { titulo: 'Estado' }, { titulo: 'Acciones' }],
        filas,
        filtroFacturas
          ? estadoVacio(`No hay facturas "${esc(filtroFacturas)}"`, 'Prueba con otro estado.')
          : estadoVacio('Todavía no hay facturas', 'Las facturas se crean solas al convertir una propuesta en venta.', '<a href="#propuestas" class="text-marca hover:underline">Ir a propuestas</a>'))}
      <div class="flex flex-wrap justify-end gap-x-6 border-t border-slate-300 bg-slate-100 px-3 py-1.5 tabular-nums">
        <span>${numero(facturas.length)} facturas</span>
        <span>Total facturado: <b>${usd(totalFacturado)}</b></span>
        <span>Saldo por cobrar: <b class="text-marca">${usd(saldo)}</b></span>
      </div>`)}`;
  conectarBuscador(cont);

  $('[data-filtro]', cont).onchange = (e) => { filtroFacturas = e.target.value; recargar(); };
  cont.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const f = facturas.find((x) => x.id_factura === Number(b.dataset.id));
    if (b.dataset.accion === 'pagar') abrirPago(f);
    if (b.dataset.accion === 'pagos') verPagos(f);
  });
};
