const domBuscar = document.getElementById('buscar-fiador');
const domContainer = document.getElementById('fiados-container');
const modalDetalle = document.getElementById('modal-detalle');
const detCliente = document.getElementById('det-cliente');
const detDeuda = document.getElementById('det-deuda');
const detItems = document.getElementById('det-items');
const modalAccion = document.getElementById('modal-accion');
const accionTitulo = document.getElementById('accion-titulo');
const accionContenido = document.getElementById('accion-contenido');
const btnAccionConfirmar = document.getElementById('btn-accion-confirmar');
const modalHistorialAbonos = document.getElementById('modal-historial-abonos');
const historialTitulo = document.getElementById('historial-titulo');
const tbodyHistorial = document.getElementById('tbody-historial');

let cargando = false, fiadosBD = [], tasaActual = 1.0, productosDisponibles = [], fiadoAbiertoId = null;
let fiadoAbiertoNombre = "", fiadoAbiertoMaxCantidad = 0, detalleItemAbierto = null, totalDeudaBs = 0, maxCantidadPermitidaEditar = 0;
let fiadoAbiertoPrecioUnitarioBs = 0;
let pagosMixtosFiado = [], tipoMixtoFiado = null, cobroMixtoFiadoCompletado = false;
let pendingMultipleItems = null;
let pendingMultipleTotalBs = 0;
let currentMultipleMetodo = '';
let originalConfirmarOnClick = null;
let debounceTimer = null;

let mapaProductosPeso = {};

const METODOS_PAGO = [
  { value: "Efectivo Bs", label: "💵 Efectivo Bs" },
  { value: "Pago Móvil Bs", label: "📱 Pago Móvil Bs" },
  { value: "Transferencia Bs", label: "🏦 Transferencia Bs" },
  { value: "Punto de Venta Bs", label: "💳 Punto de Venta Bs" },
  { value: "Divisas-USD", label: "💲 Efectivo USD" },
  { value: "Zelle", label: "🔵 Zelle" },
  { value: "Zinli", label: "🟢 Zinli" },
  { value: "Binance-USDT", label: "₮ USDT" },
  { value: "Binance-USDC", label: "₮ USDC" },
  { value: "Pago Mixto", label: "💳 Pago Mixto" }
];
const METODOS_EXTRANJEROS = ['Divisas-USD', 'Zelle', 'Zinli', 'Binance-USDT', 'Binance-USDC'];
const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
const round8 = (num) => Math.round((num + Number.EPSILON) * 1e8) / 1e8;

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatearNumero(valor, decimales = 2) {
    if (isNaN(valor)) return '0,00';
    const partes = valor.toFixed(decimales).split('.');
    const entero = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return entero + ',' + partes[1];
}
function parsearNumero(texto) {
    if (!texto) return 0;
    let limpio = texto.trim().replace(/\./g, '').replace(',', '.');
    let num = parseFloat(limpio);
    return isNaN(num) ? 0 : num;
}
function formatearBs(valor) {
    return formatearNumero(valor, 2) + ' Bs';
}
function formatearUsd(valor) {
    return valor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('.', ',') + ' $';
}
function formatearExactoCliente(valor) {
    if (isNaN(valor)) return '0';
    const redondeado = round2(valor);
    let str = redondeado.toString();
    let partes = str.split('.');
    let entero = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    let decimal = partes[1] || '00';
    if (decimal.length === 1) decimal += '0';
    return entero + ',' + decimal;
}
function formatearExacto(valor, simbolo = '$') {
    if (isNaN(valor)) return '0,00 ' + simbolo;
    const redondeado = round2(valor);
    let str = redondeado.toString();
    let partes = str.split('.');
    let entero = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    let decimal = partes[1] || '00';
    if (decimal.length === 1) decimal += '0';
    return entero + ',' + decimal + ' ' + simbolo;
}
function formatearMontoExtranjeroVisual(valor) {
    if (isNaN(valor)) return '0';
    const redondeado = Math.round(valor * 1e8) / 1e8;
    let str = redondeado.toFixed(8);
    str = str.replace(/\.?0+$/, '');
    if (!str.includes('.')) {
        str += '.00';
    } else {
        const partes = str.split('.');
        if (partes[1].length < 2) {
            str = partes[0] + '.' + partes[1].padEnd(2, '0');
        }
    }
    str = str.replace('.', ',');
    const partes = str.split(',');
    partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return partes.join(',');
}
function aplicarFormatoOracion(str) {
    if (!str) return '';
    let resultado = str.toLowerCase();
    resultado = resultado.charAt(0).toUpperCase() + resultado.slice(1);
    resultado = resultado.replace(/\b(bs|usd|usdt|usdc)\b/gi, match => match.toUpperCase());
    resultado = resultado.replace(/\b(bcv)\b/gi, 'BCV');
    return resultado;
}
function obtenerSimboloMoneda(metodo) {
    if (!metodo) return '?';
    const m = metodo.toLowerCase().trim();
    if (m.includes('usdt')) return 'USDT';
    if (m.includes('usdc')) return 'USDC';
    if (m.includes('zelle') || m.includes('zinli') || m.includes('divisas-usd') || m.includes('usd')) return '$';
    if (m.includes('bs') || m.includes('bolívar') || m.includes('pago móvil') || m.includes('transferencia') || m.includes('punto de venta')) return 'Bs';
    return 'Bs';
}
function scrollAlFinal(selector, delay = 50) {
    setTimeout(() => {
        const elemento = document.querySelector(selector);
        if (elemento) elemento.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, delay);
}
function generarOpcionesMetodosPago(selectedValue = "Punto de Venta Bs") {
    return METODOS_PAGO.map(m => `<option value="${m.value}" ${m.value === selectedValue ? 'selected' : ''}>${m.label}</option>`).join('');
}
function esMetodoExtranjero(metodo) {
    return METODOS_EXTRANJEROS.includes(metodo);
}
function crearInputEfectivoEntero(placeholder, callbackChange) {
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.placeholder = placeholder;
    input.className = 'w-full h-10 px-3 text-sm bg-white border border-gray-300 focus:ring-2 focus:ring-blue-500 rounded-lg';
    input.addEventListener('input', callbackChange);
    return input;
}
function crearInputDecimal(placeholder, callbackChange) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.className = 'w-full h-10 px-3 text-sm bg-white border border-gray-300 focus:ring-2 focus:ring-blue-500 rounded-lg';
    input.addEventListener('input', callbackChange);
    return input;
}

async function initFiados() {
    try {
        const valTasa = await window.parent.electronAPI.db.obtenerConfig("tasa_usd");
        tasaActual = valTasa ? parseFloat(valTasa) : 1.0;
    } catch (e) { tasaActual = 1.0; }

    try {
        const prods = await window.parent.electronAPI.db.buscarProductos("");
        mapaProductosPeso = {};
        prods.filter(p => p.es_por_peso).forEach(p => {
            mapaProductosPeso[p.nombre] = {
                precio_kg_bs: parseFloat(p.precio_kg_bs || 0),
                precio_kg_usd: parseFloat(p.precio_kg_usd || 0)
            };
        });
    } catch(e) { mapaProductosPeso = {}; }

    if (domBuscar) {
        domBuscar.addEventListener('keyup', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                cargarFiadosAsync(domBuscar.value);
            }, 250);
        });
    }

    setTimeout(() => {
        cargarFiadosAsync("");
    }, 10);
}

async function cargarFiadosAsync(filtro = "") {
    if (cargando) return;
    cargando = true;
    try {
        const fiados = await window.parent.electronAPI.db.buscarFiados(filtro);
        const fiadosIds = fiados.map(f => f.id);
        const sumasDetalles = {};
        if (fiadosIds.length) {
            const rows = await window.parent.electronAPI.db.ejecutarConsulta(
                `SELECT fiado_id, SUM(cantidad * precio_unitario) as total_bs_real
                 FROM fiados_detalle
                 WHERE cantidad > 0 AND fiado_id IN (${fiadosIds.join(',')})
                 GROUP BY fiado_id`,
                []
            );
            rows.forEach(r => { sumasDetalles[r.fiado_id] = r.total_bs_real; });
        }

        const fiadosProcesados = fiados.map(f => {
            const tasaOrig = f.tasa_momento || tasaActual;
            const totalBsReal = sumasDetalles[f.id] || 0;
            const total_usd = round2(totalBsReal / tasaOrig);
            const total_bs_actual = round2(total_usd * tasaActual);
            return {
                id: f.id,
                tasa_momento: tasaOrig,
                cliente: String(f.cliente).toUpperCase(),
                total_bs: total_bs_actual,
                total_usd: total_usd,
                fecha: f.fecha || ""
            };
        });
        fiadosBD = fiadosProcesados;
        renderizarFiados(fiadosBD);
    } catch (error) {
        console.error("Error cargando fiados:", error);
        if (domContainer) domContainer.innerHTML = `<div class="text-center text-red-500 p-4">Error al cargar los fiados. Intente de nuevo.</div>`;
    } finally { cargando = false; }
}

function renderizarFiados(fiados) {
    if (!domContainer) return;
    if (!fiados || !fiados.length) {
        domContainer.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-center p-8"><svg class="w-16 h-16 text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg><p class="text-slate-500 text-sm font-medium">No hay cuentas pendientes</p><p class="text-slate-400 text-xs mt-1">Los clientes con fiado aparecerán aquí</p></div>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    fiados.forEach((f, index) => {
        const totalBsFormat = formatearBs(f.total_bs);
        const totalUsdFormat = formatearUsd(f.total_usd);
        let fechaTxt = '';
        if (f.fecha && f.fecha.trim() !== '') {
            const partes = f.fecha.split(' ');
            const fechaSol = partes[0] || '';
            const horaSol = partes[1] || '';
            fechaTxt = `<span class="text-[10px] text-slate-400 flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg> ${escapeHtml(fechaSol)} ${escapeHtml(horaSol)}</span>`;
        } else {
            fechaTxt = `<span class="text-[10px] text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full">Sin fecha</span>`;
        }

        const card = document.createElement('div');
        card.className = "fiado-card flex flex-col sm:flex-row sm:items-center justify-between gap-4";
        card.style.animationDelay = `${index * 0.05}s`;
        card.innerHTML = `
            <div class="flex items-center gap-4">
                <div class="avatar-fiado">${escapeHtml(f.cliente.charAt(0))}</div>
                <div>
                    <h3 class="text-[15px] font-bold text-slate-800">${escapeHtml(f.cliente)}</h3>
                    <div class="flex flex-wrap items-center gap-2 mt-1">
                        <span class="badge-pendiente text-[10px]"><span class="w-1.5 h-1.5 bg-amber-500 inline-block rounded-full"></span> Pendiente</span>
                        ${fechaTxt}
                    </div>
                </div>
            </div>
            <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                <div class="text-left sm:text-right">
                    <p class="text-lg font-black text-red-600">${totalBsFormat}</p>
                    <p class="text-sm font-medium text-slate-500">${totalUsdFormat}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="enviarCobroWhatsApp(${f.id}, '${escapeHtml(f.cliente).replace(/'/g, "\\'")}', '${totalBsFormat}', '${totalUsdFormat}')" class="btn-whatsapp">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                        WhatsApp
                    </button>
                    <button onclick="abrirModalDetalle(${f.id}, '${escapeHtml(f.cliente).replace(/'/g, "\\'")}')" class="btn-gestionar">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        Gestionar
                    </button>
                </div>
            </div>`;
        fragment.appendChild(card);
    });
    domContainer.innerHTML = '';
    domContainer.appendChild(fragment);
}

async function enviarCobroWhatsApp(fiadoId, clienteNombre, montoBs, montoUsd) {
    try {
        const clientesDB = await window.parent.electronAPI.db.buscarClientes(clienteNombre);
        const clienteData = clientesDB.find(c => c.nombre.toUpperCase() === clienteNombre.toUpperCase());
        if (!clienteData || !clienteData.telefono || clienteData.telefono === 'S/D') 
            return window.parent.Swal.fire({ icon: 'warning', title: 'Sin Teléfono', text: `El cliente ${clienteNombre} no tiene número registrado.`, confirmButtonColor: '#f59e0b' });
        let tel = clienteData.telefono.replace(/\D/g, '');
        tel = tel.startsWith('0') && tel.length === 11 ? '58' + tel.substring(1) : (tel.length === 10 ? '58' + tel : tel);
        const items = await window.parent.electronAPI.db.getDetalleFiado(fiadoId);
        const itemsPendientes = items ? items.filter(it => it.cantidad > 0) : [];
        let listaProductos = itemsPendientes.length > 0 ? "\n\n*Detalle de su cuenta:*\n" + itemsPendientes.map(it => `• ${it.cantidad}x ${it.nombre_prod}\n`).join('') : "";
        await window.parent.electronAPI.utils.openExternalLink(`https://wa.me/${tel}?text=${encodeURIComponent(`Hola *${clienteNombre}*, este es un recordatorio de su cuenta pendiente por un total de *${montoBs}*.${listaProductos}\nPor favor, contáctenos cuando pueda para gestionar su pago. ¡Muchas gracias!`)}`);
    } catch (error) {}
}

async function abrirModalDetalle(id, cliente) {
    fiadoAbiertoId = id; fiadoAbiertoNombre = cliente;
    try {
        const fiados = await window.parent.electronAPI.db.buscarFiados("");
        const fiadoActual = fiados.find(f => f.id == id);
        if (fiadoActual) {
            const tasaOrig = fiadoActual.tasa_momento || tasaActual;
            const total_usd = round2(parseFloat(fiadoActual.total_bs) / tasaOrig);
            totalDeudaBs = round2(total_usd * tasaActual);
        }
    } catch(e) {}
    detCliente.innerHTML = escapeHtml(cliente);
    modalDetalle.classList.remove('hidden');
    await refrescarContenidoDetalle();
}

function cerrarModalDetalle() {
    modalDetalle.classList.add('hidden'); fiadoAbiertoId = null; cargarFiadosAsync(domBuscar.value);
}

async function refrescarContenidoDetalle() {
    if (!fiadoAbiertoId) return;
    detItems.innerHTML = '<p class="text-center text-slate-500 mt-4 text-xs">Cargando detalles...</p>';
    try {
        const items = await window.parent.electronAPI.db.getDetalleFiado(fiadoAbiertoId);
        const fiadoInfo = fiadosBD.find(f => f.id === fiadoAbiertoId);
        const tasaOriginal = fiadoInfo ? fiadoInfo.tasa_momento : tasaActual;
        let totalUsdAcumulado = 0;
        const itemsPendientes = items.filter(it => it.cantidad > 0);
        detItems.innerHTML = !itemsPendientes.length ? '<p class="text-center text-slate-500 mt-4 text-xs">No hay productos pendientes.</p>' : '';
        for (const it of itemsPendientes) {
            const esCargo = it.nombre_prod.toUpperCase().includes('CARGO ADICIONAL');
            let precioUnitarioUsd = 0;
            if (!esCargo) {
                precioUnitarioUsd = round2(it.precio_unitario / tasaOriginal);
            }
            const totalUsdItem = round2(it.cantidad * precioUnitarioUsd);
            const totalBsHoy = round2(totalUsdItem * tasaActual);
            totalUsdAcumulado += totalUsdItem;

            let cantidadVisual = `x${it.cantidad}`;
            if (!esCargo && it.producto_id) {
                const prod = await window.parent.electronAPI.db.ejecutarConsulta(
                    "SELECT es_por_peso FROM productos WHERE id = ?", [it.producto_id]
                );
                if (prod && prod.length > 0 && prod[0].es_por_peso) {
                    const peso = it.cantidad;
                    cantidadVisual = (peso % 1 === 0) ? peso + ' kg' : peso.toFixed(3) + ' kg';
                }
            }

            const botonesHTML = esCargo
                ? `<button onclick="eliminarCargo(${it.id})" class="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold uppercase rounded-lg">✕ QUITAR</button>`
                : '';

            detItems.innerHTML += `<div class="bg-white border border-slate-200 p-3 flex items-center shadow-sm mb-2 gap-3 rounded-xl"><div class="flex-1"><p class="text-[12px] font-bold text-zinc-800">${escapeHtml(it.nombre_prod)}</p><span class="bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[10px] font-bold rounded-lg">${cantidadVisual}</span></div><div class="text-right shrink-0 px-3"><p class="text-[12px] font-bold text-zinc-900">${formatearBs(totalBsHoy)}</p><p class="text-[10px] text-slate-400">${formatearUsd(totalUsdItem)}</p></div><div class="flex gap-1.5 shrink-0">${botonesHTML}</div></div>`;
        }
        totalDeudaBs = round2(totalUsdAcumulado * tasaActual);
        detDeuda.innerHTML = `<span class="text-xs font-bold text-red-600 uppercase">DEUDA: ${formatearBs(totalDeudaBs)}</span><span class="text-xs font-bold text-slate-500">(${formatearUsd(totalUsdAcumulado)})</span>`;
    } catch (error) {
        detItems.innerHTML = `<p class="text-center text-red-500 mt-4 text-xs">Error: ${escapeHtml(error.message)}</p>`;
    }
}

async function abrirModalHistorialAbonos() {
    if (!fiadoAbiertoId) return;
    try {
        const abonos = await window.parent.electronAPI.db.getAbonosFiado(fiadoAbiertoId);
        historialTitulo.innerHTML = `Historial completo de abonos – ${escapeHtml(fiadoAbiertoNombre)}`;
        tbodyHistorial.innerHTML = '';
        if (!abonos || !abonos.length) {
            tbodyHistorial.innerHTML = `<tr><td colspan="7" class="text-center text-slate-400 py-8">No hay abonos registrados</td></tr>`;
        } else {
            abonos.forEach(ab => {
                const montoBsPagado = round2(parseFloat(ab.monto || 0));
                const montoUsdOriginal = round8(parseFloat(ab.monto_usd || 0));
                const montoRecibido = ab.monto_recibido ? parseFloat(ab.monto_recibido) : null;
                const montoEsperadoBs = ab.monto_esperado_bs ? round2(parseFloat(ab.monto_esperado_bs)) : montoBsPagado;
                const montoEsperadoUsd = ab.monto_esperado_usd ? round8(parseFloat(ab.monto_esperado_usd)) : montoUsdOriginal;
                let fechaAbono = '', horaAbono = '';
                if (ab.fecha) { const partesF = ab.fecha.split(' '); fechaAbono = partesF[0] || ''; horaAbono = partesF[1] || ''; }

                let metodoRaw = ab.metodo ? ab.metodo.replace('Abono Fiado: ', '').replace('Cobro Fiado: ', '').replace('Pago Fiado: ', '') : 'Abono';
                const esMixto = metodoRaw.toUpperCase().includes('MIXTO');
                let productosCol = ab.descripcion || (esMixto ? 'Pago Mixto' : 'Abono');

                if (productosCol && productosCol !== 'Abono/Cargo General' && productosCol !== 'Pago Mixto') {
                    const items = productosCol.split(', ');
                    const formattedItems = items.map(item => {
                        const match = item.match(/^(.*?) \(x([\d.]+)\)$/);
                        if (match) {
                            const nombre = match[1].trim();
                            const cantidad = parseFloat(match[2]);
                            if (mapaProductosPeso[nombre]) {
                                let cantidadStr;
                                if (cantidad % 1 === 0) {
                                    cantidadStr = cantidad.toString();
                                } else {
                                    cantidadStr = cantidad.toFixed(3).replace(/\.?0+$/, '');
                                }
                                return `${nombre} (x${cantidadStr} kg)`;
                            } else {
                                const cantidadStr = (cantidad % 1 === 0) ? Math.floor(cantidad).toString() : cantidad.toString();
                                return `${nombre} (x${cantidadStr})`;
                            }
                        }
                        return item;
                    });
                    productosCol = formattedItems.join(', ');
                }
                if (productosCol.length > 60) productosCol = productosCol.substring(0, 57) + '...';

                let metodoCol = aplicarFormatoOracion(metodoRaw);
                if (esMixto && metodoRaw.includes('|')) {
                    const partes = metodoRaw.split('|');
                    const cabecera = partes[0].replace('Mixto:', '').trim();
                    metodoCol = 'Mixto: ' + cabecera.split('+').map(m => aplicarFormatoOracion(m.trim())).join(' + ');
                } else if (esMixto) {
                    metodoCol = metodoCol.replace('Mixto: ', '');
                }

                let totalBsPagadoReal = montoBsPagado;
                if (esMixto && metodoRaw.includes('|')) {
                    totalBsPagadoReal = 0;
                    const partes = metodoRaw.split('|');
                    const desglose = partes.slice(1);
                    desglose.forEach(item => {
                        const match = item.match(/^([^:]+):([^~]+)(?:~(.+))?$/);
                        if (match) {
                            const metodoItem = match[1].trim();
                            const montoStr = match[2].trim();
                            const tasaStr = match[3] ? match[3].trim() : null;
                            const montoNum = parseFloat(montoStr); 
                            if (!isNaN(montoNum)) {
                                if (esMetodoExtranjero(metodoItem)) {
                                    const tasa = tasaStr ? parseFloat(tasaStr) : tasaActual;
                                    if (!isNaN(tasa)) totalBsPagadoReal += round2(montoNum * tasa);
                                } else {
                                    totalBsPagadoReal += round2(montoNum);
                                }
                            }
                        }
                    });
                }

                let recibidoCol = '';
                if (esMixto && metodoRaw.includes('|')) {
                    let partesRecibido = [];
                    const desglose = metodoRaw.split('|').slice(1);
                    desglose.forEach(item => {
                        const match = item.match(/^([^:]+):([^~]+)(?:~(.+))?$/);
                        if (match) {
                            const metodoItem = match[1].trim();
                            const montoStr = match[2].trim();
                            const montoNum = parseFloat(montoStr);
                            if (!isNaN(montoNum)) {
                                const simbolo = obtenerSimboloMoneda(metodoItem);
                                partesRecibido.push(`${simbolo} ${formatearMontoExtranjeroVisual(montoNum)}`);
                            }
                        }
                    });
                    recibidoCol = partesRecibido.join('<br>');
                } else if (esMixto) {
                    recibidoCol = 'Mixto';
                } else {
                    if (montoRecibido !== null && montoRecibido > 0) {
                        const simbolo = obtenerSimboloMoneda(metodoRaw);
                        recibidoCol = `${simbolo} ${formatearMontoExtranjeroVisual(montoRecibido)}`;
                    } else {
                        const simbolo = obtenerSimboloMoneda(metodoRaw);
                        if (esMetodoExtranjero(metodoRaw)) {
                            recibidoCol = `${simbolo} ${formatearMontoExtranjeroVisual(montoUsdOriginal)}`;
                        } else {
                            recibidoCol = `${simbolo} ${formatearBs(montoBsPagado)}`;
                        }
                    }
                }

                let esperadoCol;
                if (esMetodoExtranjero(metodoRaw)) {
                    const simbolo = obtenerSimboloMoneda(metodoRaw);
                    esperadoCol = `${simbolo} ${formatearMontoExtranjeroVisual(montoEsperadoUsd)}`;
                } else {
                    esperadoCol = `Bs ${formatearBs(montoEsperadoBs)}`;
                }

                const tasaMomento = parseFloat(ab.tasa_momento || 0);
                const tasaMostrar = tasaMomento > 0 ? tasaMomento : tasaActual;
                const tasaCol = `Tasa BCV: ${formatearNumero(tasaMostrar, 2)} Bs`;

                let vueltoCol = '';
                const vuelto = round2(parseFloat(ab.vuelto || 0));
                const vueltoEntregado = ab.vuelto_entregado === 1;
                const vueltoMetodo = ab.vuelto_metodo || '';
                const diferencia = round2(totalBsPagadoReal - montoEsperadoBs);
                let colorVuelto = '#6b7280';

                if (vueltoEntregado && vuelto > 0) {
                    const esVueltoExt = esMetodoExtranjero(vueltoMetodo || metodoRaw);
                    const simboloVuelto = obtenerSimboloMoneda(vueltoMetodo || metodoRaw);
                    const tasaVuelto = (parseFloat(ab.tasa_momento) > 0) ? parseFloat(ab.tasa_momento) : tasaActual;
                    if (esVueltoExt) {
                        const vueltoForeign = round8(vuelto / tasaVuelto);
                        vueltoCol = `Sí – ${simboloVuelto} ${formatearMontoExtranjeroVisual(vueltoForeign)} (${aplicarFormatoOracion(vueltoMetodo || 'Método')}) ≈ Bs ${formatearBs(vuelto)}`;
                    } else {
                        vueltoCol = `Sí – Bs ${formatearBs(vuelto)} (${aplicarFormatoOracion(vueltoMetodo || 'Método')}) ≈ $ ${formatearMontoExtranjeroVisual(round8(vuelto / tasaVuelto))}`;
                    }
                    colorVuelto = '#3b82f6';
                } else if (diferencia < -0.005) {
                    colorVuelto = '#ef4444';
                    vueltoCol = `Falta: ${formatearNumero(Math.abs(diferencia), 2)} Bs`;
                } else if (diferencia > 0.005) {
                    colorVuelto = '#3b82f6';
                    vueltoCol = `Sobra (no entregado): ${formatearNumero(diferencia, 2)} Bs`;
                } else {
                    colorVuelto = '#10b981';
                    vueltoCol = 'Exacto';
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(fechaAbono)} ${escapeHtml(horaAbono)}</td>
                    <td><span class="font-semibold">${escapeHtml(metodoCol)}</span></td>
                    <td>${escapeHtml(productosCol)}</td>
                    <td>${recibidoCol}</td>
                    <td>${esperadoCol}</td>
                    <td style="font-size:11px;">${escapeHtml(tasaCol)}</td>
                    <td style="font-size:11px; color: ${colorVuelto}; font-weight: bold;">${vueltoCol}</td>
                `;
                tbodyHistorial.appendChild(tr);
            });
        }
        modalHistorialAbonos.classList.remove('hidden');
    } catch (error) {
        window.parent.Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo cargar el historial.' });
    }
}

function cerrarModalHistorialAbonos() { modalHistorialAbonos.classList.add('hidden'); }

async function aplicarPorcentaje() {
    const pct = parseFloat(document.getElementById('det-porcentaje').value);
    if (isNaN(pct) || pct <= 0) return window.parent.Swal.fire({ icon: 'warning', title: 'Atención', text: 'Ingrese un porcentaje válido mayor a 0.' });
    const totalUsd = round2(totalDeudaBs / tasaActual);
    const montoRecargoUsd = round2(totalUsd * (pct / 100));
    const montoRecargoBs = round2(montoRecargoUsd * tasaActual);
    if ((await window.parent.Swal.fire({ title: 'Confirmar Recargo', html: `¿Aplicar <b>${pct}%</b> (${formatearBs(montoRecargoBs)} / ${formatearUsd(montoRecargoUsd)}) como cargo adicional?`, icon: 'question', showCancelButton: true, confirmButtonText: 'Sí, aplicar', cancelButtonText: 'Cancelar' })).isConfirmed) {
        try {
            await window.parent.electronAPI.db.agregarCargoAdicionalFiado(fiadoAbiertoId, montoRecargoBs, `CARGO ADICIONAL ${pct}%`);
            window.parent.Swal.fire({ icon: 'success', title: 'Recargo Aplicado', toast: true, position: 'top-end', timer: 3000 });
            document.getElementById('det-porcentaje').value = '';
            await refrescarContenidoDetalle();
        } catch (e) { window.parent.Swal.fire({ icon: 'error', title: 'Error', text: e.message }); }
    }
}

async function editarCantidadItem(detalleId, nombreProd, cantidadActual) {
    detalleItemAbierto = detalleId;
    accionTitulo.textContent = "EDITAR CANTIDAD";
    accionContenido.innerHTML = `<p class="text-[12px] text-slate-600 mb-2">Producto: <b>${escapeHtml(nombreProd)}</b></p><div id="stock-info" class="text-[10px] text-slate-500 mb-2">Consultando inventario...</div><label class="text-[11px] font-bold text-slate-500">NUEVA CANTIDAD TOTAL</label><input type="number" id="acc-nueva-cant" min="1" value="${cantidadActual}" class="w-full h-10 px-3 text-sm bg-white border border-gray-300 focus:ring-2 focus:ring-blue-500 rounded-lg">`;
    btnAccionConfirmar.style.display = 'block';
    btnAccionConfirmar.textContent = "ACTUALIZAR";
    btnAccionConfirmar.onclick = ejecutarEditarCantidad;
    btnAccionConfirmar.disabled = false;
    modalAccion.classList.remove('hidden');

    let stockDisponible = 0;
    try {
        const prods = await window.parent.electronAPI.db.buscarProductos(nombreProd);
        const prodExacto = prods.find(p => p.nombre === nombreProd);
        stockDisponible = prodExacto ? prodExacto.stock : 0;
    } catch (e) { stockDisponible = 0; }

    const maxCantidad = cantidadActual + stockDisponible;
    const stockInfo = document.getElementById('stock-info');
    if (stockDisponible === 0) {
        stockInfo.innerHTML = `<span class="text-red-500 font-bold">⚠️ Sin stock adicional</span> · Máximo permitido: ${maxCantidad} (solo la cantidad actual)`;
    } else {
        stockInfo.innerHTML = `Stock disponible: ${stockDisponible} · Máximo permitido: ${maxCantidad}`;
    }

    const inputCant = document.getElementById('acc-nueva-cant');
    inputCant.max = maxCantidad;
    inputCant.value = Math.min(cantidadActual, maxCantidad);
    maxCantidadPermitidaEditar = maxCantidad;
}

async function ejecutarEditarCantidad() {
    const nuevaCant = parseInt(document.getElementById('acc-nueva-cant').value);
    if (isNaN(nuevaCant) || nuevaCant <= 0) return;
    if (nuevaCant > maxCantidadPermitidaEditar) {
        return window.parent.Swal.fire({ icon: 'warning', title: 'Sin inventario suficiente', text: `No puedes superar el máximo permitido de ${maxCantidadPermitidaEditar} unidades.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
    }
    try {
        await window.parent.electronAPI.db.actualizarCantidadFiado(detalleItemAbierto, fiadoAbiertoId, nuevaCant);
        window.parent.Swal.fire({ icon: 'success', title: 'Cantidad Actualizada', toast: true, position: 'top-end', timer: 2000 });
        cerrarModalAccion();
        await refrescarContenidoDetalle();
    } catch (e) { window.parent.Swal.fire({ icon: 'error', title: 'Error', text: e.message }); }
}

function cerrarModalAccion() {
    modalAccion.classList.add('hidden');
    if (originalConfirmarOnClick) {
        btnAccionConfirmar.onclick = originalConfirmarOnClick;
        originalConfirmarOnClick = null;
    }
    btnAccionConfirmar.disabled = false;
    btnAccionConfirmar.title = "";
    btnAccionConfirmar.style.background = '#001f3f';
    btnAccionConfirmar.style.color = 'white';
    btnAccionConfirmar.style.cursor = 'pointer';
}

async function registrarGastoVuelto(monto, metodo) {
    if (!monto || monto <= 0) return;
    const montoRedondeado = round2(monto);
    const descripcion = `Vuelto entregado en abono – ${fiadoAbiertoNombre}`;
    const esExt = esMetodoExtranjero(metodo);
    const montoUsd = esExt ? (montoRedondeado / tasaActual) : 0;
    await window.parent.electronAPI.db.registrarGasto(descripcion, montoRedondeado, montoUsd, metodo);
}

async function obtenerTasasActuales() {
    const tasaActualFresh = parseFloat(await window.parent.electronAPI.db.obtenerConfig("tasa_usd")) || 1.0;
    const fiadosRaw = await window.parent.electronAPI.db.ejecutarConsulta("SELECT tasa_momento FROM fiados WHERE id = ?", [fiadoAbiertoId]);
    const tasaOrig = (fiadosRaw.length > 0 && fiadosRaw[0].tasa_momento && parseFloat(fiadosRaw[0].tasa_momento) > 0) ? parseFloat(fiadosRaw[0].tasa_momento) : tasaActualFresh;
    return { tasaActual: tasaActualFresh, tasaOrig };
}

async function abrirModalPagoMultiple() {
    if (!fiadoAbiertoId) return;
    try {
        const { tasaActual: tasaFresh, tasaOrig } = await obtenerTasasActuales();
        tasaActual = tasaFresh;

        const items = await window.parent.electronAPI.db.getDetalleFiado(fiadoAbiertoId);
        const pendientes = items.filter(it => it.cantidad > 0);
        if (pendientes.length === 0) {
            window.parent.Swal.fire({ icon: 'info', title: 'Sin productos', text: 'No hay productos pendientes para abonar.' });
            return;
        }

        originalConfirmarOnClick = btnAccionConfirmar.onclick;
        accionContenido.innerHTML = '';
        accionTitulo.textContent = "ABONAR";

        const confirmedQuantities = {};

        const divLista = document.createElement('div');
        divLista.className = "space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar";
        divLista.innerHTML = `<p class="text-xs font-bold text-slate-500 uppercase">Seleccione productos y confirme la cantidad a abonar:</p>`;

        for (const it of pendientes) {
            let precioUSD = 0;
            let esPorPeso = false;
            if (!it.nombre_prod.toUpperCase().includes('CARGO ADICIONAL')) {
                precioUSD = round2(it.precio_unitario / tasaOrig);
                if (it.producto_id) {
                    const prod = await window.parent.electronAPI.db.ejecutarConsulta("SELECT es_por_peso FROM productos WHERE id = ?", [it.producto_id]);
                    if (prod && prod.length > 0) esPorPeso = !!prod[0].es_por_peso;
                }
            } else {
                precioUSD = it.precio_unitario / tasaOrig;
            }

            const itemDiv = document.createElement('div');
            itemDiv.className = "border border-slate-200 p-3 bg-white rounded-lg";
            const botonConfirmarHTML = esPorPeso ? '' : `<button class="btn-confirmar-item px-2 py-1 bg-gray-100 text-gray-500 text-[10px] font-bold rounded-lg border border-gray-300 cursor-pointer" data-id="${it.id}">Confirmar</button>`;
            itemDiv.innerHTML = `
                <div class="flex items-center gap-3">
                    <input type="checkbox" class="prod-checkbox" data-id="${it.id}" data-max="${it.cantidad}" data-precio="${it.precio_unitario}" data-precio-usd="${precioUSD}" data-es-peso="${esPorPeso ? '1' : '0'}">
                    <div class="flex-1">
                        <p class="text-sm font-bold text-zinc-800">${escapeHtml(it.nombre_prod)}</p>
                        <p class="text-[10px] text-slate-500">Pendiente: ${it.cantidad} unidades | Precio unitario: ${formatearBs(round2(precioUSD * tasaActual))}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <input type="number" class="prod-cantidad w-24 h-8 px-2 text-xs bg-white border border-gray-300 rounded-lg" placeholder="Cantidad" value="${it.cantidad}" min="1" max="${it.cantidad}" disabled>
                        ${botonConfirmarHTML}
                    </div>
                </div>
            `;
            divLista.appendChild(itemDiv);
        }
        accionContenido.appendChild(divLista);

        const metodoSelect = document.createElement('select');
        metodoSelect.id = 'multiple-metodo';
        metodoSelect.className = 'w-full h-9 px-2 text-xs bg-white border border-gray-300 mt-4 rounded-lg';
        metodoSelect.innerHTML = generarOpcionesMetodosPago("Punto de Venta Bs");
        accionContenido.appendChild(metodoSelect);

        const montoContainer = document.createElement('div');
        montoContainer.id = 'multiple-monto-container';
        accionContenido.appendChild(montoContainer);

        const estadoPago = document.createElement('div');
        estadoPago.id = 'multiple-estado-pago';
        estadoPago.className = 'text-[10px] font-bold hidden mt-2';
        accionContenido.appendChild(estadoPago);

        const vueltoContainer = document.createElement('div');
        vueltoContainer.id = 'multiple-vuelto-container';
        vueltoContainer.className = 'mt-2 hidden';
        vueltoContainer.innerHTML = `
            <label class="flex items-center gap-2 text-xs">
                <input type="checkbox" id="multiple-vuelto-check" class="form-checkbox h-4 w-4">
                <span>¿Dar vuelto?</span>
            </label>
            <select id="multiple-vuelto-metodo" class="w-full h-9 px-2 text-xs bg-white border border-gray-300 mt-2 hidden rounded-lg">
                ${generarOpcionesMetodosPago("Punto de Venta Bs")}
            </select>
        `;
        accionContenido.appendChild(vueltoContainer);

        btnAccionConfirmar.disabled = true;
        btnAccionConfirmar.title = "Confirme al menos un producto";
        btnAccionConfirmar.style.background = '#d1d5db';
        btnAccionConfirmar.style.color = '#6b7280';
        btnAccionConfirmar.style.cursor = 'not-allowed';
        btnAccionConfirmar.textContent = "REGISTRAR ABONO";
        btnAccionConfirmar.onclick = confirmarPagoMultiple;

        modalAccion.classList.remove('hidden');

        const checkboxes = accionContenido.querySelectorAll('.prod-checkbox');
        const cantidadInputs = accionContenido.querySelectorAll('.prod-cantidad');
        const confirmButtons = accionContenido.querySelectorAll('.btn-confirmar-item');
        const vueltoCheck = document.getElementById('multiple-vuelto-check');
        const vueltoMetodoSelect = document.getElementById('multiple-vuelto-metodo');

        vueltoCheck.addEventListener('change', () => {
            vueltoMetodoSelect.classList.toggle('hidden', !vueltoCheck.checked);
        });

        function actualizarBotonConfirmar(btn, confirmado) {
            if (confirmado) {
                btn.textContent = 'Editar';
                btn.classList.remove('bg-gray-100', 'text-gray-500');
                btn.classList.add('bg-green-100', 'text-green-700');
            } else {
                btn.textContent = 'Confirmar';
                btn.classList.remove('bg-green-100', 'text-green-700');
                btn.classList.add('bg-gray-100', 'text-gray-500');
            }
        }

        checkboxes.forEach((cb, idx) => {
            const id = cb.dataset.id;
            const esPeso = cb.dataset.esPeso === '1';
            const inputCantidad = cantidadInputs[idx];

            cb.addEventListener('change', () => {
                if (cb.checked) {
                    if (esPeso) {
                        const cantidad = parseFloat(inputCantidad.max);
                        confirmedQuantities[id] = cantidad;
                        inputCantidad.value = cantidad;
                        inputCantidad.disabled = true;
                    } else {
                        inputCantidad.disabled = false;
                    }
                } else {
                    delete confirmedQuantities[id];
                    inputCantidad.disabled = true;
                    inputCantidad.value = inputCantidad.max;
                    if (!esPeso) {
                        const btn = accionContenido.querySelector(`.btn-confirmar-item[data-id="${id}"]`);
                        if (btn) actualizarBotonConfirmar(btn, false);
                    }
                }
                actualizarTotalMultiple();
            });
        });

        confirmButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const checkbox = accionContenido.querySelector(`.prod-checkbox[data-id="${id}"]`);
                if (!checkbox || !checkbox.checked) return;
                const idx = Array.from(checkboxes).indexOf(checkbox);
                const inputCantidad = cantidadInputs[idx];
                if (confirmedQuantities[id]) {
                    delete confirmedQuantities[id];
                    inputCantidad.disabled = false;
                    actualizarBotonConfirmar(btn, false);
                } else {
                    const cantidad = parseFloat(inputCantidad.value);
                    const max = parseFloat(checkbox.dataset.max);
                    if (isNaN(cantidad) || cantidad <= 0 || cantidad > max) {
                        window.parent.Swal.fire({ icon: 'warning', title: 'Cantidad inválida', text: 'Ingrese una cantidad válida.', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
                        return;
                    }
                    confirmedQuantities[id] = cantidad;
                    inputCantidad.disabled = true;
                    actualizarBotonConfirmar(btn, true);
                }
                actualizarTotalMultiple();
            });
        });

        async function actualizarTotalMultiple() {
            const metodo = metodoSelect.value;
            const esExt = METODOS_EXTRANJEROS.includes(metodo);
            let totalBs = 0;
            currentMultipleItems = [];
            checkboxes.forEach((cb, idx) => {
                if (cb.checked) {
                    const id = cb.dataset.id;
                    if (confirmedQuantities[id]) {
                        const cantidad = confirmedQuantities[id];
                        const precioUSD = parseFloat(cb.dataset.precioUsd);
                        const subtotalUsd = round2(cantidad * precioUSD);
                        const subtotalBs = round2(subtotalUsd * tasaActual);
                        totalBs += subtotalBs;
                        const precioUnitarioBs = round2(subtotalBs / cantidad);
                        currentMultipleItems.push({
                            detalle_id: parseInt(id),
                            cantidad: cantidad,
                            precio_unitario_bs: precioUnitarioBs
                        });
                    }
                }
            });
            currentMultipleTotalBs = totalBs;
            currentMultipleMetodo = metodo;

            if (currentMultipleItems.length === 0) {
                montoContainer.innerHTML = '<p class="text-red-500 text-xs">Confirme al menos un producto.</p>';
                btnAccionConfirmar.disabled = true;
                btnAccionConfirmar.title = "Confirme al menos un producto";
                btnAccionConfirmar.style.background = '#d1d5db';
                btnAccionConfirmar.style.color = '#6b7280';
                btnAccionConfirmar.style.cursor = 'not-allowed';
                estadoPago.classList.add('hidden');
                vueltoContainer.classList.add('hidden');
                return;
            }

            const totalExacto = round2(esExt ? totalBs / tasaActual : totalBs);
            const simbolo = esExt ? '$' : 'Bs';
            let montoHTML = `
                <div class="bg-slate-100 p-3 text-center mt-3 rounded-lg">
                    <p class="text-[10px] font-bold text-slate-500 uppercase">Total a pagar</p>
                    <p class="text-base font-black text-zinc-900">${esExt ? formatearExacto(totalExacto, simbolo) : formatearBs(totalBs)}</p>
                </div>
            `;
            montoContainer.innerHTML = montoHTML;

            let valorPrellenado = '';
            if (metodo === 'Efectivo Bs' || metodo === 'Divisas-USD') {
                valorPrellenado = esExt ? formatearExactoCliente(totalExacto) : totalBs.toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            } else {
                valorPrellenado = esExt ? formatearExactoCliente(totalExacto) : totalBs.toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            }
            const montoRecibidoDiv = document.createElement('div');
            montoRecibidoDiv.innerHTML = `
                <label class="text-[10px] font-bold text-slate-500 uppercase block mb-1">Monto recibido</label>
                <div class="flex gap-2 items-center">
                    <input type="text" id="multiple-monto-recibido" class="flex-1 h-9 px-2 text-xs bg-gray-100 border border-gray-300 focus:ring-2 focus:ring-blue-500 rounded-lg" value="${valorPrellenado}" disabled>
                    <button id="btn-editar-monto-multiple" class="h-9 px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-[10px] rounded-lg border border-gray-300 transition-colors">Editar</button>
                </div>
            `;
            montoContainer.appendChild(montoRecibidoDiv);

            const inputMonto = document.getElementById('multiple-monto-recibido');
            const btnEditar = document.getElementById('btn-editar-monto-multiple');

            if (inputMonto) {
                inputMonto.addEventListener('blur', actualizarEstadoPagoMultiple);
                inputMonto.addEventListener('input', actualizarEstadoPagoMultiple);
            }

            if (btnEditar) {
                btnEditar.addEventListener('click', () => {
                    if (!inputMonto) return;
                    const estaDeshabilitado = inputMonto.disabled;
                    if (estaDeshabilitado) {
                        inputMonto.disabled = false;
                        inputMonto.classList.remove('bg-gray-100');
                        inputMonto.classList.add('bg-white');
                        inputMonto.focus();
                        btnEditar.textContent = 'Guardar';
                    } else {
                        inputMonto.disabled = true;
                        inputMonto.classList.add('bg-gray-100');
                        inputMonto.classList.remove('bg-white');
                        btnEditar.textContent = 'Editar';
                        actualizarEstadoPagoMultiple();
                    }
                });
            }

            const tieneDecimalesTotal = (metodo === 'Efectivo Bs' && !Number.isInteger(totalBs)) || (metodo === 'Divisas-USD' && !Number.isInteger(totalExacto));
            if (tieneDecimalesTotal) {
                const warning = document.createElement('div');
                warning.className = 'bg-amber-50 border border-amber-200 p-3 text-center mt-2 rounded-lg';
                warning.innerHTML = '<p class="text-[10px] font-bold text-amber-700 uppercase mb-1">⚠️ Monto con decimales</p><p class="text-[9px] text-amber-600">Este monto contiene decimales. Lo recomendable es utilizar <strong>Pago Mixto</strong>.</p>';
                montoContainer.appendChild(warning);
            }

            actualizarEstadoPagoMultiple();
        }

        async function actualizarEstadoPagoMultiple() {
            const input = document.getElementById('multiple-monto-recibido');
            if (!input) return;
            const metodo = currentMultipleMetodo;
            const totalBs = currentMultipleTotalBs;
            const esExt = METODOS_EXTRANJEROS.includes(metodo);
            const montoRecibido = parsearNumero(input.value);
            const estadoDiv = document.getElementById('multiple-estado-pago');
            if (montoRecibido <= 0) {
                estadoDiv.classList.add('hidden');
                vueltoContainer.classList.add('hidden');
                btnAccionConfirmar.disabled = true;
                btnAccionConfirmar.title = "El monto está incompleto";
                btnAccionConfirmar.style.background = '#d1d5db';
                btnAccionConfirmar.style.color = '#6b7280';
                btnAccionConfirmar.style.cursor = 'not-allowed';
                return;
            }
            const totalEsperado = round2(esExt ? totalBs / tasaActual : totalBs);
            const diferencia = round2(montoRecibido - totalEsperado);
            if (Math.abs(diferencia) <= 0.005) {
                estadoDiv.className = 'text-[10px] font-bold estado-exacto mt-2';
                estadoDiv.textContent = 'Pago exacto';
                estadoDiv.classList.remove('hidden');
                vueltoContainer.classList.add('hidden');
                btnAccionConfirmar.disabled = false;
                btnAccionConfirmar.title = "";
                btnAccionConfirmar.style.background = '#001f3f';
                btnAccionConfirmar.style.color = 'white';
                btnAccionConfirmar.style.cursor = 'pointer';
            } else if (diferencia < 0) {
                estadoDiv.className = 'text-[10px] font-bold estado-falta mt-2';
                if (esExt) {
                    estadoDiv.innerHTML = `Falta: ${formatearExacto(Math.abs(diferencia), '$')} (≈ ${formatearBs(round2(Math.abs(diferencia) * tasaActual))})`;
                } else {
                    estadoDiv.innerHTML = `Falta: ${formatearBs(Math.abs(diferencia))} (≈ ${formatearExacto(round2(Math.abs(diferencia) / tasaActual), '$')})`;
                }
                estadoDiv.classList.remove('hidden');
                vueltoContainer.classList.add('hidden');
                btnAccionConfirmar.disabled = true;
                btnAccionConfirmar.title = "El monto está incompleto";
                btnAccionConfirmar.style.background = '#d1d5db';
                btnAccionConfirmar.style.color = '#6b7280';
                btnAccionConfirmar.style.cursor = 'not-allowed';
            } else {
                estadoDiv.className = 'text-[10px] font-bold estado-sobra mt-2';
                if (esExt) {
                    estadoDiv.innerHTML = `Sobra / Vuelto: ${formatearExacto(diferencia, '$')} (≈ ${formatearBs(round2(diferencia * tasaActual))})`;
                } else {
                    estadoDiv.innerHTML = `Sobra / Vuelto: ${formatearBs(diferencia)} (≈ ${formatearExacto(round2(diferencia / tasaActual), '$')})`;
                }
                estadoDiv.classList.remove('hidden');
                vueltoContainer.classList.remove('hidden');
                btnAccionConfirmar.disabled = false;
                btnAccionConfirmar.title = "";
                btnAccionConfirmar.style.background = '#001f3f';
                btnAccionConfirmar.style.color = 'white';
                btnAccionConfirmar.style.cursor = 'pointer';
            }
        }

        metodoSelect.addEventListener('change', () => {
            if (metodoSelect.value === 'Pago Mixto') {
                if (currentMultipleItems.length === 0) {
                    window.parent.Swal.fire({ icon: 'warning', title: 'Seleccione productos', text: 'Debe confirmar al menos un producto antes de usar Pago Mixto.' });
                    metodoSelect.value = 'Punto de Venta Bs';
                    return;
                }
                cerrarModalAccion();
                abrirModalPagoMixtoParaMultiple();
            } else {
                actualizarTotalMultiple();
            }
        });

        actualizarTotalMultiple();
    } catch(e) {
        console.error(e);
        window.parent.Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudieron cargar los productos.' });
    }
}

async function confirmarPagoMultiple() {
    if (currentMultipleItems.length === 0) {
        window.parent.Swal.fire({ icon: 'warning', title: 'Ningún producto', text: 'Debe confirmar al menos un producto.' });
        return;
    }
    const metodo = currentMultipleMetodo;
    const esExt = METODOS_EXTRANJEROS.includes(metodo);
    const totalBs = currentMultipleTotalBs;
    const totalUsd = esExt ? round2(totalBs / tasaActual) : 0;

    const montoRecibidoInput = document.getElementById('multiple-monto-recibido');
    let montoRecibido = null, vuelto = null;
    if (montoRecibidoInput && montoRecibidoInput.value) {
        montoRecibido = parsearNumero(montoRecibidoInput.value);
        const totalEsperado = round2(esExt ? totalBs / tasaActual : totalBs);
        if (montoRecibido > totalEsperado) {
            vuelto = esExt ? round2(montoRecibido * tasaActual - totalBs) : round2(montoRecibido - totalEsperado);
        }
    }

    const montoEsperadoBs = totalBs;
    const montoEsperadoUsd = round2(totalBs / tasaActual);

    const vueltoCheck = document.getElementById('multiple-vuelto-check');
    const vueltoMetodoSelect = document.getElementById('multiple-vuelto-metodo');
    const vueltoEntregado = vueltoCheck && vueltoCheck.checked && vuelto > 0;
    const vueltoMetodo = vueltoEntregado ? vueltoMetodoSelect.value : null;

    const exito = await window.parent.electronAPI.db.registrarAbonoMultiple(
        fiadoAbiertoId, currentMultipleItems, metodo, totalBs, totalUsd,
        montoRecibido, vuelto, vueltoEntregado, vueltoMetodo, fiadoAbiertoNombre,
        montoEsperadoBs, montoEsperadoUsd
    );
    if (exito) {
        if (vueltoEntregado && vuelto > 0) {
            await registrarGastoVuelto(vuelto, vueltoMetodo);
        }
        window.parent.Swal.fire({ icon: 'success', title: 'Abono registrado', text: 'El pago se ha procesado correctamente.', toast: true, position: 'top-end', timer: 3000 });
        cerrarModalAccion();
        await refrescarContenidoDetalle();
    } else {
        window.parent.Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo procesar el abono.' });
    }
}

function abrirModalPagoMixtoParaMultiple() {
    if (!currentMultipleItems.length) return;
    pendingMixtoItems = [...currentMultipleItems];
    pendingMixtoTotalBs = currentMultipleTotalBs;
    pendingMixtoCliente = fiadoAbiertoNombre;
    pendingMixtoFiadoId = fiadoAbiertoId;

    tipoMixtoFiado = 'multiple';
    abrirModalPagoMixtoGenerico(pendingMixtoTotalBs);
}

function abrirModalPagoMixtoParaTotal() {
    pendingMixtoTotalBs = totalDeudaBs;
    pendingMixtoCliente = fiadoAbiertoNombre;
    pendingMixtoFiadoId = fiadoAbiertoId;
    tipoMixtoFiado = 'total';
    abrirModalPagoMixtoGenerico(pendingMixtoTotalBs);
}

function abrirModalPagoMixtoGenerico(totalBs) {
    pagosMixtosFiado = [];
    cobroMixtoFiadoCompletado = false;

    const totalExacto = round2(totalBs / tasaActual);
    document.getElementById('mix-fiado-total-bs').textContent = formatearBs(totalBs);
    document.getElementById('mix-fiado-total-usd').innerHTML = formatearExacto(totalExacto, '$');

    const metodoSelect = document.getElementById('mix-fiado-input-metodo');
    metodoSelect.value = "Punto de Venta Bs";
    
    actualizarInputMontosFiado();

    metodoSelect.onchange = function () {
        actualizarInputMontosFiado();
        actualizarVistaMixtoFiado();
    };

    const vueltoContainer = document.createElement('div');
    vueltoContainer.id = 'mix-fiado-vuelto-container';
    vueltoContainer.className = 'mt-2 hidden';
    vueltoContainer.innerHTML = `
        <label class="flex items-center gap-2 text-xs">
            <input type="checkbox" id="mix-fiado-vuelto-check" class="form-checkbox h-4 w-4">
            <span>¿Dar vuelto?</span>
        </label>
        <select id="mix-fiado-vuelto-metodo" class="w-full h-9 px-2 text-xs bg-white border border-gray-300 mt-2 hidden rounded-lg">
            ${generarOpcionesMetodosPago("Punto de Venta Bs")}
        </select>
    `;
    const cajaEstado = document.getElementById('mix-fiado-caja-estado');
    cajaEstado.parentNode.insertBefore(vueltoContainer, cajaEstado.nextSibling);

    const vueltoCheck = document.getElementById('mix-fiado-vuelto-check');
    const vueltoMetodoSelect = document.getElementById('mix-fiado-vuelto-metodo');
    vueltoCheck.addEventListener('change', () => {
        vueltoMetodoSelect.classList.toggle('hidden', !vueltoCheck.checked);
    });

    actualizarVistaMixtoFiado();
    document.getElementById('modal-pago-mixto-fiado').classList.remove('hidden');
    scrollAlFinal('#mix-fiado-caja-estado', 100);
}

function actualizarInputMontosFiado() {
    const metodoSelect = document.getElementById('mix-fiado-input-metodo');
    const metodo = metodoSelect.value;
    const montoInput = document.getElementById('mix-fiado-input-monto');
    let nuevoInput;
    if (metodo === 'Efectivo Bs' || metodo === 'Divisas-USD') {
        nuevoInput = crearInputEfectivoEntero('Monto entero (ej: 1.200)', () => {});
    } else {
        nuevoInput = crearInputDecimal('Monto (ej: 1.200,50)', () => {});
    }
    nuevoInput.id = 'mix-fiado-input-monto';
    nuevoInput.className = 'w-28 h-9 px-3 text-xs bg-white border border-gray-300 focus:ring-2 focus:ring-blue-500 font-medium rounded-lg';
    nuevoInput.value = '';
    if (montoInput && montoInput.parentNode) {
        montoInput.parentNode.replaceChild(nuevoInput, montoInput);
    }
}

async function agregarFilaPagoMixtoFiado() {
    const metodo = document.getElementById('mix-fiado-input-metodo').value;
    const montoInput = document.getElementById('mix-fiado-input-monto');
    let monto = parsearNumero(montoInput.value);
    if (isNaN(monto) || monto <= 0) return;

    const esExtranjera = METODOS_EXTRANJEROS.includes(metodo);
    const valorEnBs = esExtranjera ? round2(monto * tasaActual) : monto;
    pagosMixtosFiado.push({ metodo, monto_original: monto, moneda: esExtranjera ? (metodo.includes('USDT') ? 'USDT' : (metodo.includes('USDC') ? 'USDC' : 'USD')) : 'BS', valor_bs: valorEnBs, esExtranjera, tasaUsada: tasaActual });
    montoInput.value = '';
    actualizarVistaMixtoFiado();
    scrollAlFinal('#mix-fiado-lista-pagos', 50);
}

function borrarPagoMixtoFiado(index) {
    pagosMixtosFiado.splice(index, 1);
    actualizarVistaMixtoFiado();
}

function actualizarVistaMixtoFiado() {
    const totalBs = pendingMixtoTotalBs;
    const totalUsdExacto = round2(totalBs / tasaActual);
    document.getElementById('mix-fiado-total-bs').textContent = formatearBs(totalBs);
    document.getElementById('mix-fiado-total-usd').innerHTML = formatearExacto(totalUsdExacto, '$');

    let totalPagadoBs = 0;
    const listaDom = document.getElementById('mix-fiado-lista-pagos');
    listaDom.innerHTML = !pagosMixtosFiado.length ? 'Sin abonos registrados aún.' : pagosMixtosFiado.map((p, idx) => {
        totalPagadoBs += p.valor_bs;
        let montoMostrar;
        if (p.moneda === 'BS') {
            montoMostrar = formatearNumero(p.monto_original) + ' Bs';
        } else {
            montoMostrar = formatearMontoExtranjeroVisual(p.monto_original) + ' ' + p.moneda;
        }
        return `<div class="flex justify-between items-center p-2.5 bg-white border border-gray-200 rounded-lg"><div class="flex items-center gap-2.5"><span class="w-7 h-7 bg-blue-900 text-white flex items-center justify-center font-bold text-[10px] rounded-lg">${idx+1}</span><div><p class="text-[11px] font-bold text-zinc-700">${aplicarFormatoOracion(p.metodo)}</p><p class="text-[9px] text-slate-500">Monto exacto: ${montoMostrar}</p></div></div><button onclick="borrarPagoMixtoFiado(${idx})" class="text-red-500 hover:bg-red-50 p-1.5 text-[10px] font-bold transition-colors">Borrar</button></div>`;
    }).join('');

    const diferenciaBsExacta = round2(totalPagadoBs - totalBs);
    const btnConfirmar = document.getElementById('mix-fiado-btn-confirmar');
    const lblEstado = document.getElementById('mix-fiado-lbl-estado');
    const valBs = document.getElementById('mix-fiado-val-estado-bs');
    const valUsd = document.getElementById('mix-fiado-val-estado-usd');
    const vueltoContainer = document.getElementById('mix-fiado-vuelto-container');

    const metodoActual = document.getElementById('mix-fiado-input-metodo').value;
    const esExtranjeroActual = METODOS_EXTRANJEROS.includes(metodoActual);
    const simboloActual = esExtranjeroActual ? obtenerSimboloMoneda(metodoActual) : '';

    if (diferenciaBsExacta < -0.005) {
        lblEstado.textContent = "FALTA POR COBRAR";
        const faltaBs = Math.abs(diferenciaBsExacta);
        const faltaUsd = faltaBs / tasaActual;
        if (esExtranjeroActual) {
            const faltaUsdStr = formatearMontoExtranjeroVisual(faltaUsd);
            valBs.innerHTML = `Monto exacto: ${simboloActual} ${faltaUsdStr}`;
            valUsd.innerHTML = `≈ ${formatearBs(faltaBs)}`;
        } else {
            valBs.innerHTML = `Monto exacto: ${formatearNumero(faltaBs)} Bs`;
            valUsd.innerHTML = `Monto exacto: ${formatearUsd(faltaUsd)}`;
        }
        lblEstado.className = 'text-[9px] font-bold estado-falta uppercase mb-1';
        valBs.className = 'text-lg font-black text-red-600';
        valUsd.className = 'text-[10px] font-bold text-red-400';
        btnConfirmar.disabled = true;
        btnConfirmar.className = "w-full h-10 bg-gray-300 text-gray-500 font-semibold text-xs transition-all cursor-not-allowed rounded-lg";
        btnConfirmar.textContent = "COMPLETA EL PAGO PARA CONTINUAR";
        btnConfirmar.title = "El monto está incompleto";
        cobroMixtoFiadoCompletado = false;
        if (vueltoContainer) vueltoContainer.classList.add('hidden');
    } else {
        if (diferenciaBsExacta > 0.005) {
            lblEstado.textContent = "SOBRÓ DINERO / DAR VUELTO";
            const sobraBs = diferenciaBsExacta;
            const sobraUsd = sobraBs / tasaActual;
            if (esExtranjeroActual) {
                const sobraUsdStr = formatearMontoExtranjeroVisual(sobraUsd);
                valBs.innerHTML = `Monto exacto: ${simboloActual} ${sobraUsdStr}`;
                valUsd.innerHTML = `≈ ${formatearBs(sobraBs)}`;
            } else {
                valBs.innerHTML = `Monto exacto: ${formatearNumero(sobraBs)} Bs`;
                valUsd.innerHTML = `Monto exacto: ${formatearUsd(sobraUsd)}`;
            }
            lblEstado.className = 'text-[9px] font-bold estado-sobra uppercase mb-1';
            valBs.className = 'text-lg font-black text-emerald-700';
            valUsd.className = 'text-[10px] font-bold text-emerald-500';
            if (vueltoContainer) vueltoContainer.classList.remove('hidden');
        } else {
            lblEstado.textContent = "PAGO EXACTO";
            valBs.textContent = "PAGO EXACTO";
            valUsd.innerHTML = '';
            lblEstado.className = 'text-[9px] font-bold estado-exacto uppercase mb-1';
            valBs.className = 'text-lg font-black text-emerald-700';
            valUsd.className = 'text-[10px] font-bold text-emerald-500';
            if (vueltoContainer) vueltoContainer.classList.add('hidden');
        }
        btnConfirmar.disabled = false;
        btnConfirmar.className = "w-full h-10 text-white font-semibold text-xs transition-all cursor-pointer rounded-lg";
        btnConfirmar.style.background = '#001f3f';
        btnConfirmar.title = "";
        btnConfirmar.textContent = "✓ CONFIRMAR PAGO MIXTO";
        cobroMixtoFiadoCompletado = true;
    }
    scrollAlFinal('#mix-fiado-caja-estado', 50);
}

async function confirmarPagoMixtoFiado() {
    if (!cobroMixtoFiadoCompletado) return;
    const metodosStr = pagosMixtosFiado.map(p => p.metodo).join(' + ');
    let metodoFinal = "Mixto: " + metodosStr;
    let totalBsFinal = 0, totalUsdFinal = 0;
    const desglose = [];
    for (const p of pagosMixtosFiado) {
        if (p.esExtranjera) {
            totalUsdFinal += p.monto_original;
            desglose.push(`${p.metodo}:${p.monto_original}~${p.tasaUsada}`);
        } else {
            totalBsFinal += p.valor_bs;
            desglose.push(`${p.metodo}:${p.valor_bs}~${p.tasaUsada}`);
        }
    }
    totalBsFinal = round2(totalBsFinal);
    totalUsdFinal = round2(totalUsdFinal);
    if (desglose.length) metodoFinal += "|" + desglose.join('|');

    const montoEsperadoBs = pendingMixtoTotalBs;
    const montoEsperadoUsd = round2(pendingMixtoTotalBs / tasaActual);

    const totalBsPagado = round2(pagosMixtosFiado.reduce((sum, p) => sum + p.valor_bs, 0));
    const vuelto = round2(totalBsPagado - pendingMixtoTotalBs);
    const vueltoCheck = document.getElementById('mix-fiado-vuelto-check');
    const vueltoMetodoSelect = document.getElementById('mix-fiado-vuelto-metodo');
    const vueltoEntregado = vueltoCheck && vueltoCheck.checked && vuelto > 0.005;
    const vueltoMetodo = vueltoEntregado ? vueltoMetodoSelect.value : null;

    if (tipoMixtoFiado === 'total') {
        const exito = await window.parent.electronAPI.db.registrarPagoFiadoComoVenta(
            pendingMixtoFiadoId, pendingMixtoCliente, metodoFinal, totalBsFinal, totalUsdFinal,
            null, vuelto, vueltoEntregado, vueltoMetodo,
            montoEsperadoBs, montoEsperadoUsd
        );
        if (exito) {
            if (vueltoEntregado && vuelto > 0) {
                await registrarGastoVuelto(vuelto, vueltoMetodo);
            }
            await window.parent.electronAPI.db.finalizarFiadoPagado(pendingMixtoFiadoId);
            window.parent.Swal.fire({ icon: 'success', title: 'Deuda Liquidada', text: 'La cuenta ha sido pagada y cerrada exitosamente.', confirmButtonColor: '#10b981' });
            cerrarModalPagoMixtoFiado();
            cerrarModalDetalle();
        } else {
            window.parent.Swal.fire({ icon: 'error', title: 'Fallo', text: 'Error al liquidar la deuda.' });
        }
    } else {
        const exito = await window.parent.electronAPI.db.registrarAbonoMultiple(
            pendingMixtoFiadoId, pendingMixtoItems, metodoFinal, totalBsFinal, totalUsdFinal,
            null, vuelto, vueltoEntregado, vueltoMetodo, pendingMixtoCliente,
            montoEsperadoBs, montoEsperadoUsd
        );
        if (exito) {
            if (vueltoEntregado && vuelto > 0) {
                await registrarGastoVuelto(vuelto, vueltoMetodo);
            }
            window.parent.Swal.fire({ icon: 'success', title: 'Abono Mixto Registrado', text: 'El pago mixto se ha procesado correctamente.', toast: true, position: 'top-end', timer: 3000 });
            cerrarModalPagoMixtoFiado();
            await refrescarContenidoDetalle();
        } else {
            window.parent.Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo procesar el abono mixto.' });
        }
    }
}

function cerrarModalPagoMixtoFiado() {
    document.getElementById('modal-pago-mixto-fiado').classList.add('hidden');
    tipoMixtoFiado = null;
    pagosMixtosFiado = [];
    pendingMixtoItems = [];
    const vueltoContainer = document.getElementById('mix-fiado-vuelto-container');
    if (vueltoContainer) vueltoContainer.remove();
}

async function abrirModalAgregarProd() {
    accionTitulo.textContent = "AÑADIR PRODUCTO A LA CUENTA";
    accionContenido.innerHTML = `
        <label class="text-[11px] font-bold text-slate-500">BUSCAR PRODUCTO (NOMBRE O SKU)</label>
        <input type="text" id="acc-buscar-prod" placeholder="Escriba para buscar..." autocomplete="off" class="w-full h-10 px-3 text-sm bg-white border border-gray-300 focus:ring-2 focus:ring-blue-500 mb-2 rounded-lg">
        <select id="acc-combo-prod" class="w-full h-10 px-3 text-sm bg-white border border-gray-300 focus:ring-2 focus:ring-blue-500 mb-2 rounded-lg">
            <option value="">Seleccione un producto...</option>
        </select>
        <label class="text-[11px] font-bold text-slate-500">CANTIDAD / PESO</label>
        <input type="number" id="acc-cant-prod" min="1" value="1" class="w-full h-10 px-3 text-sm bg-white border border-gray-300 focus:ring-2 focus:ring-blue-500 rounded-lg">
    `;
    btnAccionConfirmar.textContent = "AÑADIR AL FIADO";
    btnAccionConfirmar.className = "w-full h-11 mt-2 text-white font-bold text-[13px] transition-colors rounded-lg";
    btnAccionConfirmar.style.background = '#001f3f';
    btnAccionConfirmar.style.border = 'none';
    btnAccionConfirmar.onclick = ejecutarAgregarProd;
    btnAccionConfirmar.disabled = false;
    btnAccionConfirmar.title = "";
    modalAccion.classList.remove('hidden');

    try {
        const prodsRaw = await window.parent.electronAPI.db.buscarProductos("");
        productosDisponibles = prodsRaw.map(p => ({
            id: p.id,
            sku: p.sku || "",
            nombre: p.nombre,
            p_venta_bs: parseFloat(p.p_venta_bs || 0),
            p_venta_usd: parseFloat(p.p_venta_usd || 0),
            stock: parseInt(p.stock || 0),
            es_por_peso: !!p.es_por_peso,
            precio_kg_bs: parseFloat(p.precio_kg_bs || 0),
            precio_kg_usd: parseFloat(p.precio_kg_usd || 0),
            stock_kg: parseFloat(p.stock_kg || 0)
        }));
        actualizarComboProductos(productosDisponibles);
    } catch (e) {}

    document.getElementById('acc-buscar-prod').addEventListener('keyup', (e) => {
        const txt = e.target.value.toLowerCase();
        actualizarComboProductos(productosDisponibles.filter(p => p.nombre.toLowerCase().includes(txt) || p.sku.toLowerCase().includes(txt)));
    });

    document.getElementById('acc-combo-prod').addEventListener('change', function() {
        const prodId = this.value;
        const prod = productosDisponibles.find(p => String(p.id) === String(prodId));
        const cantInput = document.getElementById('acc-cant-prod');
        if (prod && prod.es_por_peso) {
            cantInput.placeholder = "Peso (kg)";
            cantInput.type = "text";
            cantInput.inputMode = "decimal";
            cantInput.step = "any";
        } else {
            cantInput.placeholder = "Cantidad";
            cantInput.type = "number";
            cantInput.inputMode = "numeric";
            cantInput.step = "1";
        }
    });
}

function actualizarComboProductos(lista) {
    const combo = document.getElementById('acc-combo-prod');
    if (!combo) return;
    combo.innerHTML = !lista.length ? '<option value="">Sin coincidencias</option>' : lista.map(p => {
        let infoPrecio, infoStock;
        if (p.es_por_peso) {
            infoPrecio = `Bs ${p.precio_kg_bs.toLocaleString('es-VE', {minimumFractionDigits: 2})}/kg | $ ${p.precio_kg_usd.toLocaleString('es-VE', {minimumFractionDigits: 2})}/kg`;
            infoStock = `${p.stock_kg % 1 === 0 ? p.stock_kg : p.stock_kg.toFixed(3)} kg`;
        } else {
            infoPrecio = `Bs ${p.p_venta_bs.toLocaleString('es-VE', {minimumFractionDigits: 2})} | $ ${p.p_venta_usd.toLocaleString('es-VE', {minimumFractionDigits: 2})}`;
            infoStock = `${p.stock} unid.`;
        }
        return `<option value="${p.id}">${escapeHtml(p.nombre)} | ${infoPrecio} (Stock: ${infoStock})</option>`;
    }).join('');
}

async function ejecutarAgregarProd() {
    const combo = document.getElementById('acc-combo-prod');
    const cantInput = document.getElementById('acc-cant-prod');
    if (!combo.value) return window.parent.Swal.fire({ icon: 'warning', title: 'Atención', text: 'Debe seleccionar un producto válido.', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });

    const prod = productosDisponibles.find(p => String(p.id) === String(combo.value));
    if (!prod) return;

    // Obtener la tasa original del fiado para preservar el valor en dólares
    const fiadoInfo = fiadosBD.find(f => f.id === fiadoAbiertoId);
    const tasaOriginal = fiadoInfo ? fiadoInfo.tasa_momento : tasaActual;

    if (prod.es_por_peso) {
        const pesoStr = cantInput.value.trim().replace(',', '.');
        const pesoKg = parseFloat(pesoStr);
        if (isNaN(pesoKg) || pesoKg <= 0) {
            return window.parent.Swal.fire({ icon: 'warning', title: 'Peso inválido', text: 'Ingrese un peso válido mayor a 0.', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        }
        if (prod.stock_kg > 0 && pesoKg > prod.stock_kg) {
            return window.parent.Swal.fire({ icon: 'warning', title: 'Stock insuficiente', text: `Solo quedan ${prod.stock_kg.toFixed(3)} kg disponibles.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
        }
        // Calcular el precio total en Bs usando la tasa original para que el valor en USD se mantenga constante
        const precioTotalBs = round2(pesoKg * prod.precio_kg_usd * tasaOriginal);
        try {
            await window.parent.electronAPI.db.agregarProductoAFiado(fiadoAbiertoId, prod.id, pesoKg, precioTotalBs);
            window.parent.Swal.fire({ icon: 'success', title: 'Producto agregado', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
            cerrarModalAccion();
            await refrescarContenidoDetalle();
        } catch(e) {
            const mensajeLimpio = e.message.split('Error:').pop().trim();
            window.parent.Swal.fire({ icon: 'error', title: 'Error', text: mensajeLimpio, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
        }
    } else {
        const cant = parseInt(cantInput.value);
        if (isNaN(cant) || cant <= 0) {
            return window.parent.Swal.fire({ icon: 'warning', title: 'Cantidad inválida', text: 'Ingrese una cantidad válida.', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        }
        if (cant > prod.stock) {
            return window.parent.Swal.fire({ icon: 'warning', title: 'Stock insuficiente', text: `Solo quedan ${prod.stock} unidades.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
        }
        const montoCalculado = round2((tasaActual > 0 ? round2(prod.p_venta_bs / tasaActual) : 0) * tasaOriginal);
        try {
            await window.parent.electronAPI.db.agregarProductoAFiado(fiadoAbiertoId, prod.id, cant, montoCalculado);
            window.parent.Swal.fire({ icon: 'success', title: 'Producto agregado', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
            cerrarModalAccion();
            await refrescarContenidoDetalle();
        } catch(e) {
            const mensajeLimpio = e.message.split('Error:').pop().trim();
            window.parent.Swal.fire({ icon: 'error', title: 'Error', text: mensajeLimpio, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
        }
    }
}

async function eliminarCargo(detalleId) {
    if ((await window.parent.Swal.fire({ title: '¿Quitar recargo?', text: 'Se eliminará este cargo de la cuenta del cliente.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, quitar', cancelButtonText: 'Cancelar', confirmButtonColor: '#ef4444' })).isConfirmed) {
        try {
            await window.parent.electronAPI.db.eliminarDetalleFiado(detalleId, fiadoAbiertoId);
            window.parent.Swal.fire({ icon: 'success', title: 'Cargo Removido', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
            await refrescarContenidoDetalle();
        } catch (e) { window.parent.Swal.fire({ icon: 'error', title: 'Error', text: e.message }); }
    }
}

async function abrirModalPagoTotal() {
    const { tasaActual: tasaFresh } = await obtenerTasasActuales();
    tasaActual = tasaFresh;
    accionTitulo.textContent = "LIQUIDAR DEUDA COMPLETA";
    accionContenido.innerHTML = `
        <p class="text-[12px] text-slate-600 mb-2">Se registrará el pago completo y se cerrará esta cuenta.</p>
        <label class="text-[11px] font-bold text-slate-500">MÉTODO DE PAGO</label>
        <select id="acc-metodo" class="w-full h-10 px-3 text-sm bg-white border border-gray-300 focus:ring-2 focus:ring-blue-500 rounded-lg">${generarOpcionesMetodosPago("Punto de Venta Bs")}</select>
        <div class="bg-slate-100 p-3 text-center my-3 rounded-lg">
            <p class="text-[10px] font-bold text-slate-500 uppercase">Total a pagar</p>
            <p class="text-base font-black text-zinc-900">${formatearBs(totalDeudaBs)}</p>
            <p class="text-xs font-bold text-slate-500" id="total-pagar-usd"></p>
        </div>
        <div id="contenedor-monto-recibido" class="mt-2"></div>
        <span id="acc-estado-pago" class="text-[10px] font-bold hidden mt-1"></span>
        <div id="total-vuelto-container" class="mt-2 hidden">
            <label class="flex items-center gap-2 text-xs">
                <input type="checkbox" id="total-vuelto-check" class="form-checkbox h-4 w-4">
                <span>¿Dar vuelto?</span>
            </label>
            <select id="total-vuelto-metodo" class="w-full h-9 px-2 text-xs bg-white border border-gray-300 mt-2 hidden rounded-lg">
                ${generarOpcionesMetodosPago("Punto de Venta Bs")}
            </select>
        </div>
    `;
    btnAccionConfirmar.textContent = "Pagar";
    btnAccionConfirmar.className = "w-full h-11 mt-2 text-white font-bold text-[13px] transition-colors rounded-lg";
    btnAccionConfirmar.style.background = '#d1d5db';
    btnAccionConfirmar.style.color = '#6b7280';
    btnAccionConfirmar.style.cursor = 'not-allowed';
    btnAccionConfirmar.onclick = ejecutarPagoTotal;
    btnAccionConfirmar.disabled = true;
    btnAccionConfirmar.title = "El monto está incompleto";
    modalAccion.classList.remove('hidden');

    const metodoSelect = document.getElementById('acc-metodo');
    const contenedorMonto = document.getElementById('contenedor-monto-recibido');
    const vueltoContainer = document.getElementById('total-vuelto-container');
    const vueltoCheck = document.getElementById('total-vuelto-check');
    const vueltoMetodoSelect = document.getElementById('total-vuelto-metodo');
    vueltoCheck.addEventListener('change', () => {
        vueltoMetodoSelect.classList.toggle('hidden', !vueltoCheck.checked);
    });

    async function actualizarTotalPagoTotal() {
        const metodo = metodoSelect.value;
        if (metodo === 'Pago Mixto') {
            cerrarModalAccion();
            abrirModalPagoMixtoParaTotal();
            return;
        }
        const esExt = METODOS_EXTRANJEROS.includes(metodo);
        const totalEnMonedaExacto = round2(totalDeudaBs / tasaActual);
        const simbolo = esExt ? '$' : 'Bs';
        document.getElementById('total-pagar-usd').innerHTML = `<span class="text-[11px] font-bold">Monto exacto: ${esExt ? formatearExacto(totalEnMonedaExacto, simbolo) : formatearBs(totalDeudaBs)}</span>`;

        let valorPrellenado = '';
        if (esExt) {
            valorPrellenado = formatearExactoCliente(totalEnMonedaExacto);
        } else {
            valorPrellenado = totalDeudaBs.toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        }
        contenedorMonto.innerHTML = `
            <label class="text-[10px] font-bold text-slate-500 uppercase block mb-1">Monto recibido</label>
            <div class="flex gap-2 items-center">
                <input type="text" id="acc-monto-recibido" class="flex-1 h-9 px-2 text-xs bg-gray-100 border border-gray-300 focus:ring-2 focus:ring-blue-500 rounded-lg" value="${valorPrellenado}" disabled>
                <button id="btn-editar-monto-total" class="h-9 px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-[10px] rounded-lg border border-gray-300 transition-colors">Editar</button>
            </div>
        `;

        const inputMonto = document.getElementById('acc-monto-recibido');
        const btnEditar = document.getElementById('btn-editar-monto-total');

        if (inputMonto) {
            inputMonto.addEventListener('blur', () => actualizarEstadoPagoFiado('total'));
            inputMonto.addEventListener('input', () => actualizarEstadoPagoFiado('total'));
        }

        if (btnEditar) {
            btnEditar.addEventListener('click', () => {
                if (!inputMonto) return;
                const estaDeshabilitado = inputMonto.disabled;
                if (estaDeshabilitado) {
                    inputMonto.disabled = false;
                    inputMonto.classList.remove('bg-gray-100');
                    inputMonto.classList.add('bg-white');
                    inputMonto.focus();
                    btnEditar.textContent = 'Guardar';
                } else {
                    inputMonto.disabled = true;
                    inputMonto.classList.add('bg-gray-100');
                    inputMonto.classList.remove('bg-white');
                    btnEditar.textContent = 'Editar';
                    actualizarEstadoPagoFiado('total');
                }
            });
        }

        const esEfectivoBs = metodo === 'Efectivo Bs';
        const esEfectivoUsd = metodo === 'Divisas-USD';
        const tieneDecimales = (esEfectivoBs && !Number.isInteger(totalDeudaBs)) || (esEfectivoUsd && !Number.isInteger(totalEnMonedaExacto));
        if (tieneDecimales) {
            contenedorMonto.innerHTML += `<div class="mt-2 p-2 bg-amber-50 border border-amber-200 text-[10px] text-amber-700 rounded-lg">⚠️ Este monto contiene decimales. Lo recomendable es utilizar <strong>'Pago Mixto'</strong>.</div>`;
        }

        actualizarEstadoPagoFiado('total');
    }

    metodoSelect.addEventListener('change', actualizarTotalPagoTotal);
    actualizarTotalPagoTotal();
    scrollAlFinal('#accion-contenido', 100);
}

async function actualizarEstadoPagoFiado(tipo) {
    const montoInput = document.getElementById('acc-monto-recibido');
    if (!montoInput) return;
    const montoRecibido = parsearNumero(montoInput.value);
    const metodo = document.getElementById('acc-metodo').value;
    const estadoPago = document.getElementById('acc-estado-pago');
    const vueltoContainer = document.getElementById('total-vuelto-container');
    if (montoRecibido <= 0 || montoInput.value === '') {
        estadoPago.classList.add('hidden');
        if (vueltoContainer) vueltoContainer.classList.add('hidden');
        btnAccionConfirmar.disabled = true;
        btnAccionConfirmar.title = "El monto está incompleto";
        btnAccionConfirmar.style.background = '#d1d5db';
        btnAccionConfirmar.style.color = '#6b7280';
        btnAccionConfirmar.style.cursor = 'not-allowed';
        return;
    }

    let totalEsperadoExacto = 0;
    let moneda = 'Bs';
    if (tipo === 'total') {
        const esExtranjero = METODOS_EXTRANJEROS.includes(metodo);
        if (esExtranjero) {
            totalEsperadoExacto = round2(totalDeudaBs / tasaActual);
            moneda = '$';
        } else {
            totalEsperadoExacto = totalDeudaBs;
        }
    }
    const diferenciaExacta = round2(montoRecibido - totalEsperadoExacto);
    estadoPago.classList.remove('hidden');
    if (Math.abs(diferenciaExacta) <= 0.005) {
        estadoPago.className = 'text-[10px] font-bold estado-exacto mt-1';
        estadoPago.textContent = 'Pago exacto';
        if (vueltoContainer) vueltoContainer.classList.add('hidden');
        btnAccionConfirmar.disabled = false;
        btnAccionConfirmar.title = "";
        btnAccionConfirmar.style.background = '#001f3f';
        btnAccionConfirmar.style.color = 'white';
        btnAccionConfirmar.style.cursor = 'pointer';
    } else if (diferenciaExacta < 0) {
        estadoPago.className = 'text-[10px] font-bold estado-falta mt-1';
        const falta = Math.abs(diferenciaExacta);
        if (moneda === '$') {
            estadoPago.innerHTML = `Falta: ${formatearNumero(falta, 2)} ${moneda} (≈ ${formatearBs(round2(falta * tasaActual))})`;
        } else {
            estadoPago.innerHTML = `Falta: ${formatearNumero(falta, 2)} ${moneda} (≈ ${formatearExacto(round2(falta / tasaActual), '$')})`;
        }
        if (vueltoContainer) vueltoContainer.classList.add('hidden');
        btnAccionConfirmar.disabled = true;
        btnAccionConfirmar.title = "El monto está incompleto";
        btnAccionConfirmar.style.background = '#d1d5db';
        btnAccionConfirmar.style.color = '#6b7280';
        btnAccionConfirmar.style.cursor = 'not-allowed';
    } else {
        estadoPago.className = 'text-[10px] font-bold estado-sobra mt-1';
        if (moneda === '$') {
            estadoPago.innerHTML = `Vuelto: ${formatearNumero(diferenciaExacta, 2)} ${moneda} (≈ ${formatearBs(round2(diferenciaExacta * tasaActual))})`;
        } else {
            estadoPago.innerHTML = `Vuelto: ${formatearNumero(diferenciaExacta, 2)} ${moneda} (≈ ${formatearExacto(round2(diferenciaExacta / tasaActual), '$')})`;
        }
        if (vueltoContainer) vueltoContainer.classList.remove('hidden');
        btnAccionConfirmar.disabled = false;
        btnAccionConfirmar.title = "";
        btnAccionConfirmar.style.background = '#001f3f';
        btnAccionConfirmar.style.color = 'white';
        btnAccionConfirmar.style.cursor = 'pointer';
    }
    scrollAlFinal('#acc-estado-pago', 50);
}

async function ejecutarPagoTotal() {
    try {
        const metodo = document.getElementById('acc-metodo').value;
        const montoInput = document.getElementById('acc-monto-recibido');
        if (!montoInput || montoInput.value === '') return window.parent.Swal.fire({ icon: 'warning', title: 'Falta monto', text: 'Debe ingresar un monto recibido.' });

        const esExt = METODOS_EXTRANJEROS.includes(metodo);
        let montoIngresado = parsearNumero(montoInput.value);
        if (montoIngresado <= 0) return window.parent.Swal.fire({ icon: 'warning', title: 'Monto inválido', text: 'Ingrese un monto mayor a cero.' });

        let totalAdeudadoEnMoneda = round2(esExt ? totalDeudaBs / tasaActual : totalDeudaBs);
        let cantidadAPagar = Math.min(montoIngresado, totalAdeudadoEnMoneda);
        let vuelto = 0;
        if (montoIngresado > totalAdeudadoEnMoneda) {
            vuelto = esExt ? round2(montoIngresado * tasaActual - totalDeudaBs) : round2(montoIngresado - totalAdeudadoEnMoneda);
            cantidadAPagar = totalAdeudadoEnMoneda;
        }

        let totalBsFinal, totalUsdFinal;
        if (esExt) {
            totalUsdFinal = cantidadAPagar;
            totalBsFinal = round2(cantidadAPagar * tasaActual);
        } else {
            totalBsFinal = cantidadAPagar;
            totalUsdFinal = round2(cantidadAPagar / tasaActual);
        }

        const montoEsperadoBs = totalDeudaBs;
        const montoEsperadoUsd = round2(totalDeudaBs / tasaActual);

        const vueltoCheck = document.getElementById('total-vuelto-check');
        const vueltoMetodoSelect = document.getElementById('total-vuelto-metodo');
        const vueltoEntregado = vueltoCheck && vueltoCheck.checked && vuelto > 0;
        const vueltoMetodo = vueltoEntregado ? vueltoMetodoSelect.value : null;

        if (await window.parent.electronAPI.db.registrarPagoFiadoComoVenta(
            fiadoAbiertoId, fiadoAbiertoNombre, metodo, totalBsFinal, totalUsdFinal,
            montoIngresado, vuelto, vueltoEntregado, vueltoMetodo,
            montoEsperadoBs, montoEsperadoUsd
        )) {
            if (vueltoEntregado && vuelto > 0) {
                await registrarGastoVuelto(vuelto, vueltoMetodo);
            }
            await window.parent.electronAPI.db.finalizarFiadoPagado(fiadoAbiertoId);
            window.parent.Swal.fire({ icon: 'success', title: 'Deuda Liquidada', text: 'La cuenta ha sido pagada y cerrada exitosamente.', confirmButtonColor: '#10b981' });
            cerrarModalAccion();
            cerrarModalDetalle();
        } else window.parent.Swal.fire({ icon: 'error', title: 'Fallo', text: 'Error al liquidar la deuda.', toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
    } catch (e) { window.parent.Swal.fire({ icon: 'error', title: 'Error', text: e.message, confirmButtonColor: '#dc2626' }); }
}

async function abrirModalPagoParcial(detalleId, maxCant, nombreProd, precioUnitarioBs = 0) {
    detalleItemAbierto = detalleId;
    fiadoAbiertoMaxCantidad = maxCant;
    const { tasaActual: tasaFresh, tasaOrig } = await obtenerTasasActuales();
    tasaActual = tasaFresh;
    let precioUSD = 0;
    if (detalleItemAbierto) {
        const detalle = await window.parent.electronAPI.db.ejecutarConsulta(
            "SELECT producto_id, precio_unitario FROM fiados_detalle WHERE id = ?", [detalleId]
        );
        if (detalle && detalle.length > 0 && detalle[0].producto_id) {
            precioUSD = round2(detalle[0].precio_unitario / tasaOrig);
        } else {
            precioUSD = precioUnitarioBs / tasaOrig;
        }
    } else {
        precioUSD = precioUnitarioBs / tasaOrig;
    }

    accionTitulo.textContent = "PAGO PARCIAL DE ARTÍCULO";
    accionContenido.innerHTML = `
        <p class="text-[12px] text-slate-600 mb-2">Producto: <b>${escapeHtml(nombreProd)}</b></p>
        <label class="text-[11px] font-bold text-slate-500">UNIDADES A PAGAR (MÁX ${maxCant})</label>
        <input type="number" id="acc-cant" min="1" max="${maxCant}" value="1" class="w-full h-10 px-3 text-sm bg-white border border-gray-300 focus:ring-2 focus:ring-blue-500 rounded-lg">
        <label class="text-[11px] font-bold text-slate-500 mt-2">MÉTODO DE PAGO</label>
        <select id="acc-metodo" class="w-full h-10 px-3 text-sm bg-white border border-gray-300 focus:ring-2 focus:ring-blue-500 rounded-lg">${generarOpcionesMetodosPago("Punto de Venta Bs")}</select>
        <div class="bg-slate-100 p-3 text-center my-3 rounded-lg">
            <p class="text-[10px] font-bold text-slate-500 uppercase">Total a pagar</p>
            <p class="text-base font-black text-zinc-900" id="parcial-monto-bs">${formatearBs(round2(1 * precioUSD * tasaActual))}</p>
            <p class="text-xs font-bold text-slate-500" id="parcial-monto-usd"></p>
        </div>
        <div id="contenedor-monto-recibido" class="mt-2"></div>
        <span id="acc-estado-pago" class="text-[10px] font-bold hidden mt-1"></span>
        <div id="parcial-vuelto-container" class="mt-2 hidden">
            <label class="flex items-center gap-2 text-xs">
                <input type="checkbox" id="parcial-vuelto-check" class="form-checkbox h-4 w-4">
                <span>¿Dar vuelto?</span>
            </label>
            <select id="parcial-vuelto-metodo" class="w-full h-9 px-2 text-xs bg-white border border-gray-300 mt-2 hidden rounded-lg">
                ${generarOpcionesMetodosPago("Punto de Venta Bs")}
            </select>
        </div>
    `;
    btnAccionConfirmar.textContent = "Pagar";
    btnAccionConfirmar.className = "w-full h-11 mt-2 text-white font-bold text-[13px] transition-colors rounded-lg";
    btnAccionConfirmar.style.background = '#d1d5db';
    btnAccionConfirmar.style.color = '#6b7280';
    btnAccionConfirmar.style.cursor = 'not-allowed';
    btnAccionConfirmar.onclick = ejecutarPagoParcial;
    btnAccionConfirmar.disabled = true;
    btnAccionConfirmar.title = "El monto está incompleto";
    modalAccion.classList.remove('hidden');

    const inputCantidad = document.getElementById('acc-cant');
    const metodoSelect = document.getElementById('acc-metodo');
    const contenedorMonto = document.getElementById('contenedor-monto-recibido');
    const vueltoContainer = document.getElementById('parcial-vuelto-container');
    const vueltoCheck = document.getElementById('parcial-vuelto-check');
    const vueltoMetodoSelect = document.getElementById('parcial-vuelto-metodo');
    vueltoCheck.addEventListener('change', () => {
        vueltoMetodoSelect.classList.toggle('hidden', !vueltoCheck.checked);
    });

    async function actualizarTotalParcial() {
        const cant = parseInt(inputCantidad.value) || 1;
        const metodo = metodoSelect.value;
        const esExt = esMetodoExtranjero(metodo);
        const subtotalUsd = round2(cant * precioUSD);
        const totalBs = round2(subtotalUsd * tasaActual);
        document.getElementById('parcial-monto-bs').textContent = formatearBs(totalBs);

        const simbolo = esExt ? '$' : 'Bs';
        document.getElementById('parcial-monto-usd').innerHTML = `<span class="text-[11px] font-bold">Monto exacto: ${esExt ? formatearExacto(subtotalUsd, simbolo) : formatearBs(totalBs)}</span>`;

        let valorPrellenado = '';
        if (esExt) {
            valorPrellenado = formatearExactoCliente(subtotalUsd);
        } else {
            valorPrellenado = totalBs.toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        }
        contenedorMonto.innerHTML = `
            <label class="text-[10px] font-bold text-slate-500 uppercase block mb-1">Monto recibido</label>
            <div class="flex gap-2 items-center">
                <input type="text" id="acc-monto-recibido" class="flex-1 h-9 px-2 text-xs bg-gray-100 border border-gray-300 focus:ring-2 focus:ring-blue-500 rounded-lg" value="${valorPrellenado}" disabled>
                <button id="btn-editar-monto-parcial" class="h-9 px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-[10px] rounded-lg border border-gray-300 transition-colors">Editar</button>
            </div>
        `;

        const inputMonto = document.getElementById('acc-monto-recibido');
        const btnEditar = document.getElementById('btn-editar-monto-parcial');

        if (inputMonto) {
            inputMonto.addEventListener('blur', actualizarEstadoPagoParcial);
            inputMonto.addEventListener('input', actualizarEstadoPagoParcial);
        }

        if (btnEditar) {
            btnEditar.addEventListener('click', () => {
                if (!inputMonto) return;
                const estaDeshabilitado = inputMonto.disabled;
                if (estaDeshabilitado) {
                    inputMonto.disabled = false;
                    inputMonto.classList.remove('bg-gray-100');
                    inputMonto.classList.add('bg-white');
                    inputMonto.focus();
                    btnEditar.textContent = 'Guardar';
                } else {
                    inputMonto.disabled = true;
                    inputMonto.classList.add('bg-gray-100');
                    inputMonto.classList.remove('bg-white');
                    btnEditar.textContent = 'Editar';
                    actualizarEstadoPagoParcial();
                }
            });
        }

        actualizarEstadoPagoParcial();
    }

    async function actualizarEstadoPagoParcial() {
        const inputMonto = document.getElementById('acc-monto-recibido');
        if (!inputMonto) return;
        const montoRecibido = parsearNumero(inputMonto.value);
        const estadoDiv = document.getElementById('acc-estado-pago');
        if (montoRecibido <= 0) {
            estadoDiv.classList.add('hidden');
            vueltoContainer.classList.add('hidden');
            btnAccionConfirmar.disabled = true;
            btnAccionConfirmar.title = "El monto está incompleto";
            btnAccionConfirmar.style.background = '#d1d5db';
            btnAccionConfirmar.style.color = '#6b7280';
            btnAccionConfirmar.style.cursor = 'not-allowed';
            return;
        }
        const cant = parseInt(inputCantidad.value) || 1;
        const metodo = metodoSelect.value;
        const esExt = METODOS_EXTRANJEROS.includes(metodo);
        const subtotalUsd = round2(cant * precioUSD);
        const totalBs = round2(subtotalUsd * tasaActual);
        const totalEsperado = round2(esExt ? subtotalUsd : totalBs);
        const diferencia = round2(montoRecibido - totalEsperado);
        if (Math.abs(diferencia) <= 0.005) {
            estadoDiv.className = 'text-[10px] font-bold estado-exacto mt-2';
            estadoDiv.textContent = 'Pago exacto';
            estadoDiv.classList.remove('hidden');
            vueltoContainer.classList.add('hidden');
            btnAccionConfirmar.disabled = false;
            btnAccionConfirmar.title = "";
            btnAccionConfirmar.style.background = '#001f3f';
            btnAccionConfirmar.style.color = 'white';
            btnAccionConfirmar.style.cursor = 'pointer';
        } else if (diferencia < 0) {
            estadoDiv.className = 'text-[10px] font-bold estado-falta mt-2';
            const falta = Math.abs(diferencia);
            if (esExt) {
                estadoDiv.innerHTML = `Falta: ${formatearExacto(falta, '$')} (≈ ${formatearBs(round2(falta * tasaActual))})`;
            } else {
                estadoDiv.innerHTML = `Falta: ${formatearBs(falta)} (≈ ${formatearExacto(round2(falta / tasaActual), '$')})`;
            }
            estadoDiv.classList.remove('hidden');
            vueltoContainer.classList.add('hidden');
            btnAccionConfirmar.disabled = true;
            btnAccionConfirmar.title = "El monto está incompleto";
            btnAccionConfirmar.style.background = '#d1d5db';
            btnAccionConfirmar.style.color = '#6b7280';
            btnAccionConfirmar.style.cursor = 'not-allowed';
        } else {
            estadoDiv.className = 'text-[10px] font-bold estado-sobra mt-2';
            if (esExt) {
                estadoDiv.innerHTML = `Vuelto: ${formatearExacto(diferencia, '$')} (≈ ${formatearBs(round2(diferencia * tasaActual))})`;
            } else {
                estadoDiv.innerHTML = `Vuelto: ${formatearBs(diferencia)} (≈ ${formatearExacto(round2(diferencia / tasaActual), '$')})`;
            }
            estadoDiv.classList.remove('hidden');
            vueltoContainer.classList.remove('hidden');
            btnAccionConfirmar.disabled = false;
            btnAccionConfirmar.title = "";
            btnAccionConfirmar.style.background = '#001f3f';
            btnAccionConfirmar.style.color = 'white';
            btnAccionConfirmar.style.cursor = 'pointer';
        }
    }

    inputCantidad.addEventListener('input', actualizarTotalParcial);
    metodoSelect.addEventListener('change', actualizarTotalParcial);
    actualizarTotalParcial();
    scrollAlFinal('#accion-contenido', 100);
}

async function ejecutarPagoParcial() {
    const cant = parseInt(document.getElementById('acc-cant').value);
    const metodo = document.getElementById('acc-metodo').value;
    if (isNaN(cant) || cant <= 0 || cant > fiadoAbiertoMaxCantidad) return window.parent.Swal.fire({ icon: 'warning', title: 'Atención', text: 'Cantidad no válida.', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });

    const montoInput = document.getElementById('acc-monto-recibido');
    if (!montoInput || montoInput.value === '') return window.parent.Swal.fire({ icon: 'warning', title: 'Falta monto', text: 'Debe ingresar un monto recibido.' });

    try {
        const { tasaOrig } = await obtenerTasasActuales();
        let precioUSD = 0;
        if (detalleItemAbierto) {
            const detalle = await window.parent.electronAPI.db.ejecutarConsulta(
                "SELECT producto_id, precio_unitario FROM fiados_detalle WHERE id = ?", [detalleItemAbierto]
            );
            if (detalle && detalle.length > 0 && detalle[0].producto_id) {
                precioUSD = round2(detalle[0].precio_unitario / tasaOrig);
            } else {
                precioUSD = fiadoAbiertoPrecioUnitarioBs / tasaOrig;
            }
        } else {
            precioUSD = fiadoAbiertoPrecioUnitarioBs / tasaOrig;
        }

        const esExt = METODOS_EXTRANJEROS.includes(metodo);
        const subtotalUsd = round2(cant * precioUSD);
        const totalBsItem = round2(subtotalUsd * tasaActual);
        let montoIngresado = parsearNumero(montoInput.value);
        if (montoIngresado <= 0) return window.parent.Swal.fire({ icon: 'warning', title: 'Monto inválido', text: 'Ingrese un monto mayor a cero.' });

        let totalAdeudadoEnMoneda = round2(esExt ? subtotalUsd : totalBsItem);
        let cantidadAPagar = Math.min(montoIngresado, totalAdeudadoEnMoneda);
        let vuelto = montoIngresado > totalAdeudadoEnMoneda ? (esExt ? round2(montoIngresado * tasaActual - totalBsItem) : round2(montoIngresado - totalAdeudadoEnMoneda)) : 0;

        let totalBsFinal, totalUsdFinal;
        if (esExt) {
            totalUsdFinal = cantidadAPagar;
            totalBsFinal = round2(cantidadAPagar * tasaActual);
        } else {
            totalBsFinal = cantidadAPagar;
            totalUsdFinal = round2(cantidadAPagar / tasaActual);
        }

        const montoEsperadoBs = totalBsItem;
        const montoEsperadoUsd = round2(totalBsItem / tasaActual);

        const vueltoCheck = document.getElementById('parcial-vuelto-check');
        const vueltoMetodoSelect = document.getElementById('parcial-vuelto-metodo');
        const vueltoEntregado = vueltoCheck && vueltoCheck.checked && vuelto > 0;
        const vueltoMetodo = vueltoEntregado ? vueltoMetodoSelect.value : null;

        const precioUnitarioBsAbono = round2(totalBsItem / cant);

        const exito = await window.parent.electronAPI.db.registrarAbonoMultiple(
            fiadoAbiertoId,
            [{
                detalle_id: detalleItemAbierto,
                cantidad: cant,
                precio_unitario_bs: precioUnitarioBsAbono
            }],
            metodo,
            totalBsFinal,
            totalUsdFinal,
            montoIngresado,
            vuelto,
            vueltoEntregado,
            vueltoMetodo,
            fiadoAbiertoNombre,
            montoEsperadoBs,
            montoEsperadoUsd
        );
        if (exito) {
            if (vueltoEntregado && vuelto > 0) {
                await registrarGastoVuelto(vuelto, vueltoMetodo);
            }
            window.parent.Swal.fire({ icon: 'success', title: 'Cobro Registrado', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
            cerrarModalAccion();
            await refrescarContenidoDetalle();
        } else {
            window.parent.Swal.fire({ icon: 'error', title: 'Fallo', text: 'No se pudo procesar el pago parcial.', toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
        }
    } catch (error) {
        window.parent.Swal.fire({ icon: 'error', title: 'Error', text: error.message, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
    }
}

Object.assign(window, {
    cerrarModalDetalle, aplicarPorcentaje, abrirModalAgregarProd, abrirModalPagoTotal, cerrarModalAccion,
    editarCantidadItem, eliminarCargo, enviarCobroWhatsApp, ejecutarPagoTotal, ejecutarAgregarProd,
    abrirModalPagoMultiple, abrirModalPagoParcial, agregarFilaPagoMixtoFiado, borrarPagoMixtoFiado,
    confirmarPagoMixtoFiado, cerrarModalPagoMixtoFiado, abrirModalHistorialAbonos, cerrarModalHistorialAbonos
});

initFiados();