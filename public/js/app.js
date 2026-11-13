// =====================================================================
// app.js: utilidades compartidas (API, formato, ventanas, avisos, tablas)
// y el "router" que muestra la vista según el #hash de la URL.
// Cada módulo (dashboard.js, productos.js, ...) agrega su vista a `vistas`.
// =====================================================================
const vistas = {};
const $ = (selector, raiz = document) => raiz.querySelector(selector);
const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

// ---------- Llamadas a la API ----------
// Devuelve el JSON de la respuesta o lanza un Error con el mensaje en español del backend.
async function api(url, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('No hay conexión con el servidor. ¿Está corriendo "npm run dev"?');
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error || 'Ocurrió un error inesperado.');
  return datos;
}

// ---------- Formato ----------
// Escapa el texto antes de meterlo en el HTML (evita que un nombre con <script> se ejecute)
function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const formatoUsd = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const usd = (n) => formatoUsd.format(Number(n || 0));
const numero = (n) => new Intl.NumberFormat('es-CO').format(Number(n || 0));
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// '2026-11-12' o '2026-11-12 10:30:00' -> '12/11/2026' (sin pasar por Date, para no cambiar de día por la zona horaria)
function fecha(texto) {
  if (!texto) return '—';
  const [a, m, d] = texto.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
const fechaHora = (texto) => (texto ? `${fecha(texto)} ${texto.slice(11, 16)}` : '—');

// ---------- Etiquetas de estado ----------
// Rectangulares, como en un sistema administrativo: borde + texto del mismo color
const COLORES_ESTADO = {
  Nuevo: 'border-sky-300 bg-sky-50 text-sky-800',
  Calificado: 'border-violet-300 bg-violet-50 text-violet-800',
  'En contacto': 'border-amber-300 bg-amber-50 text-amber-800',
  Cliente: 'border-green-400 bg-green-50 text-green-800',
  Descartado: 'border-slate-300 bg-slate-100 text-slate-500',
  Activa: 'border-green-400 bg-green-50 text-green-800',
  Convertida: 'border-teal-400 bg-teal-50 text-teal-800',
  Vencida: 'border-red-300 bg-red-50 text-red-700',
  Enviada: 'border-sky-300 bg-sky-50 text-sky-800',
  Aceptada: 'border-green-400 bg-green-50 text-green-800',
  Rechazada: 'border-slate-300 bg-slate-100 text-slate-500',
  Pendiente: 'border-amber-300 bg-amber-50 text-amber-800',
  Pagada: 'border-green-400 bg-green-50 text-green-800',
  Anulada: 'border-slate-300 bg-slate-100 text-slate-500 line-through',
  Activo: 'border-green-400 bg-green-50 text-green-800',
  Inactivo: 'border-slate-300 bg-slate-100 text-slate-500',
  Prueba: 'border-violet-300 bg-violet-50 text-violet-800',
  Comercial: 'border-blue-300 bg-blue-50 text-blue-800',
};
function etiqueta(estado) {
  const clases = COLORES_ESTADO[estado] || 'border-slate-300 bg-slate-100 text-slate-700';
  return `<span class="inline-block whitespace-nowrap border px-1.5 text-[11px] font-semibold uppercase leading-[18px] tracking-wide ${clases}">${esc(estado)}</span>`;
}

// ---------- Botones y campos ----------
const CLASE_BTN = {
  primario: 'border-marca-oscuro bg-marca text-white hover:bg-marca-oscuro',
  secundario: 'btn-gris border-slate-400 text-slate-800',
  peligro: 'btn-gris border-red-400 text-red-700',
};
const boton = (texto, tipo = 'secundario', extra = '') =>
  `<button type="button" class="inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-3 py-1 text-[13px] disabled:cursor-not-allowed disabled:opacity-50 ${CLASE_BTN[tipo]}" ${extra}>${texto}</button>`;
// Acciones dentro de una tabla: la principal es un botón pequeño, las demás son enlaces de texto
const botonMini = (texto, accion, id, tipo = 'enlace') => tipo === 'primario'
  ? `<button type="button" data-accion="${accion}" data-id="${id}" class="whitespace-nowrap rounded-sm border border-marca-oscuro bg-marca px-2 py-0.5 text-xs text-white hover:bg-marca-oscuro">${texto}</button>`
  : `<button type="button" data-accion="${accion}" data-id="${id}" class="whitespace-nowrap px-1 text-xs underline-offset-2 hover:underline ${tipo === 'peligro' ? 'text-red-700' : 'text-marca'}">${texto}</button>`;

const CLASE_INPUT = 'block w-full rounded-sm border border-slate-400 bg-white px-2 py-1 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-marca focus:outline-none focus:ring-1 focus:ring-marca';
function campo(etiquetaTexto, controlHtml, ayuda = '') {
  return `<label class="block"><span class="mb-0.5 block text-xs font-semibold text-slate-700">${etiquetaTexto}</span>${controlHtml}${ayuda ? `<span class="mt-0.5 block text-[11px] text-slate-500">${ayuda}</span>` : ''}</label>`;
}
const input = (name, valor = '', attrs = '') => `<input name="${name}" value="${esc(valor)}" class="${CLASE_INPUT}" ${attrs}>`;
// opciones: [[valor, texto], ...]
function select(name, opciones, elegido = '', attrs = '', claseExtra = '') {
  return `<select name="${name}" class="${CLASE_INPUT} ${claseExtra}" ${attrs}>${opciones
    .map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(elegido) ? 'selected' : ''}>${esc(t)}</option>`)
    .join('')}</select>`;
}

// ---------- Estructura de la página ----------
// Título de la pantalla con su barra de herramientas a la derecha
function encabezado(titulo, descripcion, accionesHtml = '') {
  return `<div class="mb-3 flex flex-col gap-2 border-b border-slate-300 pb-2 sm:flex-row sm:items-end sm:justify-between">
    <div><h1 class="text-lg font-semibold text-slate-900">${titulo}</h1>
    <p class="text-xs text-slate-500">${descripcion}</p></div>
    <div class="flex flex-wrap items-center gap-1.5">${accionesHtml}</div></div>`;
}
// Panel con franja de título gris (como un recuadro de formulario de escritorio)
function panel(titulo, contenido, derecha = '', extra = '') {
  return `<section class="min-w-0 border border-slate-300 bg-white ${extra}">
    ${titulo ? `<div class="flex items-center justify-between gap-2 border-b border-slate-300 bg-slate-100 px-3 py-1.5">
      <h2 class="text-[13px] font-semibold text-slate-800">${titulo}</h2>${derecha}</div>` : ''}
    ${contenido}</section>`;
}
// Barra de herramientas sobre una tabla (buscador y filtros)
const barraFiltros = (contenido) => `<div class="flex flex-col gap-2 border-b border-slate-300 bg-slate-50 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center">${contenido}</div>`;
const buscador = (placeholder = 'Buscar…') => `<input data-buscador type="search" placeholder="${placeholder}" class="${CLASE_INPUT} sm:w-72">`;

function estadoVacio(titulo, texto, botonHtml = '') {
  return `<div class="px-4 py-10 text-center">
    <p class="font-semibold text-slate-700">${titulo}</p>
    <p class="mt-1 text-xs text-slate-500">${texto}</p>
    ${botonHtml ? `<div class="mt-3">${botonHtml}</div>` : ''}</div>`;
}

// Tabla con bordes; filas = arreglo de strings <tr>…</tr>
function tabla(columnas, filas, vacio) {
  if (!filas.length) return vacio;
  return `<div class="overflow-x-auto"><table class="tabla w-full border-collapse text-[13px]">
    <thead><tr>${columnas.map((c) => `<th class="whitespace-nowrap border-b border-r border-slate-300 bg-slate-100 px-2 py-1.5 text-left font-semibold text-slate-700 last:border-r-0 ${c.clase || ''}">${c.titulo}</th>`).join('')}</tr></thead>
    <tbody>${filas.join('')}</tbody></table>
    <p data-sin-resultados class="hidden px-3 py-6 text-center text-xs text-slate-500">Ningún registro coincide con la búsqueda.</p></div>`;
}
const celda = (contenido, clase = '') => `<td class="border-b border-r border-slate-200 px-2 py-1.5 align-middle last:border-r-0 ${clase}">${contenido}</td>`;
const pie = (texto) => `<div class="border-t border-slate-300 bg-slate-50 px-3 py-1 text-[11px] text-slate-500">${texto}</div>`;

// Barra de avance (pagado, puntaje…)
const barraProgreso = (porcentaje, clase = 'bg-marca') => `<div class="h-1.5 w-full border border-slate-300 bg-slate-100"><div class="h-full ${clase}" style="width:${Math.max(0, Math.min(100, porcentaje))}%"></div></div>`;

// Filtra las filas de la tabla mientras se escribe en el buscador
function conectarBuscador(raiz) {
  const caja = $('[data-buscador]', raiz);
  if (!caja) return;
  caja.addEventListener('input', () => {
    const texto = caja.value.trim().toLowerCase();
    let visibles = 0;
    $$('tbody tr', raiz).forEach((tr) => {
      const coincide = tr.textContent.toLowerCase().includes(texto);
      tr.classList.toggle('hidden', !coincide);
      if (coincide) visibles++;
    });
    $('[data-sin-resultados]', raiz)?.classList.toggle('hidden', visibles > 0);
  });
}

const cargando = () => '<p class="px-2 py-10 text-center text-slate-500">Cargando…</p>';

// ---------- Avisos (toast) ----------
function toast(mensaje, tipo = 'ok') {
  const [borde, simbolo] = { ok: ['border-l-green-600', '✔'], error: ['border-l-red-600', '✖'], info: ['border-l-amber-500', '!'] }[tipo];
  const el = document.createElement('div');
  el.className = `pointer-events-auto flex items-start gap-2 border border-l-4 border-slate-400 ${borde} bg-white px-3 py-2 text-[13px] shadow-lg`;
  el.innerHTML = `<b class="w-3 shrink-0">${simbolo}</b><p class="flex-1">${esc(mensaje)}</p>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), tipo === 'ok' ? 5000 : 9000);
}

// ---------- Ventana modal ----------
// abrirModal({ titulo, cuerpo, textoBoton, onGuardar(datos, form) }) muestra un formulario.
// Si onGuardar lanza un error, la ventana sigue abierta y muestra el mensaje.
function abrirModal({ titulo, subtitulo = '', cuerpo, textoBoton = 'Guardar', tipoBoton = 'primario', onGuardar, alAbrir }) {
  $('#modalCaja').innerHTML = `
    <form novalidate>
      <div class="flex items-center justify-between bg-marca px-3 py-1.5 text-white">
        <h3 class="text-[13px] font-semibold">${titulo}</h3>
        <button type="button" data-cerrar class="px-1 text-white/80 hover:text-white" aria-label="Cerrar">✕</button>
      </div>
      ${subtitulo ? `<p class="border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-xs text-slate-600">${subtitulo}</p>` : ''}
      <div class="space-y-3 px-4 py-4">${cuerpo}
        <p data-error-modal class="hidden border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-800"></p>
      </div>
      <div class="flex justify-end gap-2 border-t border-slate-300 bg-slate-100 px-3 py-2">
        ${onGuardar ? boton(textoBoton, tipoBoton, 'data-guardar type="submit"').replace('type="button" ', '') : ''}
        ${boton(onGuardar ? 'Cancelar' : 'Cerrar', 'secundario', 'data-cerrar')}
      </div>
    </form>`;
  const modal = $('#modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  const form = $('form', modal);
  $$('[data-cerrar]', form).forEach((b) => (b.onclick = cerrarModal));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('[data-guardar]', form);
    const error = $('[data-error-modal]', form);
    btn.disabled = true;
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = 'Procesando…';
    error.classList.add('hidden');
    try {
      await onGuardar(Object.fromEntries(new FormData(form)), form);
      cerrarModal();
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = textoOriginal;
    }
  };
  if (alAbrir) alAbrir(form);
  $('input:not([type=hidden]), select', form)?.focus();
}
function cerrarModal() {
  $('#modal').classList.add('hidden');
  $('#modal').classList.remove('flex');
  $('#modalCaja').innerHTML = '';
}

// Confirmación antes de una acción. Devuelve una promesa con true/false.
function confirmar({ titulo, mensaje, textoBoton = 'Aceptar', tipoBoton = 'primario' }) {
  return new Promise((resolver) => {
    let confirmado = false;
    abrirModal({
      titulo, cuerpo: `<div class="text-[13px] text-slate-700">${mensaje}</div>`, textoBoton, tipoBoton,
      onGuardar: async () => { confirmado = true; },
    });
    // Se resuelve cuando la ventana se cierra (por aceptar o por cancelar)
    const observador = new MutationObserver(() => {
      if ($('#modal').classList.contains('hidden')) { observador.disconnect(); resolver(confirmado); }
    });
    observador.observe($('#modal'), { attributes: true, attributeFilter: ['class'] });
  });
}

// Cerrar la ventana con Escape o con clic fuera de ella
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) cerrarModal(); });
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') cerrarModal(); });

// ---------- Indicador de conexión con MySQL ----------
async function revisarConexion() {
  let ok = false;
  try { ok = (await api('/api/health')).ok; } catch { ok = false; }
  $('#estadoBd').innerHTML = ok
    ? '<span class="text-green-300">●</span> Conectado a MySQL'
    : '<span class="text-red-300">●</span> <b>Sin conexión</b>';
}

// ---------- Router: #productos, #prospecto/12, ... ----------
const TITULOS = { dashboard: 'Dashboard', productos: 'Productos', prospectos: 'Prospectos', prospecto: 'Ficha del prospecto', propuestas: 'Propuestas y ventas', facturas: 'Facturas y pagos' };

async function navegar() {
  const [nombre, parametro] = (location.hash.slice(1) || 'dashboard').split('/');
  const vista = vistas[nombre] ? nombre : 'dashboard';
  const pestana = vista === 'prospecto' ? 'prospectos' : vista;
  $$('.pestana').forEach((a) => a.classList.toggle('activo', a.dataset.vista === pestana));
  document.title = `${TITULOS[vista]} · Zimbra OneView`;
  // Cada vista se dibuja en un <div> nuevo: así los eventos de la vista anterior se descartan con él
  const contenedor = document.createElement('div');
  contenedor.innerHTML = cargando();
  $('#vista').replaceChildren(contenedor);
  try {
    await vistas[vista](contenedor, parametro);
  } catch (err) {
    contenedor.innerHTML = panel('Error', estadoVacio('No se pudo cargar esta sección', esc(err.message), boton('Reintentar', 'secundario', 'onclick="navegar()"')));
  }
}
// Vuelve a dibujar la vista actual (después de guardar algo)
const recargar = () => navegar();

// Reloj de la barra de estado
const ponerHora = () => { $('#reloj').textContent = new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }); };

window.addEventListener('hashchange', navegar);
window.addEventListener('DOMContentLoaded', () => {
  ponerHora();
  setInterval(ponerHora, 30000);
  // Si se abre index.html con doble clic (file://), la página no puede hablar con el servidor
  if (location.protocol === 'file:') {
    $('#estadoBd').innerHTML = '<span class="text-red-300">●</span> <b>Sin conexión</b>';
    $('#vista').innerHTML = panel('Abriste el archivo directamente', estadoVacio('Esta página necesita el servidor',
      'Ejecuta <b>npm run dev</b> y entra por <a class="text-marca underline" href="http://localhost:3000">http://localhost:3000</a>.'));
    return;
  }
  navegar();
  revisarConexion();
  setInterval(revisarConexion, 10000); // cada 10 segundos
});
