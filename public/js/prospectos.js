// Prospectos: listado con filtros, registro (prospecto + prueba de 60 días) y ficha con historial.
const ESTADOS_PROSPECTO = ['Nuevo', 'Calificado', 'En contacto', 'Cliente', 'Descartado'];
const CANALES = ['Búsqueda orgánica', 'Publicidad', 'Redes sociales', 'Referido', 'Correo'];
const filtrosProspectos = { estado: '', vendedor: '', pais: '' }; // se recuerdan al volver a la lista

function formularioProspecto(p = {}, { productosPrueba, vendedores, paises }) {
  return `
    <div class="grid gap-3 sm:grid-cols-2">
      ${campo('Nombre completo', input('nombre', p.nombre, 'required maxlength="100" placeholder="Laura Gómez"'))}
      ${campo('Empresa', input('empresa', p.empresa, 'maxlength="100" placeholder="Opcional"'))}
      ${campo('Correo', input('correo', p.correo, 'type="email" required maxlength="100" placeholder="laura@empresa.com"'))}
      ${campo('Teléfono', input('telefono', p.telefono, 'maxlength="20" placeholder="+57 300 000 0000"'))}
      ${campo('País', input('pais', p.pais, 'required list="listaPaises" maxlength="60" placeholder="Colombia"'))}
      ${campo('Canal de llegada', select('canal', CANALES.map((c) => [c, c]), p.canal || 'Búsqueda orgánica'))}
    </div>
    <datalist id="listaPaises">${paises.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
    ${productosPrueba ? `
      ${campo('Prueba de 60 días', select('id_producto', productosPrueba.map((x) => [x.id_producto, x.nombre])), 'Se activa hoy y vence en 60 días.')}
      <label class="flex items-start gap-2 border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
        <input type="checkbox" name="simularError" class="mt-0.5 h-4 w-4 accent-amber-600">
        <span><b>Demostración SAVEPOINT:</b> simular que falla la creación de la prueba. El prospecto se guarda igual (ROLLBACK TO SAVEPOINT).</span>
      </label>` : ''}
    ${vendedores ? campo('Vendedor asignado', select('id_vendedor', [['', 'Sin asignar'], ...vendedores.map((v) => [v.id_empleado, `${v.nombre} (${v.prospectos_abiertos} abiertos)`])], p.id_vendedor || '')) : ''}`;
}

// Carga los datos que necesitan los formularios
async function catalogosProspecto() {
  const [productos, vendedores, paises] = await Promise.all([api('/api/productos'), api('/api/vendedores'), api('/api/prospectos/paises')]);
  return { productosPrueba: productos.filter((p) => p.tipo_version === 'Prueba' && p.activo), vendedores, paises };
}

async function abrirNuevoProspecto() {
  const cat = await catalogosProspecto();
  if (!cat.productosPrueba.length) return toast('No hay versiones de prueba activas en el catálogo de productos.', 'error');
  abrirModal({
    titulo: 'Registrar prospecto',
    subtitulo: 'Crea el prospecto y activa su prueba gratis en una sola transacción.',
    cuerpo: formularioProspecto({}, { ...cat, vendedores: null }),
    textoBoton: 'Registrar',
    onGuardar: async (d) => {
      const url = '/api/prospectos' + (d.simularError ? '?simularError=true' : '');
      const r = await api(url, { method: 'POST', body: d });
      toast(r.mensaje, r.prueba ? 'ok' : 'info');
      location.hash = `#prospecto/${r.id_prospecto}`;
    },
  });
}

async function abrirEditarProspecto(p) {
  const cat = await catalogosProspecto();
  abrirModal({
    titulo: 'Editar prospecto', subtitulo: esc(p.nombre),
    cuerpo: formularioProspecto(p, { ...cat, productosPrueba: null }),
    onGuardar: async (d) => {
      const r = await api(`/api/prospectos/${p.id_prospecto}`, { method: 'PUT', body: d });
      toast(r.mensaje); recargar();
    },
  });
}

async function descartarProspecto(p) {
  const ok = await confirmar({
    titulo: 'Descartar prospecto',
    mensaje: `<b>${esc(p.nombre)}</b> pasará a "Descartado". No se borra: su historial se conserva.`,
    textoBoton: 'Descartar', tipoBoton: 'peligro',
  });
  if (!ok) return;
  try {
    const r = await api(`/api/prospectos/${p.id_prospecto}/descartar`, { method: 'POST' });
    toast(r.mensaje); recargar();
  } catch (err) { toast(err.message, 'error'); }
}

// Puntaje con su barra: llega a "Calificado" con 50 puntos
const puntaje = (n) => `<div class="flex items-center gap-2"><span class="w-7 text-right tabular-nums">${n}</span>
  <div class="w-14">${barraProgreso(n, n >= 50 ? 'bg-marca' : 'bg-slate-400')}</div></div>`;

// ----------------------------------------------------------------- listado
vistas.prospectos = async (cont) => {
  const params = new URLSearchParams(Object.entries(filtrosProspectos).filter(([, v]) => v));
  const [prospectos, vendedores, paises] = await Promise.all([
    api('/api/prospectos?' + params), api('/api/vendedores'), api('/api/prospectos/paises')]);
  const nuevo = boton('Registrar prospecto', 'primario', 'data-nuevo');
  const hayFiltros = Object.values(filtrosProspectos).some(Boolean);

  const filas = prospectos.map((p) => `<tr>
    ${celda(p.id_prospecto, 'text-right tabular-nums')}
    ${celda(`<a href="#prospecto/${p.id_prospecto}" class="font-semibold text-marca hover:underline">${esc(p.nombre)}</a>`, 'whitespace-nowrap')}
    ${celda(esc(p.empresa || '—'))}
    ${celda(esc(p.correo), 'text-slate-600')}
    ${celda(esc(p.pais), 'whitespace-nowrap')}
    ${celda(puntaje(p.puntaje))}
    ${celda(etiqueta(p.estado))}
    ${celda(p.vendedor ? esc(p.vendedor) : '<span class="text-slate-400">Sin asignar</span>', 'whitespace-nowrap')}
    ${celda(p.dias_prueba !== null ? `<span class="${p.dias_prueba <= 10 ? 'font-semibold text-red-700' : ''}">${p.dias_prueba} d</span>` : '<span class="text-slate-400">—</span>', 'text-right tabular-nums')}
    ${celda(`${botonMini('Editar', 'editar', p.id_prospecto)}${['Cliente', 'Descartado'].includes(p.estado) ? '' : botonMini('Descartar', 'descartar', p.id_prospecto, 'peligro')}`, 'whitespace-nowrap')}</tr>`);

  const filtro = (nombre, opciones) => select(nombre, opciones, filtrosProspectos[nombre], 'data-filtro', 'sm:w-44');

  cont.innerHTML = `
    ${encabezado('Prospectos', 'Personas y empresas interesadas. Un cliente es un prospecto que ya compró.', nuevo)}
    ${panel('', `${barraFiltros(`${buscador('Buscar por nombre, empresa o correo…')}
        <span class="text-xs text-slate-500 sm:ml-auto">Filtrar:</span>
        ${filtro('estado', [['', 'Todos los estados'], ...ESTADOS_PROSPECTO.map((e) => [e, e])])}
        ${filtro('vendedor', [['', 'Todos los vendedores'], ['sin', 'Sin asignar'], ...vendedores.map((v) => [v.id_empleado, v.nombre])])}
        ${filtro('pais', [['', 'Todos los países'], ...paises.map((x) => [x, x])])}`)}
      ${tabla(
        [{ titulo: 'Cód.', clase: 'text-right' }, { titulo: 'Nombre' }, { titulo: 'Empresa' }, { titulo: 'Correo' }, { titulo: 'País' }, { titulo: 'Puntaje' }, { titulo: 'Estado' }, { titulo: 'Vendedor' }, { titulo: 'Prueba', clase: 'text-right' }, { titulo: 'Acciones' }],
        filas,
        hayFiltros
          ? estadoVacio('Ningún prospecto con esos filtros', 'Prueba con otro estado, vendedor o país.', boton('Quitar filtros', 'secundario', 'data-limpiar'))
          : estadoVacio('Todavía no hay prospectos', 'Registra el primero: se crea con su prueba de 60 días.', nuevo))}
      ${pie(`${numero(prospectos.length)} registros${hayFiltros ? ' con los filtros elegidos' : ''} · "Prueba" = días que le quedan a la prueba activa`)}`)}`;
  conectarBuscador(cont);

  $$('[data-filtro]', cont).forEach((s) => (s.onchange = () => { filtrosProspectos[s.name] = s.value; recargar(); }));
  $('[data-limpiar]', cont)?.addEventListener('click', () => { Object.keys(filtrosProspectos).forEach((k) => (filtrosProspectos[k] = '')); recargar(); });
  $$('[data-nuevo]', cont).forEach((b) => (b.onclick = abrirNuevoProspecto));

  cont.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const p = prospectos.find((x) => x.id_prospecto === Number(b.dataset.id));
    if (b.dataset.accion === 'editar') abrirEditarProspecto(p);
    if (b.dataset.accion === 'descartar') descartarProspecto(p);
  });
};

// ----------------------------------------------------------------- ficha
vistas.prospecto = async (cont, id) => {
  const { prospecto: p, pruebas, actividades, contactos, propuestas } = await api(`/api/prospectos/${id}`);
  // Datos en forma de formulario de solo lectura (etiqueta: valor)
  const dato = (titulo, valor) => `<div class="border-b border-r border-slate-200 px-3 py-1.5">
    <dt class="text-[11px] text-slate-500">${titulo}</dt><dd class="font-semibold text-slate-900">${valor}</dd></div>`;
  const vacio = (texto) => `<p class="px-3 py-5 text-center text-xs text-slate-500">${texto}</p>`;

  cont.innerHTML = `
    ${encabezado(`${esc(p.nombre)} <span class="ml-1 align-middle">${etiqueta(p.estado)}</span>`,
      `<a href="#prospectos" class="text-marca hover:underline">Prospectos</a> › Ficha del prospecto n.º ${p.id_prospecto}`,
      `${boton('Editar', 'secundario', 'data-editar')}${p.estado !== 'Descartado' ? boton('Nueva propuesta', 'primario', 'data-proponer') : ''}`)}
    ${panel('Datos generales', `<dl class="grid grid-cols-2 sm:grid-cols-4">
        ${dato('Empresa', esc(p.empresa || 'Persona natural'))}
        ${dato('Correo', esc(p.correo))}
        ${dato('Teléfono', esc(p.telefono || '—'))}
        ${dato('País', esc(p.pais))}
        ${dato('Canal', esc(p.canal))}
        ${dato('Vendedor', esc(p.vendedor || 'Sin asignar'))}
        ${dato('Puntaje', puntaje(p.puntaje))}
        ${dato('Registrado', fechaHora(p.fecha_registro))}
      </dl>`)}

    <div class="mt-3 grid items-start gap-3 lg:grid-cols-2">
      ${panel('Propuestas y ventas', propuestas.length ? tabla(
        [{ titulo: 'N.º', clase: 'text-right' }, { titulo: 'Fecha' }, { titulo: 'Producto' }, { titulo: 'Buzones', clase: 'text-right' }, { titulo: 'Total', clase: 'text-right' }, { titulo: 'Estado' }, { titulo: 'Factura' }],
        propuestas.map((x) => `<tr>${celda(x.id_propuesta, 'text-right')}${celda(fecha(x.fecha), 'tabular-nums')}${celda(esc(x.producto))}
          ${celda(numero(x.cantidad_buzones), 'text-right tabular-nums')}${celda(usd(x.total), 'whitespace-nowrap text-right tabular-nums')}
          ${celda(etiqueta(x.estado_venta === 'Anulada' ? 'Anulada' : x.estado))}${celda(esc(x.factura || '—'), 'whitespace-nowrap')}</tr>`), '') : vacio('Sin propuestas todavía.'))}

      ${panel('Pruebas de 60 días', pruebas.length ? tabla(
        [{ titulo: 'Producto' }, { titulo: 'Inicio' }, { titulo: 'Vence' }, { titulo: 'Estado' }],
        pruebas.map((t) => `<tr>${celda(esc(t.producto))}${celda(fecha(t.fecha_inicio), 'tabular-nums')}${celda(fecha(t.fecha_vencimiento), 'tabular-nums')}${celda(etiqueta(t.estado))}</tr>`), '') : vacio('No tiene pruebas registradas.'))}

      ${panel('Contactos del vendedor', contactos.length ? tabla(
        [{ titulo: 'Fecha' }, { titulo: 'Medio' }, { titulo: 'Resultado' }, { titulo: 'Vendedor' }, { titulo: 'Notas' }],
        contactos.map((c) => `<tr>${celda(fechaHora(c.fecha_hora), 'whitespace-nowrap tabular-nums')}${celda(esc(c.medio))}${celda(esc(c.resultado), 'whitespace-nowrap')}
          ${celda(esc(c.vendedor), 'whitespace-nowrap')}${celda(esc(c.notas || ''), 'text-slate-600')}</tr>`), '') : vacio('Ningún vendedor lo ha contactado todavía.'))}

      ${panel(`Actividad en el sitio (${actividades.length} eventos)`, actividades.length ? `<div class="max-h-72 overflow-y-auto">${tabla(
        [{ titulo: 'Fecha' }, { titulo: 'Evento' }, { titulo: 'Puntos', clase: 'text-right' }],
        actividades.map((a) => `<tr>${celda(fechaHora(a.fecha_hora), 'whitespace-nowrap tabular-nums')}${celda(esc(a.tipo))}${celda(`+${a.puntos}`, 'text-right tabular-nums')}</tr>`), '')}</div>` : vacio('Sin actividad registrada.'))}
    </div>`;

  $('[data-editar]', cont).onclick = () => abrirEditarProspecto(p);
  const btnProponer = $('[data-proponer]', cont);
  if (btnProponer) btnProponer.onclick = () => abrirNuevaPropuesta(p.id_prospecto);
};
