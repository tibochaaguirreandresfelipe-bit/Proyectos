// Propuestas comerciales y el botón "Convertir en venta" (usa la transacción del backend).
const ESTADOS_PROPUESTA = ['Enviada', 'Aceptada', 'Rechazada', 'Vencida'];
let filtroPropuestas = '';
let simularErrorVenta = false; // interruptor de demostración del ROLLBACK

// Formulario con el total en vivo: cantidad × precio del producto elegido
function formularioPropuesta({ prospectos, productos, vendedores }, valores = {}) {
  return `
    ${prospectos ? campo('Prospecto', select('id_prospecto', [['', 'Elige un prospecto…'], ...prospectos.map((p) => [p.id_prospecto, `${p.nombre} — ${p.empresa || 'Persona natural'} (${p.estado})`])], valores.id_prospecto || '', 'required')) : ''}
    ${campo('Versión de Zimbra', select('id_producto', productos.map((p) => [p.id_producto, `${p.nombre} — ${usd(p.precio_buzon)} por buzón`]), valores.id_producto || ''))}
    <div class="grid gap-3 sm:grid-cols-2">
      ${campo('Cantidad de buzones', input('cantidad_buzones', valores.cantidad_buzones || '', 'type="number" min="1" step="1" required placeholder="100"'))}
      ${vendedores ? campo('Vendedor', select('id_vendedor', [['', 'El asignado al prospecto'], ...vendedores.map((v) => [v.id_empleado, v.nombre])], '')) : '<div></div>'}
    </div>
    <table class="w-full border border-slate-300 text-[13px]">
      <tr class="bg-slate-50"><td class="px-2 py-1 text-slate-600">Cálculo</td><td data-detalle class="px-2 py-1 text-right tabular-nums text-slate-600">—</td></tr>
      <tr class="border-t border-slate-300"><td class="px-2 py-1.5 font-semibold">Total de la propuesta</td><td data-total class="px-2 py-1.5 text-right text-lg font-semibold tabular-nums text-marca">${usd(0)}</td></tr>
    </table>
    <p class="text-[11px] text-slate-500">El precio por buzón se copia a la propuesta: si después cambia en el catálogo, esta propuesta no cambia. Es válida por 15 días.</p>`;
}

function conectarTotalEnVivo(form, productos, prospectos) {
  const calcular = () => {
    const prod = productos.find((p) => p.id_producto === Number(form.id_producto.value));
    const cantidad = Math.max(0, Math.floor(Number(form.cantidad_buzones.value) || 0));
    $('[data-total]', form).textContent = usd(prod ? prod.precio_buzon * cantidad : 0);
    $('[data-detalle]', form).textContent = prod ? `${numero(cantidad)} buzones × ${usd(prod.precio_buzon)}` : '—';
  };
  form.id_producto.addEventListener('change', calcular);
  form.cantidad_buzones.addEventListener('input', calcular);
  // Al elegir prospecto se sugiere su vendedor asignado
  if (prospectos && form.id_vendedor) {
    form.id_prospecto.addEventListener('change', () => {
      const p = prospectos.find((x) => x.id_prospecto === Number(form.id_prospecto.value));
      form.id_vendedor.value = p && p.id_vendedor ? p.id_vendedor : '';
    });
  }
  calcular();
}

async function abrirNuevaPropuesta(idProspecto = '') {
  const [todos, productosTodos, vendedores] = await Promise.all([api('/api/prospectos'), api('/api/productos'), api('/api/vendedores')]);
  const prospectos = todos.filter((p) => p.estado !== 'Descartado').sort((a, b) => a.nombre.localeCompare(b.nombre));
  const productos = productosTodos.filter((p) => p.tipo_version === 'Comercial' && p.activo);
  if (!productos.length) return toast('No hay versiones comerciales activas en el catálogo.', 'error');
  abrirModal({
    titulo: 'Nueva propuesta comercial',
    cuerpo: formularioPropuesta({ prospectos, productos, vendedores }, { id_prospecto: idProspecto }),
    textoBoton: 'Enviar propuesta',
    alAbrir: (form) => {
      conectarTotalEnVivo(form, productos, prospectos);
      form.id_prospecto.dispatchEvent(new Event('change'));
    },
    onGuardar: async (d) => {
      if (!d.id_prospecto) throw new Error('Elige un prospecto.');
      const r = await api('/api/propuestas', { method: 'POST', body: d });
      toast(r.mensaje);
      location.hash === '#propuestas' ? recargar() : (location.hash = '#propuestas');
    },
  });
}

// Confirmación + llamada a la transacción de venta
async function convertirEnVenta(x) {
  const conError = simularErrorVenta;
  const paso = (texto) => `<tr><td class="w-6 border-b border-slate-200 px-2 py-1 text-center text-marca">✔</td><td class="border-b border-slate-200 px-2 py-1">${texto}</td></tr>`;
  const ok = await confirmar({
    titulo: `Convertir en venta · propuesta n.º ${x.id_propuesta}`,
    mensaje: `
      <p class="mb-2">Se ejecutará <b>una sola transacción</b>. Se hacen todos estos cambios o ninguno:</p>
      <table class="w-full border border-slate-300">
        ${paso(`Crear la venta por <b>${usd(x.total)}</b>`)}
        ${paso(`Crear su factura con saldo ${usd(x.total)} (Pendiente)`)}
        ${paso('Propuesta → <b>Aceptada</b>')}
        ${paso(`${esc(x.prospecto)} → <b>Cliente</b>`)}
        ${paso('Su prueba activa → <b>Convertida</b>')}
      </table>
      ${conError ? '<p class="mt-2 border border-amber-300 bg-amber-50 px-2 py-1.5 text-amber-900"><b>Modo demostración activo:</b> se lanzará un error después de insertar la venta. Verás el ROLLBACK: nada quedará guardado.</p>' : ''}`,
    textoBoton: conError ? 'Vender con error simulado' : 'Confirmar venta',
    tipoBoton: conError ? 'peligro' : 'primario',
  });
  if (!ok) return;
  try {
    const r = await api(`/api/propuestas/${x.id_propuesta}/venta${conError ? '?simularError=true' : ''}`, { method: 'POST' });
    toast(r.mensaje);
  } catch (err) {
    toast(err.message, 'error');
  }
  recargar();
}

vistas.propuestas = async (cont) => {
  const propuestas = await api('/api/propuestas' + (filtroPropuestas ? `?estado=${encodeURIComponent(filtroPropuestas)}` : ''));
  const nueva = boton('Nueva propuesta', 'primario', 'data-nueva');

  const filas = propuestas.map((x) => {
    const vendible = x.estado === 'Enviada' && x.vigente;
    let acciones = '';
    if (vendible) acciones = `${botonMini('Convertir en venta', 'vender', x.id_propuesta, 'primario')}${botonMini('Editar', 'editar', x.id_propuesta)}${botonMini('Rechazar', 'rechazar', x.id_propuesta, 'peligro')}`;
    else if (x.estado === 'Enviada') acciones = `<span class="text-xs text-red-700">Vencida el ${fecha(x.fecha_validez)}</span>${botonMini('Rechazar', 'rechazar', x.id_propuesta, 'peligro')}`;
    else if (x.factura) acciones = `<a href="#facturas" class="px-1 text-xs text-marca hover:underline">Ver factura ${esc(x.factura)}</a>`;
    return `<tr>
      ${celda(x.id_propuesta, 'text-right tabular-nums')}
      ${celda(fecha(x.fecha), 'whitespace-nowrap tabular-nums')}
      ${celda(`<a href="#prospecto/${x.id_prospecto}" class="font-semibold text-marca hover:underline">${esc(x.prospecto)}</a><div class="text-xs text-slate-500">${esc(x.empresa || 'Persona natural')}</div>`)}
      ${celda(esc(x.producto))}
      ${celda(numero(x.cantidad_buzones), 'text-right tabular-nums')}
      ${celda(usd(x.precio_unitario), 'whitespace-nowrap text-right tabular-nums')}
      ${celda(usd(x.total), 'whitespace-nowrap text-right font-semibold tabular-nums')}
      ${celda(esc(x.vendedor))}
      ${celda(fecha(x.fecha_validez), 'whitespace-nowrap tabular-nums')}
      ${celda(etiqueta(x.estado_venta === 'Anulada' ? 'Anulada' : x.estado))}
      ${celda(acciones, 'whitespace-nowrap')}</tr>`;
  });

  cont.innerHTML = `
    ${encabezado('Propuestas y ventas', 'Una propuesta "Enviada" y vigente se puede convertir en venta con su factura.', `
      <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border px-2 py-1 ${simularErrorVenta ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-slate-400 bg-white text-slate-700'}">
        <input type="checkbox" data-simular class="h-3.5 w-3.5 accent-amber-600" ${simularErrorVenta ? 'checked' : ''}>
        Simular error (ROLLBACK)
      </label>${nueva}`)}
    ${simularErrorVenta ? '<p class="mb-2 border border-amber-300 bg-amber-50 px-3 py-1.5 text-amber-900"><b>Modo demostración:</b> la próxima venta fallará a propósito después de insertar la venta, para mostrar el ROLLBACK.</p>' : ''}
    ${panel('', `${barraFiltros(`${buscador('Buscar por prospecto, producto o vendedor…')}
        <span class="text-xs text-slate-500 sm:ml-auto">Estado:</span>
        ${select('estado', [['', 'Todos'], ...ESTADOS_PROPUESTA.map((e) => [e, e])], filtroPropuestas, 'data-filtro', 'sm:w-40')}`)}
      ${tabla(
        [{ titulo: 'N.º', clase: 'text-right' }, { titulo: 'Fecha' }, { titulo: 'Prospecto' }, { titulo: 'Producto' }, { titulo: 'Buzones', clase: 'text-right' }, { titulo: 'Precio unit.', clase: 'text-right' }, { titulo: 'Total', clase: 'text-right' }, { titulo: 'Vendedor' }, { titulo: 'Válida hasta' }, { titulo: 'Estado' }, { titulo: 'Acciones' }],
        filas,
        filtroPropuestas
          ? estadoVacio(`No hay propuestas "${esc(filtroPropuestas)}"`, 'Prueba con otro estado.')
          : estadoVacio('Todavía no hay propuestas', 'Crea una propuesta para un prospecto y luego conviértela en venta.', nueva))}
      ${pie(`${numero(propuestas.length)} propuestas · ${propuestas.filter((x) => x.estado === 'Enviada' && x.vigente).length} listas para vender`)}`)}`;
  conectarBuscador(cont);

  $('[data-simular]', cont).onchange = (e) => { simularErrorVenta = e.target.checked; recargar(); };
  $('[data-filtro]', cont).onchange = (e) => { filtroPropuestas = e.target.value; recargar(); };
  $$('[data-nueva]', cont).forEach((b) => (b.onclick = () => abrirNuevaPropuesta()));

  cont.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const x = propuestas.find((p) => p.id_propuesta === Number(b.dataset.id));

    if (b.dataset.accion === 'vender') convertirEnVenta(x);

    if (b.dataset.accion === 'editar') {
      const productos = (await api('/api/productos')).filter((p) => p.tipo_version === 'Comercial' && p.activo);
      abrirModal({
        titulo: `Editar propuesta n.º ${x.id_propuesta}`, subtitulo: esc(x.prospecto),
        cuerpo: formularioPropuesta({ productos }, x),
        alAbrir: (form) => conectarTotalEnVivo(form, productos),
        onGuardar: async (d) => {
          const r = await api(`/api/propuestas/${x.id_propuesta}`, { method: 'PUT', body: d });
          toast(r.mensaje); recargar();
        },
      });
    }

    if (b.dataset.accion === 'rechazar') {
      const ok = await confirmar({
        titulo: 'Rechazar propuesta',
        mensaje: `La propuesta n.º ${x.id_propuesta} de <b>${esc(x.prospecto)}</b> quedará "Rechazada" y ya no se podrá convertir en venta.`,
        textoBoton: 'Rechazar', tipoBoton: 'peligro',
      });
      if (!ok) return;
      try {
        const r = await api(`/api/propuestas/${x.id_propuesta}/rechazar`, { method: 'POST' });
        toast(r.mensaje); recargar();
      } catch (err) { toast(err.message, 'error'); }
    }
  });
};
