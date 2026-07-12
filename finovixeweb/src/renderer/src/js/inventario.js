let tasaActual = 1.0, cacheProductos = [], cargando = false, productoEditando = null;

const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

const parseMontoVzla = (str) => {
    if (!str) return 0;
    let s = String(str).trim();
    if (s.includes('.') && s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    if (s.includes('.')) return parseFloat(s);
    return parseFloat(s.replace(',', '.')) || 0;
};

const formatearVisual = (input) => {
    const val = parseMontoVzla(input.value);
    input.value = val === 0 ? '' : val.toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
};

const formatearUsdInventario = (val) => val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const escapeHtml = (str) => str ? str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') : '';

const domBuscar = document.getElementById('inv-buscar');
const domRowsContainer = document.getElementById('inv-rows-container');
const domModal = document.getElementById('modal-producto');
const domModalTitulo = document.getElementById('modal-titulo');
const domModSku = document.getElementById('mod-sku');
const domModNombre = document.getElementById('mod-nombre');
const domModPcBs = document.getElementById('mod-pc-bs');
const domModPcUsd = document.getElementById('mod-pc-usd');
const domModPvBs = document.getElementById('mod-pv-bs');
const domModPvUsd = document.getElementById('mod-pv-usd');
const domModStock = document.getElementById('mod-stock');
const domModCritico = document.getElementById('mod-critico');
const domModMargenInput = document.getElementById('mod-margen-input');

const domModPorPeso = document.getElementById('mod-por-peso');
const domCamposPeso = document.getElementById('campos-peso');
const domModPkgBs = document.getElementById('mod-pkg-bs');
const domModPkgUsd = document.getElementById('mod-pkg-usd');
const domModStockKg = document.getElementById('mod-stock-kg');

async function initInventario() {
    try {
        tasaActual = parseFloat(await window.parent.electronAPI.db.obtenerConfig("tasa_usd")) || 1.0;
    } catch (e) { tasaActual = 1.0; }
    domBuscar.addEventListener('keyup', () => cargarDatosAsync(domBuscar.value));

    const campos = [
        { bs: domModPcBs, usd: domModPcUsd, tipo: 'compra' },
        { bs: domModPvBs, usd: domModPvUsd, tipo: 'venta' },
        { bs: domModPkgBs, usd: domModPkgUsd, tipo: 'peso' }
    ];

    campos.forEach(campo => {
        const actualizarDesdeBs = () => {
            const bsVal = parseMontoVzla(campo.bs.value);
            if (!isNaN(bsVal) && bsVal !== 0) campo.usd.value = (bsVal / tasaActual).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            else if (bsVal === 0 || campo.bs.value === '') campo.usd.value = '';
            if (campo.tipo !== 'peso') calcularPorcentajeDesdePrecios();
        };
        const actualizarDesdeUsd = () => {
            const usdVal = parseMontoVzla(campo.usd.value);
            if (!isNaN(usdVal) && usdVal !== 0) campo.bs.value = round2(usdVal * tasaActual).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            else if (usdVal === 0 || campo.usd.value === '') campo.bs.value = '';
            if (campo.tipo !== 'peso') calcularPorcentajeDesdePrecios();
        };
        campo.bs.addEventListener('input', actualizarDesdeBs);
        campo.usd.addEventListener('input', actualizarDesdeUsd);
        campo.bs.addEventListener('blur', () => formatearVisual(campo.bs));
        campo.usd.addEventListener('blur', () => formatearVisual(campo.usd));
    });

    domModMargenInput.addEventListener('keyup', calcularDesdePorcentaje);
    cargarDatosAsync("");
}

async function cargarDatosAsync(filtro) {
    if (cargando) return;
    cargando = true;
    try {
        const p = await window.parent.electronAPI.db.buscarProductos(filtro);
        cacheProductos = p.map(x => ({
            id: x.id || x[0],
            sku: x.sku || x[1],
            nombre: String(x.nombre || x[2]).toUpperCase(),
            p_compra_bs: parseFloat(x.p_compra_bs || x[3] || 0),
            p_compra_usd: parseFloat(x.p_compra_usd || x[4] || 0),
            p_venta_bs: parseFloat(x.p_venta_bs || x[5] || 0),
            p_venta_usd: parseFloat(x.p_venta_usd || x[6] || 0),
            stock: parseInt(x.stock || x[7] || 0),
            stock_critico: parseInt(x.stock_critico || x[8] || 5),
            es_por_peso: !!x.es_por_peso,
            precio_kg_bs: parseFloat(x.precio_kg_bs || 0),
            precio_kg_usd: parseFloat(x.precio_kg_usd || 0),
            stock_kg: parseFloat(x.stock_kg || 0)
        }));
        renderizarTabla(cacheProductos);
    } catch (e) { } finally { cargando = false; }
}

function renderizarTabla(productos) {
    if (!productos?.length) {
        domRowsContainer.innerHTML = '<p class="text-center text-slate-500 mt-10 text-[13px]">No hay productos registrados en el catálogo.</p>';
        return;
    }
    const fragment = document.createDocumentFragment();
    productos.forEach((p, index) => {
        const isCritico = p.es_por_peso
            ? (p.stock_kg <= p.stock_critico)
            : (p.stock <= p.stock_critico);

        const rawMargen = p.p_compra_usd > 0 ? (((p.p_venta_usd - p.p_compra_usd) / p.p_compra_usd) * 100) : 0;
        const margenDisplay = rawMargen.toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2});

        const card = document.createElement('div');
        card.className = `prod-card ${isCritico ? 'critico' : ''}`;
        card.style.animationDelay = `${index * 0.04}s`;

        const stockMostrar = p.es_por_peso
            ? (p.stock_kg % 1 === 0 ? p.stock_kg + ' kg' : p.stock_kg.toFixed(3) + ' kg')
            : p.stock;

        card.innerHTML = `
            <div class="prod-col-avatar"><div class="avatar-prod">${escapeHtml(p.nombre.charAt(0))}</div></div>
            <div class="prod-col-nombre">
                <span class="prod-label">Producto</span>
                <h3 class="text-[12px] font-bold text-slate-800">${escapeHtml(p.nombre)} ${p.es_por_peso ? '<span class="text-[9px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">por kg</span>' : ''}</h3>
                <p class="text-[10px] text-slate-400 truncate">${escapeHtml(p.sku)}</p>
            </div>
            <div class="prod-col-costo">
                <span class="prod-label">Costo</span>
                <p class="precio-costo">Bs ${p.p_compra_bs.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
                <p class="precio-usd">$ ${formatearUsdInventario(p.p_compra_usd)}</p>
            </div>
            <div class="prod-col-venta">
                <span class="prod-label">${p.es_por_peso ? 'Venta Kg' : 'Venta'}</span>
                ${p.es_por_peso ? `
                  <p class="precio-venta">Bs ${p.precio_kg_bs.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
                  <p class="precio-usd">$ ${formatearUsdInventario(p.precio_kg_usd)}</p>
                ` : `
                  <p class="precio-venta">Bs ${p.p_venta_bs.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
                  <p class="precio-usd">$ ${formatearUsdInventario(p.p_venta_usd)}</p>
                `}
            </div>
            <div class="prod-col-margen">
                <span class="prod-label">Margen</span>
                <span class="margen-badge">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                    ${p.es_por_peso ? '-' : margenDisplay + '%'}
                </span>
            </div>
            <div class="prod-col-stock">
                <span class="prod-label">Stock</span>
                <span class="stock-badge ${isCritico ? 'crit' : 'ok'}">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                    ${stockMostrar}
                </span>
            </div>
            <div class="prod-col-acciones">
                <button onclick='abrirModalEditar(${p.id})' class="action-btn btn-editar-inv">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    Editar
                </button>
                <button onclick="eliminarProducto(${p.id})" class="action-btn btn-eliminar-inv">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    Eliminar
                </button>
            </div>`;
        fragment.appendChild(card);
    });
    domRowsContainer.innerHTML = '';
    domRowsContainer.appendChild(fragment);
}

function toggleCamposPeso() {
    const esPeso = domModPorPeso.checked;
    domCamposPeso.classList.toggle('hidden', !esPeso);
    document.getElementById('mod-pv-bs').parentElement.parentElement.classList.toggle('hidden', esPeso);
    document.getElementById('mod-pv-usd').parentElement.parentElement.classList.toggle('hidden', esPeso);
    document.getElementById('mod-stock').parentElement.classList.toggle('hidden', esPeso);
    const criticoParent = document.getElementById('mod-critico').parentElement;
    const stockRow = document.getElementById('stock-row');
    if (esPeso) {
        // Mover stock mínimo dentro de campos-peso al final
        domCamposPeso.appendChild(criticoParent);
        criticoParent.classList.add('w-full');
        criticoParent.classList.remove('w-1/2');
    } else {
        // Regresar stock mínimo al renglón original
        stockRow.appendChild(criticoParent);
        criticoParent.classList.add('w-1/2');
        criticoParent.classList.remove('w-full');
    }
    document.getElementById('mod-margen-input').parentElement.classList.toggle('hidden', esPeso);
}
window.toggleCamposPeso = toggleCamposPeso;

async function eliminarProducto(idProd) {
    if ((await window.parent.Swal.fire({ title: '¿Eliminar?', text: "Se borrará del catálogo.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626' })).isConfirmed) {
        try {
            await window.parent.electronAPI.db.eliminarProducto(idProd);
            window.parent.Swal.fire({ icon: 'success', title: 'Eliminado', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
            cargarDatosAsync(domBuscar.value);
        } catch (e) { window.parent.Swal.fire({ icon: 'error', title: 'Error', text: e.message }); }
    }
}

function abrirModalAgregar() {
    productoEditando = null;
    domModalTitulo.textContent = "AGREGAR NUEVO PRODUCTO";
    limpiarModal();
    domModal.classList.remove('hidden');
}

function abrirModalEditar(idProd) {
    const p = cacheProductos.find(x => x.id == idProd);
    if (!p) return;
    productoEditando = p.id;
    domModalTitulo.textContent = "EDITAR PRODUCTO";
    domModSku.value = p.sku;
    domModNombre.value = p.nombre;
    domModPcBs.value = p.p_compra_bs.toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    domModPcUsd.value = formatearUsdInventario(p.p_compra_usd);
    if (p.es_por_peso) {
        domModPorPeso.checked = true;
        toggleCamposPeso();
        domModPkgBs.value = (p.precio_kg_bs || 0).toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        domModPkgUsd.value = formatearUsdInventario(p.precio_kg_usd || 0);
        let stockKgMostrar = parseFloat((p.stock_kg || 0).toFixed(3));
        domModStockKg.value = (stockKgMostrar % 1 === 0) ? stockKgMostrar : stockKgMostrar.toFixed(3);
        domModPvBs.value = '';
        domModPvUsd.value = '';
        domModStock.value = '';
    } else {
        domModPorPeso.checked = false;
        toggleCamposPeso();
        domModPvBs.value = p.p_venta_bs.toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        domModPvUsd.value = formatearUsdInventario(p.p_venta_usd);
        domModStock.value = p.stock;
    }
    domModCritico.value = p.stock_critico;
    calcularPorcentajeDesdePrecios();
    domModal.classList.remove('hidden');
}

function cerrarModal() { domModal.classList.add('hidden'); limpiarModal(); }

function limpiarModal() {
    [domModSku, domModNombre, domModPcBs, domModPcUsd, domModPvBs, domModPvUsd, domModStock, domModCritico, domModMargenInput].forEach(el => el.value = '');
    domModPorPeso.checked = false;
    domModPkgBs.value = '';
    domModPkgUsd.value = '';
    domModStockKg.value = '';
    toggleCamposPeso();
}

function calcularDesdePorcentaje() {
    const pCompra = parseMontoVzla(domModPcUsd.value);
    const margen = parseFloat(domModMargenInput.value || 0);
    if (pCompra > 0 && margen > 0) {
        const pVenta = pCompra + (pCompra * (margen / 100));
        domModPvUsd.value = pVenta.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        domModPvBs.value = (pVenta * tasaActual).toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    } else {
        if (!pCompra || !margen) { domModPvUsd.value = ''; domModPvBs.value = ''; }
    }
}

function calcularPorcentajeDesdePrecios() {
    const pCompra = parseMontoVzla(domModPcUsd.value);
    const pVenta = parseMontoVzla(domModPvUsd.value);
    if (pCompra > 0 && pVenta > 0) {
        const margen = ((pVenta - pCompra) / pCompra) * 100;
        domModMargenInput.value = margen.toFixed(2);
    } else { domModMargenInput.value = ''; }
}

async function guardarProducto() {
    try {
        const nombre = domModNombre.value.trim().toUpperCase();
        const esPorPeso = domModPorPeso.checked;
        const pVentaUsd = parseMontoVzla(domModPvUsd.value);
        if (!nombre) return window.parent.Swal.fire({ icon: 'warning', title: 'Campo Requerido', text: 'El nombre es obligatorio' });
        if (!esPorPeso && pVentaUsd <= 0) return window.parent.Swal.fire({ icon: 'warning', title: 'Precio Inválido', text: 'El precio de venta es obligatorio y debe ser mayor a 0' });
        if (esPorPeso && (!parseMontoVzla(domModPkgUsd.value) || parseMontoVzla(domModPkgUsd.value) <= 0)) return window.parent.Swal.fire({ icon: 'warning', title: 'Precio Inválido', text: 'El precio por kg en USD es obligatorio.' });
        const sku = domModSku.value.trim().toUpperCase() || `PROD-${nombre.substring(0,3).toUpperCase()}-${productoEditando || Date.now().toString().slice(-4)}`;
        const data = {
            sku, nombre,
            p_compra_bs: parseMontoVzla(domModPcBs.value),
            p_compra_usd: parseMontoVzla(domModPcUsd.value),
            p_venta_bs: esPorPeso ? 0 : parseMontoVzla(domModPvBs.value),
            p_venta_usd: esPorPeso ? 0 : parseMontoVzla(domModPvUsd.value),
            stock: esPorPeso ? 0 : parseInt(domModStock.value || 0),
            stock_critico: parseInt(domModCritico.value || 5),
            es_por_peso: esPorPeso,
            precio_kg_bs: esPorPeso ? parseMontoVzla(domModPkgBs.value) : 0,
            precio_kg_usd: esPorPeso ? parseMontoVzla(domModPkgUsd.value) : 0,
            stock_kg: esPorPeso ? parseFloat((parseFloat(domModStockKg.value) || 0).toFixed(3)) : 0
        };
        if (productoEditando) data.id = productoEditando;
        await window.parent.electronAPI.db[productoEditando ? 'editarProducto' : 'agregarProducto'](data);
        window.parent.Swal.fire({ icon: 'success', title: 'Producto guardado', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        cerrarModal();
        cargarDatosAsync(domBuscar.value);
    } catch (e) { window.parent.Swal.fire({ icon: 'error', title: 'Error', text: e.message }); }
}

Object.assign(window, {
    eliminarProducto,
    abrirModalAgregar,
    abrirModalEditar,
    cerrarModal,
    guardarProducto,
    formatearVisual
});

initInventario();