// Productos: CRUD del catálogo. Un producto con historial no se borra, se desactiva.

function formularioProducto(p = {}) {
  return `
    ${campo('Nombre', input('nombre', p.nombre, 'required maxlength="80" placeholder="ZCS Professional Edition"'))}
    ${campo('Descripción', input('descripcion', p.descripcion, 'maxlength="255" placeholder="Qué incluye esta versión"'))}
    <div class="grid gap-3 sm:grid-cols-2">
      ${campo('Tipo de versión', select('tipo_version', [['Comercial', 'Comercial'], ['Prueba', 'Prueba (gratis)']], p.tipo_version || 'Comercial'))}
      ${campo('Precio por buzón (USD)', input('precio_buzon', p.precio_buzon ?? '', 'type="number" min="0" step="0.01" required placeholder="35.00"'), 'Precio anual por buzón. Las pruebas van en 0.')}
    </div>
    <label class="flex items-center gap-2">
      <input type="checkbox" name="activo" class="h-4 w-4 accent-[#1D4F91]" ${p.activo === 0 ? '' : 'checked'}>
      Disponible para nuevas pruebas y propuestas
    </label>
    ${p.id_producto ? '<p class="border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-900">Cambiar el precio no altera las propuestas ni las ventas anteriores: cada una guardó su propio precio.</p>' : ''}`;
}

// El checkbox no viaja en el FormData cuando está apagado: se convierte aquí
const datosProducto = (d) => ({ ...d, activo: d.activo === 'on' });

vistas.productos = async (cont) => {
  const productos = await api('/api/productos');
  const nuevo = boton('Nuevo producto', 'primario', 'data-nuevo');

  const filas = productos.map((p) => `<tr class="${p.activo ? '' : 'text-slate-400'}">
    ${celda(p.id_producto, 'text-right tabular-nums')}
    ${celda(`<span class="font-semibold ${p.activo ? 'text-slate-900' : ''}">${esc(p.nombre)}</span>`)}
    ${celda(esc(p.descripcion || ''), 'text-slate-500')}
    ${celda(etiqueta(p.tipo_version))}
    ${celda(usd(p.precio_buzon), 'whitespace-nowrap text-right tabular-nums')}
    ${celda(numero(p.ventas), 'text-right tabular-nums')}
    ${celda(etiqueta(p.activo ? 'Activo' : 'Inactivo'))}
    ${celda(`${botonMini('Editar', 'editar', p.id_producto)}${botonMini(p.activo ? 'Desactivar' : 'Activar', 'activar', p.id_producto)}${botonMini('Eliminar', 'eliminar', p.id_producto, 'peligro')}`, 'whitespace-nowrap')}</tr>`);

  cont.innerHTML = `
    ${encabezado('Productos', 'Catálogo de versiones de Zimbra y su precio por buzón. Las que tienen historial solo se pueden desactivar.', nuevo)}
    ${panel('', `${barraFiltros(buscador('Buscar producto…'))}
      ${tabla(
        [{ titulo: 'Cód.', clase: 'text-right' }, { titulo: 'Producto' }, { titulo: 'Descripción' }, { titulo: 'Tipo' }, { titulo: 'Precio/buzón', clase: 'text-right' }, { titulo: 'Ventas', clase: 'text-right' }, { titulo: 'Estado' }, { titulo: 'Acciones' }],
        filas,
        estadoVacio('Aún no hay productos', 'Agrega la primera versión de Zimbra para poder registrar pruebas y propuestas.', nuevo))}
      ${pie(`${productos.length} productos · ${productos.filter((p) => p.activo).length} activos`)}`)}`;
  conectarBuscador(cont);

  const buscar = (id) => productos.find((p) => p.id_producto === Number(id));

  $$('[data-nuevo]', cont).forEach((b) => (b.onclick = () => abrirModal({
    titulo: 'Nuevo producto',
    cuerpo: formularioProducto(),
    textoBoton: 'Crear producto',
    onGuardar: async (d) => {
      const r = await api('/api/productos', { method: 'POST', body: datosProducto(d) });
      toast(r.mensaje); recargar();
    },
  })));

  cont.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const p = buscar(b.dataset.id);

    if (b.dataset.accion === 'editar') {
      abrirModal({
        titulo: 'Editar producto', subtitulo: esc(p.nombre),
        cuerpo: formularioProducto(p),
        onGuardar: async (d) => {
          const r = await api(`/api/productos/${p.id_producto}`, { method: 'PUT', body: datosProducto(d) });
          toast(r.mensaje); recargar();
        },
      });
    }

    if (b.dataset.accion === 'activar') {
      const ok = await confirmar({
        titulo: p.activo ? 'Desactivar producto' : 'Activar producto',
        mensaje: p.activo
          ? `<b>${esc(p.nombre)}</b> dejará de aparecer para nuevas pruebas y propuestas. Su historial se conserva.`
          : `<b>${esc(p.nombre)}</b> volverá a estar disponible.`,
        textoBoton: p.activo ? 'Desactivar' : 'Activar',
      });
      if (!ok) return;
      try {
        const r = await api(`/api/productos/${p.id_producto}/activo`, { method: 'PATCH', body: { activo: !p.activo } });
        toast(r.mensaje); recargar();
      } catch (err) { toast(err.message, 'error'); }
    }

    if (b.dataset.accion === 'eliminar') {
      const ok = await confirmar({
        titulo: 'Eliminar producto',
        mensaje: p.usos > 0
          ? `<b>${esc(p.nombre)}</b> ya se usó en pruebas o propuestas (${p.ventas} ventas). Para no perder la historia <b>no se borrará: se desactivará</b>.`
          : `¿Seguro que quieres eliminar <b>${esc(p.nombre)}</b>? Nunca se ha usado, así que se borrará del catálogo.`,
        textoBoton: p.usos > 0 ? 'Desactivar' : 'Eliminar',
        tipoBoton: 'peligro',
      });
      if (!ok) return;
      try {
        const r = await api(`/api/productos/${p.id_producto}`, { method: 'DELETE' });
        toast(r.mensaje, r.desactivado ? 'info' : 'ok'); recargar();
      } catch (err) { toast(err.message, 'error'); }
    }
  });
};
