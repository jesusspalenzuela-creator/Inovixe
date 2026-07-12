const domContainer = document.getElementById('clientes-container');
const domBuscar = document.getElementById('buscar-cliente');
let historialActual = [];
let clienteEditandoId = null;
let clienteEditandoNombreOriginal = null;
let tasaBCVActual = 1.0;
let mapaProductosPeso = {};

const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
}

function formatearExactoCliente(valor) {
    if (isNaN(valor)) return '0,00';
    const redondeado = round2(valor);
    let str = redondeado.toString();
    let partes = str.split('.');
    let entero = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    let decimal = partes[1] || '00';
    if (decimal.length === 1) decimal += '0';
    return entero + ',' + decimal;
}

function formatUSD(value) {
    return value.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatearBs(valor) {
    return valor.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatearMontoRecibidoVisual(valor, esExtranjero) {
    if (isNaN(valor)) return '0,00';
    if (esExtranjero) {
        let str = valor.toFixed(2);
        str = str.replace('.', ',');
        const partes = str.split(',');
        partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return partes.join(',');
    } else {
        return formatearBs(valor);
    }
}

function formatearVueltoPDF(vuelto, vueltoEntregado, vueltoMetodo, tasa) {
    if (!vueltoEntregado || !vuelto || vuelto <= 0) return '';
    const metodo = vueltoMetodo || 'Método no especificado';
    const esExt = esMetodoExtranjero(metodo);
    if (esExt) {
        const simbolo = obtenerSimboloMoneda(metodo);
        const valorConvertido = vuelto / (tasa > 0 ? tasa : 1);
        return `Vuelto en ${capitalizarMetodo(metodo)}: ${simbolo} ${formatearMontoExtranjeroVisual(valorConvertido)}`;
    } else {
        return `Vuelto en ${capitalizarMetodo(metodo)}: Bs ${formatearBs(vuelto)}`;
    }
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

function esMetodoExtranjero(metodo) {
    const extranjeros = ['Divisas-USD', 'Zelle', 'Zinli', 'Binance-USDT', 'Binance-USDC'];
    return extranjeros.some(m => metodo.includes(m));
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

function limpiarTextoPDF(texto) {
    return texto.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2500}-\u{25FF}]|[\u{2B00}-\u{2BFF}]|[\u{FE00}-\u{FEFF}]|[\u{200D}]|[\u{200B}]/gu, '')
                .replace(/[^\x00-\x7FáéíóúüñÁÉÍÓÚÜÑ]/g, '')
                .trim();
}

function limpiarMetodoNombre(metodo) {
    if (!metodo) return '';
    return metodo.replace(/~[\d.,]+$/, '').trim();
}

function limpiarMetodo(metodo) {
    if (!metodo) return '';
    const indice = metodo.indexOf('|');
    if (indice !== -1) {
        return metodo.substring(0, indice);
    }
    return metodo;
}

function capitalizarMetodo(str) {
    if (!str) return '';
    let resultado = str.toLowerCase();
    resultado = resultado.charAt(0).toUpperCase() + resultado.slice(1);
    resultado = resultado.replace(/\b(bs|usd|usdt|usdc)\b/gi, match => match.toUpperCase());
    resultado = resultado.replace(/\b(bcv)\b/gi, 'BCV');
    return resultado;
}

function aplicarFormatoOracion(str) {
    return capitalizarMetodo(str);
}

async function initClientes() {
    const style = document.createElement('style');
    style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        #modal-historial .card-premium {
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
            width: 1100px !important;
            max-width: 95vw !important;
            padding: 24px !important;
        }
        #hist-container .hist-card {
            border-radius: 10px;
            overflow: hidden;
        }
        #hist-container .hist-card table {
            border-radius: 0 !important;
        }
        #hist-container .hist-card td, #hist-container .hist-card th {
            border-radius: 0 !important;
        }
        #hist-container .hist-card .total-block {
            border-left: 4px solid #001f3f;
            border-radius: 0 !important;
            background-color: #f8f9fa;
        }
        #hist-container .hist-card .total-block > div {
            border-radius: 0 !important;
        }
    `;
    document.head.appendChild(style);

    try {
        const tasa = await window.parent.electronAPI.db.obtenerConfig("tasa_usd");
        tasaBCVActual = tasa ? parseFloat(tasa) : 1.0;
    } catch(e) { tasaBCVActual = 1.0; }

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

    domBuscar.addEventListener('keyup', () => cargarClientes(domBuscar.value));
    await cargarClientes('');
}

async function cargarClientes(filtro) {
    try {
        const clientes = await window.parent.electronAPI.db.buscarClientes(filtro);
        if (!clientes || !clientes.length) {
            domContainer.innerHTML = '<p class="text-center text-slate-500 mt-10 text-[13px]">No se encontraron clientes.</p>';
            document.getElementById('clientes-count').textContent = '0 clientes';
            return;
        }
        let html = '';
        for (const c of clientes) {
            const esEventual = c.nombre === 'CLIENTE EVENTUAL';
            let telefonoHtml = '';
            if (esEventual) {
                telefonoHtml = '<span class="text-slate-400 italic">No aplica</span>';
            } else if (c.telefono && c.telefono !== 'S/D') {
                telefonoHtml = `<span class="text-slate-700 font-medium">${escapeHtml(c.telefono)}</span>`;
            } else {
                telefonoHtml = '<span class="text-slate-400 italic">Sin registrar</span>';
            }
            const nombreEscapado = escapeHtml(c.nombre).replace(/'/g, "\\'");
            const telefonoEscapado = escapeHtml(c.telefono || '').replace(/'/g, "\\'");
            const inicial = escapeHtml(c.nombre.charAt(0).toUpperCase());
            const btnEditar = esEventual ? '' : `<button onclick="abrirModalEditarCliente(${c.id}, '${nombreEscapado}', '${telefonoEscapado}')" class="action-btn btn-editar"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>Editar</button>`;
            const btnEliminar = esEventual ? '' : `<button onclick="eliminarCliente(${c.id})" class="action-btn btn-eliminar"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>Eliminar</button>`;
            html += `
            <div class="client-card" style="animation-delay: ${clientes.indexOf(c) * 0.05}s">
                <div class="avatar">${inicial}</div>
                <div class="flex-1 min-w-0">
                    <h3 class="text-[15px] font-bold text-slate-800 truncate">${escapeHtml(c.nombre)}</h3>
                    <div class="flex items-center gap-1.5 mt-0.5">
                        <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                        ${telefonoHtml}
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <button onclick="verHistorial('${nombreEscapado}')" class="action-btn btn-historial"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Historial</button>
                    ${btnEditar}
                    ${btnEliminar}
                </div>
            </div>`;
        }
        domContainer.innerHTML = html;
        document.getElementById('clientes-count').textContent = `${clientes.length} cliente(s)`;
    } catch (error) {
        console.error(error);
        domContainer.innerHTML = '<p class="text-center text-red-500 mt-10 text-[13px]">Error al cargar clientes.</p>';
    }
}

async function verHistorial(nombre) {
    const nombreExacto = nombre.trim().toUpperCase();
    document.getElementById('hist-titulo').textContent = `HISTORIAL DE COMPRAS: ${escapeHtml(nombreExacto)}`;
    try {
        const historialRaw = await window.parent.electronAPI.db.obtenerComprasCliente(nombreExacto);

        const fiadosPendientesDB = await window.parent.electronAPI.db.buscarFiados(nombreExacto);
        const fiadosExactos = fiadosPendientesDB
            ? fiadosPendientesDB.filter(f => f.cliente.trim().toUpperCase() === nombreExacto)
            : [];

        if (fiadosExactos.length > 0) {
            for (const f of fiadosExactos) {
                const detallesSum = await window.parent.electronAPI.db.ejecutarConsulta(
                    "SELECT SUM(cantidad * precio_unitario) as total_bs_real FROM fiados_detalle WHERE fiado_id = ? AND cantidad > 0",
                    [f.id]
                );
                const totalBsReal = detallesSum.length > 0 ? (detallesSum[0].total_bs_real || 0) : 0;
                const tasaOrig = f.tasa_momento > 0 ? f.tasa_momento : tasaBCVActual;
                const total_usd = round2(totalBsReal / tasaOrig);
                const total_bs_actualizado = round2(total_usd * tasaBCVActual);
                const yaExiste = historialRaw.some(v => v.id === f.id && v.metodo === 'PENDIENTE (FIADO)');
                if (yaExiste) {
                    const idx = historialRaw.findIndex(v => v.id === f.id && v.metodo === 'PENDIENTE (FIADO)');
                    if (idx !== -1) {
                        historialRaw[idx].total_bs = total_bs_actualizado;
                        historialRaw[idx].total_usd = total_usd;
                    }
                } else {
                    historialRaw.unshift({
                        id: f.id,
                        fecha: f.fecha || '',
                        total_bs: total_bs_actualizado,
                        total_usd: total_usd,
                        metodo: 'PENDIENTE (FIADO)',
                        cliente: f.cliente,
                        tasa_momento: f.tasa_momento,
                        detalle_productos: f.detalle_productos || '',
                        vuelto: 0,
                        vuelto_entregado: 0,
                        vuelto_metodo: '',
                        monto_recibido: 0,
                        monto_esperado_bs: 0,
                        monto_esperado_usd: 0
                    });
                }
            }
        }

        const grupos = {};
        for (const v of historialRaw) {
            let key;
            if (v.metodo === 'PENDIENTE (FIADO)') {
                key = `fiado_${v.id}_${v.fecha}`;
            } else {
                key = `venta_${v.cliente}_${v.fecha}_${v.productos}`;
            }
            if (!grupos[key]) {
                grupos[key] = {
                    ...v,
                    metodosAgrupados: [{ nombre: v.metodo, bs: v.total_bs, usd: v.total_usd }],
                    esMixto: false,
                    esFiado: v.metodo === 'PENDIENTE (FIADO)'
                };
            } else {
                grupos[key].metodosAgrupados.push({ nombre: v.metodo, bs: v.total_bs, usd: v.total_usd });
                grupos[key].esMixto = true;
                grupos[key].total_bs = round2((grupos[key].total_bs || 0) + v.total_bs);
                grupos[key].total_usd = round2((grupos[key].total_usd || 0) + v.total_usd);

                if (!grupos[key].vuelto && v.vuelto) {
                    grupos[key].vuelto = v.vuelto;
                    grupos[key].vuelto_entregado = v.vuelto_entregado;
                    grupos[key].vuelto_metodo = v.vuelto_metodo || '';
                }
                if (v.fecha > grupos[key].fecha) {
                    grupos[key].fecha = v.fecha;
                }
            }
        }

        historialActual = Object.values(grupos).filter(v => !v.esFiado || v.total_bs > 0);

        const fiados = historialActual.filter(v => v.esFiado);
        const noFiados = historialActual.filter(v => !v.esFiado)
            .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

        const fiadoFijo = fiados.length > 0 ? fiados[0] : null;
        const ventasMostrar = noFiados.slice(0, 10);
        const historialMostrar = fiadoFijo ? [fiadoFijo, ...ventasMostrar] : ventasMostrar;

        historialMostrar.forEach(v => {
            v.__originalIndex = historialActual.indexOf(v);
        });

        const container = document.getElementById('hist-container');
        container.innerHTML = '';
        if (!historialMostrar.length) {
            container.innerHTML = '<p class="text-center py-10 text-slate-400">Sin historial registrado.</p>';
        } else {
            for (let i = 0; i < historialMostrar.length; i++) {
                const v = historialMostrar[i];
                const isFiado = v.esFiado;
                let isMixto = v.esMixto || (v.metodosAgrupados.length > 1);
                if (!isMixto && v.metodosAgrupados.length === 1 && v.metodosAgrupados[0].nombre.includes('Mixto:')) {
                    isMixto = true;
                }
                const [fechaSol, horaSol] = (v.fecha || '').split(' ');

                // ✅ Si el crédito ya fue pagado, recuperar los productos originales desde la BD
                if (isFiado && v.pagado) {
                    try {
                        const detallesOriginales = await window.parent.electronAPI.db.getDetalleFiado(v.id);
                        if (detallesOriginales && detallesOriginales.length) {
                            const tasaOrig = v.tasa_momento > 0 ? v.tasa_momento : tasaBCVActual;
                            v.detalle_productos = detallesOriginales.map(d => {
                                const precioUsd = d.precio_unitario / tasaOrig;
                                return `${d.nombre_prod}|${d.cantidad}|${d.precio_unitario}|${precioUsd.toFixed(2)}|0|PAGADO`;
                            }).join(';;');
                        }
                    } catch(e) {}
                }

                const productosRaw = (v.detalle_productos || '').split(';;').filter(p => p);
                const productos = productosRaw.map(p => {
                    const partes = p.split('|');
                    if (partes.length === 5) {
                        return {
                            nombre: partes[0],
                            cantidad: parseFloat(partes[1]),
                            precioBs: parseFloat(partes[2]),
                            precioUsd: parseFloat(partes[3]) || 0,
                            cantidadAbonada: 0,
                            estado: partes[4]
                        };
                    }
                    if (partes.length >= 6) {
                        return {
                            nombre: partes[0],
                            cantidad: parseFloat(partes[1]),
                            precioBs: parseFloat(partes[2]),
                            precioUsd: parseFloat(partes[3]) || 0,
                            cantidadAbonada: parseFloat(partes[4]) || 0,
                            estado: partes[5] || 'PENDIENTE'
                        };
                    } else if (partes.length >= 4) {
                        return {
                            nombre: partes[0],
                            cantidad: parseFloat(partes[1]),
                            precioBs: parseFloat(partes[2]),
                            precioUsd: parseFloat(partes[3]) || 0,
                            cantidadAbonada: 0,
                            estado: 'PAGADO'
                        };
                    } else if (partes.length >= 3) {
                        return {
                            nombre: partes[0],
                            cantidad: parseFloat(partes[1]),
                            precioBs: parseFloat(partes[2]),
                            precioUsd: 0,
                            cantidadAbonada: 0,
                            estado: 'PAGADO'
                        };
                    }
                    return { nombre: p, cantidad: 1, precioBs: 0, precioUsd: 0, cantidadAbonada: 0, estado: 'PAGADO' };
                });

                let tasaVenta = v.tasa_momento > 0 ? parseFloat(v.tasa_momento) : 1;
                let totalUsdReal = 0;
                let montoEsperadoBs = 0;
                let montoEsperadoUsd = 0;

                let productosHTML = `
                <table class="w-full text-xs" style="border-collapse: collapse;">
                    <thead style="background-color: #001f3f; color: white;">
                        <tr>
                            <th style="text-align: left; padding: 10px 12px; font-weight: 600;">Producto</th>
                            <th style="text-align: center; padding: 10px 4px; width: 60px; font-weight: 600;">Cant</th>
                            <th style="text-align: right; padding: 10px 12px; width: 120px; font-weight: 600;">Precio Bs</th>
                            <th style="text-align: right; padding: 10px 12px; width: 100px; font-weight: 600;">Precio $</th>
                            <th style="text-align: right; padding: 10px 12px; width: 120px; font-weight: 600;">Subtotal Bs</th>
                            <th style="text-align: right; padding: 10px 12px; width: 100px; font-weight: 600;">Subtotal $</th>
                        </tr>
                    </thead>
                    <tbody style="background-color: white;">`;

                for (const prod of productos) {
                    const precioUsd = prod.precioUsd || 0;
                    const precioUsdStr = formatUSD(precioUsd);

                    let cantidadMostrar = prod.cantidad;
                    let cantidadOriginal = prod.cantidad;
                    if (isFiado || v.esAbono) {
                        cantidadOriginal = prod.cantidad + (prod.cantidadAbonada || 0);
                        cantidadMostrar = cantidadOriginal;
                    }

                    let subtotalBs;
                    if (isFiado) {
                        const subtotalUsd = round2(cantidadMostrar * precioUsd);
                        subtotalBs = round2(subtotalUsd * tasaBCVActual);
                    } else {
                        subtotalBs = round2(cantidadMostrar * prod.precioBs);
                    }

                    const subtotalUsd = cantidadMostrar * precioUsd;
                    totalUsdReal += subtotalUsd;

                    if (isFiado) {
                        montoEsperadoBs += cantidadOriginal * prod.precioBs;
                    } else {
                        montoEsperadoBs += subtotalBs;
                    }

                    let rowStyle = '';
                    if (isFiado && prod.nombre.toUpperCase().includes('CARGO ADICIONAL')) {
                        rowStyle = 'background-color: #fff8e1;';
                    } else if (isFiado && prod.estado === 'PAGADO') {
                        rowStyle = 'background-color: #fef2f2;';
                    } else if (isFiado && prod.estado === 'ABONADO') {
                        rowStyle = 'background-color: #fff7ed;';
                    } else if (!isFiado && prod.estado === 'ABONADO') {
                        rowStyle = 'background-color: #fef9e7;';
                    }

                    let cantidadVisual = `x${cantidadMostrar}`;
                    let precioBsVisual = `Bs ${formatearBs(prod.precioBs)}`;
                    let precioUsdVisual = `$ ${precioUsdStr}`;

                    if (mapaProductosPeso[prod.nombre]) {
                        const peso = cantidadMostrar;
                        cantidadVisual = (peso % 1 === 0) ? peso + ' kg' : peso.toFixed(3) + ' kg';
                        precioBsVisual = `Bs ${formatearBs(prod.precioBs)}/kg`;
                        precioUsdVisual = `$ ${precioUsdStr}/kg`;
                    }

                    productosHTML += `
                    <tr style="${rowStyle}">
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e9ecef;">
                            <span style="font-weight: 500; color: #212529;">${escapeHtml(prod.nombre)}</span>
                            ${(() => {
                                if (prod.estado === 'PAGADO') {
                                    return `<div style="font-size: 10px; color: #dc3545; font-weight: 600;">PAGADO</div>`;
                                }
                                if (prod.estado === 'ABONADO') {
                                    const esPeso = mapaProductosPeso[prod.nombre] !== undefined;
                                    const texto = esPeso ? 'Abonado' : `Abonado: ${prod.cantidadAbonada} de ${cantidadOriginal}`;
                                    return `<div style="font-size: 10px; color: #dc3545; font-weight: 600;">${texto}</div>`;
                                }
                                return '';
                            })()}
                        </td>
                        <td style="text-align: center; padding: 8px 4px; border-bottom: 1px solid #e9ecef; color: #6c757d;">${cantidadVisual}</td>
                        <td style="text-align: right; padding: 8px 12px; border-bottom: 1px solid #e9ecef; color: #495057;">${precioBsVisual}</td>
                        <td style="text-align: right; padding: 8px 12px; border-bottom: 1px solid #e9ecef; color: #6c757d;">${precioUsdVisual}</td>
                        <td style="text-align: right; padding: 8px 12px; border-bottom: 1px solid #e9ecef; font-weight: 600; color: #212529;">Bs ${formatearBs(subtotalBs)}</td>
                        <td style="text-align: right; padding: 8px 12px; border-bottom: 1px solid #e9ecef; font-weight: 700; color: #001f3f;">$ ${formatUSD(subtotalUsd)}</td>
                    </tr>`;
                }
                productosHTML += `</tbody></table>`;

                montoEsperadoUsd = round2(montoEsperadoBs / (isFiado ? tasaBCVActual : tasaVenta));

                if (!isFiado && v.total_bs === 0 && v.total_usd > 0) {
                    montoEsperadoBs = round2(v.total_usd * tasaVenta);
                    montoEsperadoUsd = round2(montoEsperadoBs / tasaVenta);
                }

                // ✅ CORRECCIÓN FINAL: solo para ventas simples en bolívares (no mixtas, no créditos, no abonos)
                if (!isFiado && !isMixto && v.total_bs > 0 && !v.esAbono) {
                    montoEsperadoBs = v.total_bs;
                    montoEsperadoUsd = round2(v.total_bs / tasaVenta);
                }

                let metodoVisual = '';
                if (isMixto && v.metodosAgrupados && v.metodosAgrupados.length > 0) {
                    let nombresMetodos = [];
                    for (const m of v.metodosAgrupados) {
                        let nombre = m.nombre.replace('Abono Fiado: ', '').replace('Pago Fiado: ', '').replace('Cobro Fiado: ', '');
                        nombre = limpiarMetodoNombre(nombre);
                        if (nombre.includes('|')) {
                            const partes = nombre.split('|');
                            if (partes.length > 1) {
                                const cabecera = partes[0];
                                if (cabecera.includes('Mixto:')) {
                                    const metodosStr = cabecera.replace('Mixto:', '').trim();
                                    const metodos = metodosStr.split('+').map(s => capitalizarMetodo(s.trim()));
                                    nombresMetodos.push(...metodos);
                                } else {
                                    nombresMetodos.push(capitalizarMetodo(cabecera));
                                }
                            }
                        } else {
                            if (nombre.includes('Mixto:')) {
                                let resto = nombre.replace('Mixto:', '').trim();
                                let metodos = resto.split('+').map(s => capitalizarMetodo(s.trim()));
                                nombresMetodos.push(...metodos);
                            } else {
                                nombresMetodos.push(capitalizarMetodo(nombre));
                            }
                        }
                    }
                    metodoVisual = `Mixto: ${nombresMetodos.join(' + ')}`;
                } else if (v.metodosAgrupados && v.metodosAgrupados.length === 1) {
                    let nombreLimpio = v.metodosAgrupados[0].nombre.replace('Abono Fiado: ', '').replace('Pago Fiado: ', '').replace('Cobro Fiado: ', '');
                    nombreLimpio = limpiarMetodoNombre(nombreLimpio);
                    if (nombreLimpio.includes('|')) nombreLimpio = nombreLimpio.split('|')[0];
                    metodoVisual = capitalizarMetodo(nombreLimpio);
                } else {
                    metodoVisual = v.metodo;
                    if (metodoVisual.includes('|')) metodoVisual = metodoVisual.split('|')[0];
                    metodoVisual = capitalizarMetodo(metodoVisual);
                }
                if (isFiado) metodoVisual = 'CRÉDITO PENDIENTE';

                let montoRecibido = v.monto_recibido ? parseFloat(v.monto_recibido) : 0;
                let vuelto = v.vuelto ? parseFloat(v.vuelto) : 0;
                let vueltoMetodo = v.vuelto_metodo || '';
                vueltoMetodo = capitalizarMetodo(vueltoMetodo);
                let monedaPago = 'Bs';
                let esExtranjeroUnico = false;

                if (!isMixto && v.metodosAgrupados && v.metodosAgrupados.length === 1) {
                    const metodoUnico = v.metodosAgrupados[0].nombre;
                    if (!metodoUnico.includes('Mixto:')) {
                        esExtranjeroUnico = esMetodoExtranjero(metodoUnico);
                        if (esExtranjeroUnico) monedaPago = obtenerSimboloMoneda(metodoUnico);
                    }
                }

                const btnDescarga = isFiado ? '<span style="padding: 6px 12px; color: #6c757d; font-size: 10px; font-weight: 600; text-transform: uppercase; font-style: italic;">Pendiente</span>' : `<button onclick="descargarFacturaPDF(${v.__originalIndex})" style="padding: 6px 12px; background-color: #f8f9fa; border: 1px solid #dee2e6; color: #001f3f; font-weight: 600; border-radius: 6px; cursor: pointer; font-size: 10px;">📄 PDF</button>`;

                let totalesHTML = '';
                if (isFiado) {
                    const deudaUsd = round2(v.total_bs / tasaBCVActual);
                    totalesHTML = `
                    <div style="margin-top: 16px; border-left: 4px solid #001f3f; background-color: #f8f9fa; padding: 16px 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 10px; font-weight: 600; color: #dc3545; text-transform: uppercase;">Deuda pendiente</span>
                            <div style="text-align: right;">
                                <span style="font-size: 14px; font-weight: 800; color: #dc3545;">Bs ${formatearBs(v.total_bs)}</span>
                                <span style="font-size: 11px; color: #dc3545; margin-left: 8px;">(${formatUSD(deudaUsd)} USD BCV)</span>
                            </div>
                        </div>
                    </div>`;
                } else if (isMixto) {
                    let metodosHTML = '';
                    for (const m of v.metodosAgrupados) {
                        let nombreLimpio = m.nombre.replace('Abono Fiado: ', '').replace('Pago Fiado: ', '').replace('Cobro Fiado: ', '');
                        nombreLimpio = limpiarMetodoNombre(nombreLimpio);
                        if (nombreLimpio.includes('|')) {
                            const partes = nombreLimpio.split('|');
                            for (let i = 1; i < partes.length; i++) {
                                const par = partes[i];
                                const [metodoInd, valorStr] = par.split(':');
                                if (metodoInd && valorStr) {
                                    const valorNum = parseFloat(valorStr);
                                    if (!isNaN(valorNum)) {
                                        const metodoCapitalizado = capitalizarMetodo(metodoInd);
                                        const esExt = esMetodoExtranjero(metodoInd);
                                        if (esExt) {
                                            const simbolo = obtenerSimboloMoneda(metodoInd);
                                            metodosHTML += `<div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;"><span style="color: #495057;">${metodoCapitalizado}:</span><span style="font-weight: 600;">${simbolo} ${formatearMontoExtranjeroVisual(valorNum)}</span></div>`;
                                        } else {
                                            metodosHTML += `<div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;"><span style="color: #495057;">${metodoCapitalizado}:</span><span style="font-weight: 600;">Bs ${formatearBs(valorNum)}</span></div>`;
                                        }
                                    }
                                }
                            }
                        } else {
                            const metodoCapitalizado = capitalizarMetodo(nombreLimpio);
                            const esExt = esMetodoExtranjero(nombreLimpio);
                            if (esExt) {
                                const simbolo = obtenerSimboloMoneda(nombreLimpio);
                                metodosHTML += `<div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;"><span style="color: #495057;">${metodoCapitalizado}:</span><span style="font-weight: 600;">${simbolo} ${formatearMontoExtranjeroVisual(m.usd)}</span></div>`;
                            } else {
                                metodosHTML += `<div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;"><span style="color: #495057;">${metodoCapitalizado}:</span><span style="font-weight: 600;">Bs ${formatearBs(m.bs)}</span></div>`;
                            }
                        }
                    }
                    totalesHTML = `
                    <div style="margin-top: 16px; border-left: 4px solid #001f3f; background-color: #f8f9fa; padding: 16px 20px;">
                        <div style="font-size: 10px; font-weight: 600; color: #001f3f; text-transform: uppercase; margin-bottom: 8px;">Pago desglosado</div>
                        ${metodosHTML}
                        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #dee2e6; padding-top: 8px;">
                            <span style="font-size: 10px; font-weight: 600; color: #001f3f; text-transform: uppercase;">Monto esperado</span>
                            <span style="font-size: 12px; font-weight: 700; color: #212529;">Bs ${formatearBs(montoEsperadoBs)} / ${formatUSD(montoEsperadoUsd)} $</span>
                        </div>
                    </div>`;
                } else {
                    const esperadoBimonetario = `Bs ${formatearBs(montoEsperadoBs)} / ${formatUSD(montoEsperadoUsd)} $`;
                    if (montoRecibido > 0) {
                        let recibidoTexto = '';
                        if (esExtranjeroUnico) {
                            const simbolo = monedaPago === '$' ? '$' : monedaPago;
                            recibidoTexto = `${simbolo} ${formatearMontoExtranjeroVisual(montoRecibido)}`;
                        } else {
                            recibidoTexto = `Bs ${formatearMontoRecibidoVisual(montoRecibido, false)}`;
                        }

                        let vueltoTexto = '';
                        if (v.vuelto_entregado && v.vuelto > 0) {
                            const esVueltoExt = esMetodoExtranjero(vueltoMetodo);
                            if (esVueltoExt) {
                                const simboloV = obtenerSimboloMoneda(vueltoMetodo);
                                const valorConvertido = v.vuelto / (tasaVenta > 0 ? tasaVenta : 1);
                                vueltoTexto = `Vuelto en ${capitalizarMetodo(vueltoMetodo)}: ${simboloV} ${formatearMontoExtranjeroVisual(valorConvertido)}`;
                            } else {
                                vueltoTexto = `Vuelto en ${capitalizarMetodo(vueltoMetodo || 'Método no especificado')}: Bs ${formatearBs(v.vuelto)}`;
                            }
                        }

                        totalesHTML = `
                        <div style="margin-top: 16px; border-left: 4px solid #001f3f; background-color: #f8f9fa; padding: 16px 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="font-size: 10px; font-weight: 600; color: #001f3f; text-transform: uppercase;">Recibido</span>
                                <span style="font-size: 12px; font-weight: 700; color: #212529;">${recibidoTexto}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #dee2e6; padding-top: 8px;">
                                <span style="font-size: 10px; font-weight: 600; color: #001f3f; text-transform: uppercase;">Monto esperado</span>
                                <span style="font-size: 12px; font-weight: 700; color: #212529;">${esperadoBimonetario}</span>
                            </div>
                            ${vueltoTexto ? `
                            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #dee2e6; padding-top: 8px;">
                                <span style="font-size: 10px; font-weight: 600; color: #dc3545; text-transform: uppercase;">Vuelto</span>
                                <span style="font-size: 12px; font-weight: 700; color: #dc3545;">${vueltoTexto}</span>
                            </div>` : ''}
                        </div>`;
                    } else {
                        totalesHTML = `
                        <div style="margin-top: 16px; border-left: 4px solid #001f3f; background-color: #f8f9fa; padding: 16px 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 10px; font-weight: 600; color: #001f3f; text-transform: uppercase;">Monto esperado</span>
                                <span style="font-size: 12px; font-weight: 700; color: #212529;">${esperadoBimonetario}</span>
                            </div>
                        </div>`;
                    }
                }

                if (!isFiado && vuelto > 0 && montoRecibido <= 0) {
                    const esVueltoExt = esMetodoExtranjero(vueltoMetodo);
                    let vueltoTextoExtra;
                    if (esVueltoExt) {
                        const vueltoForeign = vuelto / tasaVenta;
                        const simbolo = obtenerSimboloMoneda(vueltoMetodo);
                        vueltoTextoExtra = `Vuelto en ${capitalizarMetodo(vueltoMetodo)}: ${simbolo} ${formatearMontoExtranjeroVisual(vueltoForeign)}`;
                    } else {
                        vueltoTextoExtra = `Vuelto en ${capitalizarMetodo(vueltoMetodo || 'Método no especificado')}: Bs ${formatearBs(vuelto)}`;
                    }
                    totalesHTML += `
                    <div style="margin-top: 8px; border-left: 4px solid #dc3545; background-color: #fff5f5; padding: 8px 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 10px; font-weight: 600; color: #dc3545; text-transform: uppercase;">Vuelto</span>
                            <span style="font-size: 12px; font-weight: 700; color: #dc3545;">${vueltoTextoExtra}</span>
                        </div>
                    </div>`;
                }

                const cardBg = isFiado ? '#fff5f5' : 'white';
                const cardBorder = isFiado ? '#fecaca' : '#dee2e6';

                container.innerHTML += `
                <div class="hist-card" style="background: ${cardBg}; border: 1px solid ${cardBorder}; border-radius: 10px; overflow: hidden; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <div style="background: linear-gradient(135deg, #001f3f 0%, #003366 100%); padding: 14px 20px; display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 16px;">
                            <span style="font-size: 12px; font-weight: 600; color: white;">📅 ${escapeHtml(fechaSol || '')}</span>
                            <span style="font-size: 12px; color: rgba(255,255,255,0.8);">${escapeHtml(horaSol || '')}</span>
                            <span style="font-size: 11px; font-weight: 600; color: white; background: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 4px;">${escapeHtml(metodoVisual)}</span>
                            ${!isFiado ? `<span style="font-size: 11px; color: rgba(255,255,255,0.7);">Tasa BCV: Bs ${formatearBs(tasaVenta)}</span>` : ''}
                        </div>
                        ${btnDescarga}
                    </div>
                    <div style="padding: 16px;">
                        ${productosHTML}
                        ${totalesHTML}
                    </div>
                </div>`;
            }
        }
        document.getElementById('modal-historial').classList.remove('hidden');
    } catch (error) {
        console.error(error);
        window.parent.Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo cargar el historial' });
    }
}

async function descargarFacturaPDF(index) {
    const f = historialActual[index];
    if (!f || f.esFiado) return window.parent.Swal.fire({ icon: 'info', title: 'Aviso', text: 'Los créditos pendientes no generan factura hasta que sean cancelados.' });
    window.parent.Swal.fire({ title: 'Generando recibo...', didOpen: () => window.parent.Swal.showLoading() });
    const doc = new window.jspdf.jsPDF();
    const clienteNombreRaw = document.getElementById('hist-titulo').textContent.replace('HISTORIAL DE COMPRAS: ', '').trim();
    const clienteNombre = limpiarTextoPDF(clienteNombreRaw);
    const [fechaSol, horaSol] = (f.fecha || '').split(' ');
    const tasaVenta = f.tasa_momento > 0 ? parseFloat(f.tasa_momento) : 1;
    let esPagoMixto = f.esMixto;
    let esExtranjeroUnicoPDF = false;
    let monedaPagoPDF = 'Bs';
    let metodoPagoLimpio = '';

    if (!f.esMixto && f.metodosAgrupados && f.metodosAgrupados.length === 1) {
        const metodoUnico = f.metodosAgrupados[0].nombre;
        if (!metodoUnico.includes('Mixto:')) {
            esExtranjeroUnicoPDF = esMetodoExtranjero(metodoUnico);
            if (esExtranjeroUnicoPDF) monedaPagoPDF = obtenerSimboloMoneda(metodoUnico);
            metodoPagoLimpio = limpiarTextoPDF(capitalizarMetodo(limpiarMetodoNombre(metodoUnico.replace('Abono Fiado: ', '').replace('Pago Fiado: ', '').replace('Cobro Fiado: ', ''))));
        } else {
            esPagoMixto = true;
        }
    } else {
        esPagoMixto = true;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 31, 63);
    doc.text('RECIBO DE PAGO', 14, 22);
    doc.setDrawColor(0, 31, 63);
    doc.setLineWidth(0.5);
    doc.line(14, 26, 196, 26);

    doc.setFontSize(10);
    doc.setTextColor(60);
    doc.text(`FECHA: ${fechaSol || ''}  ${horaSol || ''}`, 14, 34);
    doc.text(`CLIENTE: ${clienteNombre}`, 14, 40);
    let metodoVisual = '';
    if (esPagoMixto) {
        let nombresMetodos = [];
        for (const m of f.metodosAgrupados) {
            let nombre = m.nombre.replace('Abono Fiado: ', '').replace('Pago Fiado: ', '').replace('Cobro Fiado: ', '');
            nombre = limpiarMetodoNombre(nombre);
            if (nombre.includes('|')) nombre = nombre.split('|')[0];
            if (nombre.includes('Mixto:')) {
                let resto = nombre.replace('Mixto:', '').trim();
                let metodos = resto.split('+').map(s => capitalizarMetodo(s.trim()));
                nombresMetodos.push(...metodos);
            } else {
                nombresMetodos.push(capitalizarMetodo(nombre));
            }
        }
        metodoVisual = limpiarTextoPDF(`Mixto: ${nombresMetodos.join(' + ')}`);
    } else if (f.metodosAgrupados && f.metodosAgrupados.length === 1) {
        let nombreLimpio = f.metodosAgrupados[0].nombre.replace('Abono Fiado: ', '').replace('Pago Fiado: ', '').replace('Cobro Fiado: ', '');
        nombreLimpio = limpiarMetodoNombre(nombreLimpio);
        if (nombreLimpio.includes('|')) nombreLimpio = nombreLimpio.split('|')[0];
        metodoVisual = limpiarTextoPDF(capitalizarMetodo(nombreLimpio));
    } else {
        metodoVisual = limpiarTextoPDF(capitalizarMetodo(f.metodo));
    }
    doc.text(`METODO: ${metodoVisual}`, 14, 46);
    doc.text(`TASA BCV: Bs ${formatearBs(tasaVenta)}`, 14, 52);
    doc.setDrawColor(200);
    doc.line(14, 58, 196, 58);

    const productosRaw = (f.detalle_productos || '').split(';;').filter(p => p);
    const productosParaPDF = productosRaw.map(p => {
        const partes = p.split('|');
        const precioBs = parseFloat(partes[2]) || 0;
        const cantidad = parseFloat(partes[1]) || 0;
        const precioUsd = parseFloat(partes[3]) || 0;
        return {
            nombre: limpiarTextoPDF(partes[0]),
            cantidad,
            precioBs,
            precioUsd,
            subtotalBs: round2(cantidad * precioBs),
            subtotalUsd: cantidad * precioUsd
        };
    });
    let montoEsperadoBsPDF = round2(productosParaPDF.reduce((acc, prod) => acc + prod.subtotalBs, 0));
    if (montoEsperadoBsPDF === 0) montoEsperadoBsPDF = f.total_bs;
    const montoEsperadoUsdPDF = round2(productosParaPDF.reduce((acc, prod) => acc + prod.subtotalUsd, 0));

    if (f.total_bs === 0 && f.total_usd > 0) {
        montoEsperadoBsPDF = round2(f.total_usd * tasaVenta);
    }

    doc.autoTable({
        startY: 62,
        head: [['Producto', 'Cant', 'Precio Bs', 'Precio $', 'Subtotal Bs', 'Subtotal $']],
        body: productosParaPDF.map(prod => {
            let cantidadTexto = prod.cantidad.toString();
            let precioBsTexto = `Bs ${formatearBs(prod.precioBs)}`;
            let precioUsdTexto = `$ ${formatUSD(prod.precioUsd)}`;

            if (mapaProductosPeso[prod.nombre]) {
                const peso = prod.cantidad;
                cantidadTexto = (peso % 1 === 0) ? peso + ' kg' : peso.toFixed(3) + ' kg';
                precioBsTexto = `Bs ${formatearBs(prod.precioBs)}/kg`;
                precioUsdTexto = `$ ${formatUSD(prod.precioUsd)}/kg`;
            }

            return [
                prod.nombre,
                cantidadTexto,
                precioBsTexto,
                precioUsdTexto,
                `Bs ${formatearBs(prod.subtotalBs)}`,
                `$ ${formatUSD(prod.subtotalUsd)}`
            ];
        }),
        theme: 'striped',
        headStyles: { fillColor: [0, 31, 63], textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'left' },
        styles: { fontSize: 8, cellPadding: 3, lineColor: [220, 220, 220], lineWidth: 0.1 },
        columnStyles: {
            0: { cellWidth: 50, halign: 'left' },
            1: { cellWidth: 14, halign: 'center' },
            2: { cellWidth: 30, halign: 'right' },
            3: { cellWidth: 30, halign: 'right' },
            4: { cellWidth: 30, halign: 'right' },
            5: { cellWidth: 30, halign: 'right' }
        }
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    let ultimoY = finalY;
    const vueltoTexto = formatearVueltoPDF(f.vuelto, f.vuelto_entregado, f.vuelto_metodo, tasaVenta);

    if (esPagoMixto || f.esMixto) {
        const metodosPlanos = [];
        for (const m of f.metodosAgrupados) {
            let nombreLimpio = m.nombre.replace('Abono Fiado: ', '').replace('Pago Fiado: ', '').replace('Cobro Fiado: ', '');
            nombreLimpio = limpiarMetodoNombre(nombreLimpio);
            if (nombreLimpio.includes('|')) {
                const partes = nombreLimpio.split('|');
                for (let i = 1; i < partes.length; i++) {
                    const par = partes[i];
                    const [metodoInd, valorStr] = par.split(':');
                    if (metodoInd && valorStr) {
                        const valorNum = parseFloat(valorStr);
                        if (!isNaN(valorNum)) {
                            metodosPlanos.push({
                                metodo: limpiarTextoPDF(capitalizarMetodo(metodoInd)),
                                valor: valorNum,
                                esExt: esMetodoExtranjero(metodoInd)
                            });
                        }
                    }
                }
            } else {
                const esExt = esMetodoExtranjero(nombreLimpio);
                metodosPlanos.push({
                    metodo: limpiarTextoPDF(capitalizarMetodo(nombreLimpio)),
                    valor: esExt ? m.usd : m.bs,
                    esExt
                });
            }
        }

        const lineHeight = 6;
        let lineas = 2 + metodosPlanos.length + 1;
        if (vueltoTexto) lineas++;
        const alturaRect = lineas * lineHeight + 8;
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(0, 31, 63);
        doc.setLineWidth(0.8);
        doc.roundedRect(14, finalY, 188, alturaRect, 3, 3, 'FD');

        let y = finalY + 8;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 31, 63);
        doc.text('DETALLE DEL PAGO', 18, y);
        y += lineHeight + 2;

        doc.setFontSize(9);
        doc.setTextColor(40);
        for (const item of metodosPlanos) {
            const texto = item.esExt
                ? `${obtenerSimboloMoneda(item.metodo)} ${formatUSD(item.valor)}`
                : `Bs ${formatearBs(item.valor)}`;
            doc.text(`${limpiarTextoPDF(item.metodo)}: ${texto}`, 25, y);
            y += lineHeight;
        }

        doc.setFontSize(9);
        doc.setTextColor(40);
        doc.text(`Total esperado: Bs ${formatearBs(montoEsperadoBsPDF)} (${formatUSD(montoEsperadoUsdPDF)} USD)`, 18, y);
        y += lineHeight;

        if (vueltoTexto) {
            doc.setTextColor(220, 38, 38);
            doc.text(vueltoTexto, 18, y);
            y += lineHeight;
        }

        ultimoY = finalY + alturaRect;
    } else {
        const lineHeight = 7;
        let lineas = 1;
        if (f.monto_recibido > 0) lineas++;
        lineas++;
        if (vueltoTexto) lineas++;
        const alturaRect = lineas * lineHeight + 8;
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(0, 31, 63);
        doc.setLineWidth(0.8);
        doc.roundedRect(14, finalY, 188, alturaRect, 3, 3, 'FD');

        let y = finalY + 8;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 31, 63);
        doc.text('TOTAL CANCELADO', 18, y);
        y += lineHeight;

        if (f.monto_recibido > 0) {
            doc.setFontSize(10);
            doc.setTextColor(15, 23, 42);
            if (esExtranjeroUnicoPDF) {
                doc.text(`Recibido: ${monedaPagoPDF === '$' ? '$' : monedaPagoPDF} ${formatearMontoRecibidoVisual(f.monto_recibido, true)}`, 18, y);
                doc.setFontSize(7);
                doc.setTextColor(148, 163, 184);
                y += 4;
                doc.text(`Recibido en ${limpiarTextoPDF(metodoPagoLimpio)}`, 18, y);
            } else {
                doc.text(`Recibido: Bs ${formatearMontoRecibidoVisual(f.monto_recibido, false)}`, 18, y);
            }
            y += lineHeight;
        }

        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(`Total esperado: Bs ${formatearBs(montoEsperadoBsPDF)} (${formatUSD(montoEsperadoUsdPDF)} USD)`, 18, y);
        y += lineHeight;

        if (vueltoTexto) {
            doc.setFontSize(10);
            doc.setTextColor(220, 38, 38);
            doc.text(vueltoTexto, 18, y);
            y += lineHeight;
        }

        ultimoY = finalY + alturaRect;
    }

    doc.setFontSize(7);
    doc.setTextColor(180, 190, 200);
    doc.text(`Reporte generado: ${new Date().toLocaleString('es-VE')}`, 14, ultimoY + 12);

    const nombreArchivo = `Recibo_${clienteNombre.replace(/\s+/g, '_')}_${(fechaSol || '').replace(/\//g, '-')}.pdf`;
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    const result = await window.parent.electronAPI.utils.guardarPDF(nombreArchivo, pdfBase64);
    window.parent.Swal.close();
    if (result && result.success) {
        window.parent.Swal.fire({
            icon: 'success',
            title: '¡Recibo Descargado!',
            text: 'El recibo se guardó correctamente.',
            toast: true, position: 'top-end', showConfirmButton: false, timer: 3500
        });
    } else if (result && result.error) {
        window.parent.Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar el archivo.' });
    }
}

function cerrarModal() {
    document.getElementById('modal-historial').classList.add('hidden');
}

async function eliminarCliente(id) {
    const confirm = await window.parent.Swal.fire({
        title: '¿Eliminar Cliente?',
        text: "Se borrará del directorio. Su historial de ventas se mantendrá pero como 'Cliente Eventual'.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626'
    });
    if (confirm.isConfirmed) {
        try {
            await window.parent.electronAPI.db.eliminarCliente(id);
            window.parent.Swal.fire({ icon: 'success', title: 'Cliente eliminado', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
            cargarClientes(domBuscar.value);
        } catch (e) {
            window.parent.Swal.fire({ icon: 'error', title: 'Error', text: e.message });
        }
    }
}

function abrirModalNuevoCliente() {
    clienteEditandoId = null;
    clienteEditandoNombreOriginal = null;
    document.getElementById('modal-cli-titulo').textContent = 'NUEVO CLIENTE';
    document.getElementById('mod-cli-nombre').value = '';
    document.getElementById('mod-cli-tel').value = '';
    document.getElementById('modal-cliente').classList.remove('hidden');
}

function abrirModalEditarCliente(id, nombre, tel) {
    clienteEditandoId = id;
    clienteEditandoNombreOriginal = nombre;
    document.getElementById('modal-cli-titulo').textContent = 'EDITAR CLIENTE';
    document.getElementById('mod-cli-nombre').value = nombre;
    document.getElementById('mod-cli-tel').value = (tel === 'S/D' ? '' : tel);
    document.getElementById('modal-cliente').classList.remove('hidden');
}

function cerrarModalNuevoCliente() {
    document.getElementById('modal-cliente').classList.add('hidden');
}

async function guardarNuevoCliente() {
    const nombre = document.getElementById('mod-cli-nombre').value.trim().toUpperCase();
    const tel = document.getElementById('mod-cli-tel').value.trim() || 'S/D';
    if (!nombre) {
        return window.parent.Swal.fire({ icon: 'warning', title: 'Campo Requerido', text: 'El nombre es obligatorio' });
    }
    try {
        if (clienteEditandoId) {
            await window.parent.electronAPI.db.editarCliente(clienteEditandoId, clienteEditandoNombreOriginal, nombre, tel);
            window.parent.Swal.fire({ icon: 'success', title: 'Cliente actualizado', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        } else {
            await window.parent.electronAPI.db.agregarCliente(nombre, tel);
            window.parent.Swal.fire({ icon: 'success', title: 'Cliente registrado', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        }
        cerrarModalNuevoCliente();
        cargarClientes(domBuscar.value);
    } catch (e) {
        const mensajeLimpio = e.message.split('Error:').pop().trim();
        window.parent.Swal.fire({ icon: 'warning', title: 'Acción rechazada', text: mensajeLimpio });
    }
}

Object.assign(window, {
    verHistorial,
    cerrarModal,
    eliminarCliente,
    descargarFacturaPDF,
    abrirModalNuevoCliente,
    abrirModalEditarCliente,
    cerrarModalNuevoCliente,
    guardarNuevoCliente
});

initClientes();