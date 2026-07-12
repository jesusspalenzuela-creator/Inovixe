let carrito = [], tasa = 1.0, todosLosProductos = [], productosEncontrados = [], totalFinalBs = 0.0;
let clienteSeleccionadoLista = false, clientesBD = [], carritosEnEspera = [], pagosMixtos = [], cobroMixtoCompletado = false;
const METODOS_DIVISAS_BINANCE = ["Divisas-USD", "Zelle", "Zinli", "Binance-USDT", "Binance-USDC"];
const STORAGE_KEY_CARRITOS = 'inovix_carritos_espera';
const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
const round4 = (num) => Math.round((num + Number.EPSILON) * 10000) / 10000;
const round8 = (num) => Math.round((num + Number.EPSILON) * 1e8) / 1e8;

const domCliNom = document.getElementById('ventas-cli-nom');
const domCliTel = document.getElementById('ventas-cli-tel');
const domPanelSugerencias = document.getElementById('panel-sugerencias');
const domBuscar = document.getElementById('ventas-buscar');
const domComboProd = document.getElementById('ventas-combo-prod');
const domCant = document.getElementById('ventas-cant');
const domCarritoItems = document.getElementById('carrito-items');
const domLblTotalBs = document.getElementById('lbl-total-bs');
const domLblTotalUsd = document.getElementById('lbl-total-usd');
const modalPago = document.getElementById('modal-pago');
const modalResumenItems = document.getElementById('modal-resumen-items');
const panelPagoContainer = document.getElementById('panel-pago-container');
const btnConfirmarPagoModal = document.getElementById('btn-confirmar-pago-modal');
const modalCarritos = document.getElementById('modal-carritos');
const modalGastos = document.getElementById('modal-gastos');
const modalRedondeo = document.getElementById('modal-redondeo');

const modalEscaner = document.getElementById('modal-escaner');
const inputEscanner = document.getElementById('input-escaner');

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

function formatearBs(valor) { return formatearNumero(valor, 2) + ' Bs'; }
function formatearUsd(valor) { return valor.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $'; }
function formatearUsd4(valor) { return valor.toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' $'; }

function formatearMontoExtranjero(valor) {
    if (isNaN(valor)) return '0';
    const redondeado = Math.round(valor * 1e8) / 1e8;
    let str = redondeado.toFixed(8);
    str = str.replace(/\.?0+$/, '');
    if (!str.includes('.')) str += '.00';
    else {
        const partes = str.split('.');
        if (partes[1].length < 2) str = partes[0] + '.' + partes[1].padEnd(2, '0');
    }
    str = str.replace('.', ',');
    const partes = str.split(',');
    partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return partes.join(',');
}

function formatearInputExtranjero(valor) {
    if (isNaN(valor)) return '';
    const redondeado = Math.round(valor * 100) / 100;
    return redondeado.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function obtenerSimboloMoneda(metodo) {
    if (metodo.includes('USDT')) return 'USDT';
    if (metodo.includes('USDC')) return 'USDC';
    return '$';
}

function scrollAlFinal(selector, delay = 50) {
    setTimeout(() => {
        const elemento = document.querySelector(selector);
        if (elemento) elemento.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, delay);
}

(function() {
    try {
        const data = localStorage.getItem(STORAGE_KEY_CARRITOS);
        carritosEnEspera = data ? JSON.parse(data) : [];
    } catch(e) { carritosEnEspera = []; }
    document.getElementById('badge-carritos').textContent = carritosEnEspera.length;
})();

function guardarCarritosEnEspera() {
    localStorage.setItem(STORAGE_KEY_CARRITOS, JSON.stringify(carritosEnEspera));
    document.getElementById('badge-carritos').textContent = carritosEnEspera.length;
}

function escapeHtml(str) {
    return str ? str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') : '';
}

function actualizarModalResumen() {
    if (!modalResumenItems) return;
    const tasaUsar = tasa;
    let html = `<table class="pago-table w-full"><thead><tr><th>Producto</th><th>Cant</th><th>Precio Unitario</th><th>Subtotal</th></tr></thead><tbody>`;
    for (const item of carrito) {
        let cantidadMostrar;
        if (item.es_por_peso) {
            cantidadMostrar = (item.peso_kg % 1 === 0) ? item.peso_kg + ' kg' : item.peso_kg.toFixed(3) + ' kg';
        } else {
            cantidadMostrar = item.cant;
        }

        let precioUnitBs, precioUnitUsd;
        if (item.es_por_peso) {
            precioUnitBs = item.precio_kg_bs;
            precioUnitUsd = item.precio_kg_usd;
        } else {
            precioUnitBs = item.precio_bs;
            precioUnitUsd = item.precio_bs / tasaUsar;
        }
        
        const subtotalBs = round2(item.cant * item.precio_bs);
        const subtotalUsd = item.cant * (item.precio_usd || (item.precio_bs / tasaUsar));

        const precioUnitarioHTML = `${formatearBs(precioUnitBs)}<br><span class="text-[10px] text-slate-400">(${formatearUsd(precioUnitUsd)})</span>`;
        const subtotalHTML = `${formatearBs(subtotalBs)}<br><span class="text-[10px] text-blue-400">(${formatearUsd(subtotalUsd)})</span>`;

        html += `<tr>
            <td class="text-left">${escapeHtml(item.nombre)}</td>
            <td class="text-center">${cantidadMostrar}</td>
            <td class="text-right">${precioUnitarioHTML}</td>
            <td class="text-right font-bold">${subtotalHTML}</td>
        </tr>`;
    }
    html += `</tbody></table>`;
    modalResumenItems.innerHTML = html;
    scrollAlFinal('#modal-resumen-items', 50);
}

function actualizarBotonConfirmar(completo) {
    if (!btnConfirmarPagoModal) return;
    if (completo) {
        btnConfirmarPagoModal.disabled = false;
        btnConfirmarPagoModal.className = 'px-5 h-9 text-white font-bold text-[11px] shadow-sm border-0';
        btnConfirmarPagoModal.style.background = 'linear-gradient(135deg, #001f3f 0%, #003366 100%)';
        btnConfirmarPagoModal.style.cursor = 'pointer';
        btnConfirmarPagoModal.title = '';
    } else {
        btnConfirmarPagoModal.disabled = true;
        btnConfirmarPagoModal.className = 'px-5 h-9 text-gray-500 font-bold text-[11px] shadow-sm border-0';
        btnConfirmarPagoModal.style.background = '#d1d5db';
        btnConfirmarPagoModal.style.cursor = 'not-allowed';
        btnConfirmarPagoModal.title = 'No se puede realizar la venta porque el pago no está completo';
    }
}

function renderPagoNormal(tipoGuardado = null) {
    const saved = localStorage.getItem('inovix_modal_state');
    let tipo = 'Bolívares';
    if (tipoGuardado) tipo = tipoGuardado;
    else if (saved) { try { const st = JSON.parse(saved); if (st.tipoPago) tipo = st.tipoPago; } catch(e){} }

    let subtipoPagoVal = 'Punto de Venta Bs', subtipoDivisaVal = 'Divisas-USD', subtipoBinanceVal = 'Binance-USDT';
    let vueltoEntregadoVal = false, vueltoMetodoVal = 'Efectivo Bs';
    if (saved) {
        try { const st = JSON.parse(saved); if (st.subtipoPago) subtipoPagoVal = st.subtipoPago; if (st.subtipoDivisa) subtipoDivisaVal = st.subtipoDivisa; if (st.subtipoBinance) subtipoBinanceVal = st.subtipoBinance; if (st.vueltoEntregado) vueltoEntregadoVal = st.vueltoEntregado; if (st.vueltoMetodo) vueltoMetodoVal = st.vueltoMetodo; } catch(e){}
    }

    panelPagoContainer.innerHTML = `
        <div>
            <label class="text-[10px] font-bold text-slate-500 uppercase block mb-1">Cliente</label>
            <p class="text-sm font-bold text-zinc-800 truncate bg-white p-2 border border-gray-300" style="border-radius: 8px;">${escapeHtml(domCliNom.value.trim() || "Cliente no especificado")}</p>
        </div>
        <div>
            <label class="text-[10px] font-bold text-slate-500 uppercase block mb-1">Método de pago</label>
            <select id="modal-tipo-pago" class="w-full h-9 px-2 text-xs bg-white border border-gray-300 focus:ring-2 focus:ring-blue-500" style="border-radius: 8px;">
                <option value="Bolívares" ${tipo==='Bolívares'?'selected':''}>💰 Bolívares</option>
                <option value="Divisas" ${tipo==='Divisas'?'selected':''}>💵 Divisas</option>
                <option value="Binance" ${tipo==='Binance'?'selected':''}>₿ Binance</option>
                <option value="Mixto" ${tipo==='Mixto'?'selected':''}>🔀 Mixto</option>
            </select>
        </div>
        <div id="normal-subtipo-container">
            <label class="text-[10px] font-bold text-slate-500 uppercase block mb-1">Subtipo</label>
            <select id="modal-subtipo-pago" class="w-full h-9 px-2 text-xs bg-blue-50 border border-blue-200 focus:ring-2 focus:ring-blue-500 ${tipo!=='Bolívares'?'hidden':''}" style="border-radius: 8px;">
                <option value="Punto de Venta Bs" ${subtipoPagoVal==='Punto de Venta Bs'?'selected':''}>💳 Punto de Venta Bs</option>
                <option value="Efectivo Bs" ${subtipoPagoVal==='Efectivo Bs'?'selected':''}>💵 Efectivo Bs</option>
                <option value="Pago Móvil Bs" ${subtipoPagoVal==='Pago Móvil Bs'?'selected':''}>📱 Pago Móvil Bs</option>
                <option value="Transferencia Bs" ${subtipoPagoVal==='Transferencia Bs'?'selected':''}>🏦 Transferencia Bs</option>
            </select>
            <select id="modal-subtipo-divisa" class="w-full h-9 px-2 text-xs bg-violet-50 border border-violet-200 focus:ring-2 focus:ring-violet-500 ${tipo!=='Divisas'?'hidden':''}" style="border-radius: 8px;">
                <option value="Divisas-USD" ${subtipoDivisaVal==='Divisas-USD'?'selected':''}>💲 Efectivo USD</option>
                <option value="Zelle" ${subtipoDivisaVal==='Zelle'?'selected':''}>🔵 Zelle</option>
                <option value="Zinli" ${subtipoDivisaVal==='Zinli'?'selected':''}>🟢 Zinli</option>
            </select>
            <select id="modal-subtipo-binance" class="w-full h-9 px-2 text-xs bg-teal-50 border border-teal-200 focus:ring-2 focus:ring-teal-500 ${tipo!=='Binance'?'hidden':''}" style="border-radius: 8px;">
                <option value="Binance-USDT" ${subtipoBinanceVal==='Binance-USDT'?'selected':''}>₮ USDT</option>
                <option value="Binance-USDC" ${subtipoBinanceVal==='Binance-USDC'?'selected':''}>₮ USDC</option>
            </select>
        </div>
        <div class="bg-white p-2 border border-gray-200 text-center" style="border-radius: 8px;">
            <span class="text-[9px] font-bold text-slate-500 uppercase">Total a pagar</span>
            <p id="modal-total-moneda" class="text-sm font-black text-blue-700">0,00 $</p>
        </div>
        <div id="contenedor-monto-recibido"></div>
        <div id="modal-estado-pago" class="text-[10px] font-bold hidden"></div>
        <div id="modal-vuelto-section" class="hidden pt-2 border-t border-slate-200 mt-2">
            <label class="flex items-center gap-2">
                <input type="checkbox" id="modal-vuelto-entregado" ${vueltoEntregadoVal?'checked':''} class="w-3.5 h-3.5 text-blue-600 border-gray-300" style="border-radius: 8px;">
                <span class="text-[9px] font-bold text-slate-600 uppercase">Dar vuelto</span>
            </label>
            <div id="modal-vuelto-metodo-container" class="${vueltoEntregadoVal?'':'hidden'} mt-2">
                <label class="text-[9px] font-bold text-slate-500 block mb-1">Método para el vuelto</label>
                <select id="modal-vuelto-metodo" class="w-full h-8 px-2 text-[9px] bg-white border border-gray-300" style="border-radius: 8px;">
                    <optgroup label="💰 Bolívares">
                        <option value="Efectivo Bs" ${vueltoMetodoVal==='Efectivo Bs'?'selected':''}>💵 Efectivo Bs</option>
                        <option value="Pago Móvil Bs" ${vueltoMetodoVal==='Pago Móvil Bs'?'selected':''}>📱 Pago Móvil Bs</option>
                        <option value="Transferencia Bs" ${vueltoMetodoVal==='Transferencia Bs'?'selected':''}>🏦 Transferencia Bs</option>
                        <option value="Punto de Venta Bs" ${vueltoMetodoVal==='Punto de Venta Bs'?'selected':''}>💳 Punto de Venta Bs</option>
                    </optgroup>
                    <optgroup label="💵 Divisas">
                        <option value="Divisas-USD">💲 Efectivo USD</option>
                        <option value="Zelle">🔵 Zelle</option>
                        <option value="Zinli">🟢 Zinli</option>
                    </optgroup>
                    <optgroup label="₿ Binance">
                        <option value="Binance-USDT">₮ USDT</option>
                        <option value="Binance-USDC">₮ USDC</option>
                    </optgroup>
                </select>
            </div>
        </div>
    `;

    const tipoSelect = document.getElementById('modal-tipo-pago');
    const subtipoPago = document.getElementById('modal-subtipo-pago');
    const subtipoDivisa = document.getElementById('modal-subtipo-divisa');
    const subtipoBinance = document.getElementById('modal-subtipo-binance');
    const vueltoEntregadoChk = document.getElementById('modal-vuelto-entregado');
    const vueltoMetodo = document.getElementById('modal-vuelto-metodo');
    const vueltoSection = document.getElementById('modal-vuelto-section');
    const contenedorMonto = document.getElementById('contenedor-monto-recibido');

    async function refrescarTablaProductos() { actualizarModalResumen(); }

    async function actualizarTotalMonedaNormal() {
        const tipo = tipoSelect.value;
        const el = document.getElementById('modal-total-moneda');
        if (tipo === 'Bolívares') {
            el.innerHTML = `${formatearBs(totalFinalBs)}<br><span class="text-[9px] text-slate-500">Pago exacto: ${formatearUsd(round4(totalFinalBs/tasa))}</span>`;
            return;
        }
        let simbolo = '';
        if (tipo === 'Divisas') simbolo = '$';
        else if (tipo === 'Binance') simbolo = subtipoBinance.value.includes('USDT') ? 'USDT' : 'USDC';
        const totalExacto = round2(totalFinalBs / tasa);
        const exactoStr = formatearMontoExtranjero(totalExacto) + ' ' + simbolo;
        el.innerHTML = `<span class="block text-[11px] font-bold">Monto exacto: ${exactoStr}</span>`;
    }

    async function renderInputMontoRecibido() {
        const tipo = tipoSelect.value;
        const esEfectivoBs = (tipo === 'Bolívares' && subtipoPago.value === 'Efectivo Bs');
        const esEfectivoUsd = (tipo === 'Divisas' && subtipoDivisa.value === 'Divisas-USD');
        let tieneDecimales = false;
        if (esEfectivoBs) tieneDecimales = Math.abs(totalFinalBs - Math.round(totalFinalBs)) > 0.005;
        else if (esEfectivoUsd) tieneDecimales = Math.abs((totalFinalBs/tasa) - Math.round(totalFinalBs/tasa)) > 0.0001;
        let placeholder = "Ej: 1.200,50";
        if (esEfectivoBs) placeholder = "Ej: 1.200 (solo números enteros)";
        else if (esEfectivoUsd) placeholder = "Ej: 1.200,50";

        let valorPrellenado = '';
        if (tipo === 'Bolívares') {
            valorPrellenado = totalFinalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
            const totalExacto = round2(totalFinalBs / tasa);
            valorPrellenado = formatearInputExtranjero(totalExacto);
        }

        contenedorMonto.innerHTML = `
            <div>
                <label class="text-[10px] font-bold text-slate-500 uppercase block mb-1">Monto recibido</label>
                <div class="flex gap-2 items-center">
                    <input type="text" id="modal-monto-recibido" placeholder="${placeholder}" class="flex-1 h-9 px-2 text-xs bg-gray-100 border border-gray-300 focus:ring-2 focus:ring-blue-500" style="border-radius: 8px;" value="${valorPrellenado}" disabled>
                    <button id="btn-editar-monto" class="h-9 px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-[10px] rounded-lg border border-gray-300 transition-colors">Editar</button>
                </div>
            </div>`;

        if (tieneDecimales) {
            contenedorMonto.innerHTML += `<div class="mt-2 p-2 bg-amber-50 border border-amber-200 text-[10px] text-amber-700" style="border-radius: 8px;">⚠️ Este monto contiene decimales. Lo recomendable es utilizar <strong>'Pago Mixto'</strong>. De lo contrario, puedes redondear el monto total de forma manual e ingresar un número entero.</div>`;
        }

        const inputMonto = document.getElementById('modal-monto-recibido');
        const btnEditar = document.getElementById('btn-editar-monto');

        if (inputMonto) {
            inputMonto.addEventListener('blur', actualizarEstadoPagoNormal);
            inputMonto.addEventListener('input', actualizarEstadoPagoNormal);
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
                    actualizarEstadoPagoNormal();
                }
            });
        }

        actualizarEstadoPagoNormal();
    }

    async function actualizarEstadoPagoNormal() {
        const input = document.getElementById('modal-monto-recibido');
        if (!input) return;
        let montoRecibidoValNum = parsearNumero(input.value);
        const estadoDiv = document.getElementById('modal-estado-pago');
        if (isNaN(montoRecibidoValNum) || montoRecibidoValNum <= 0) {
            estadoDiv.classList.add('hidden');
            vueltoSection.classList.add('hidden');
            actualizarBotonConfirmar(false);
            return;
        }
        const tipo = tipoSelect.value;
        let color = 'text-green-600', texto = '';
        let pagoCompleto = false;
        if (tipo === 'Bolívares') {
            const diferenciaBs = round2(montoRecibidoValNum - totalFinalBs);
            const equivalenteUsd = round2(Math.abs(diferenciaBs) / tasa);
            if (Math.abs(diferenciaBs) <= 0.005) {
                color = 'text-green-600'; texto = 'Pago exacto';
                vueltoSection.classList.add('hidden'); vueltoEntregadoChk.checked = false;
                pagoCompleto = true;
            } else if (diferenciaBs < 0) {
                color = 'text-red-600'; texto = `Falta: Bs ${formatearNumero(Math.abs(diferenciaBs))} (≈ ${formatearUsd(equivalenteUsd)})`;
                vueltoSection.classList.add('hidden');
            } else {
                color = 'text-red-600'; texto = `Vuelto: Bs ${formatearNumero(diferenciaBs)} (≈ ${formatearUsd(equivalenteUsd)})`;
                vueltoSection.classList.remove('hidden');
                pagoCompleto = true;
            }
        } else {
            let simbolo = '';
            if (tipo === 'Divisas') simbolo = '$';
            else if (tipo === 'Binance') simbolo = subtipoBinance.value.includes('USDT') ? 'USDT' : 'USDC';
            const totalEsperadoExacto = round2(totalFinalBs / tasa);
            const diferenciaExtExacta = round2(montoRecibidoValNum - totalEsperadoExacto);
            const equivalenteBs = round2(Math.abs(diferenciaExtExacta) * tasa);
            const formateador = (v) => formatearNumero(v, 2) + ' ' + simbolo;
            if (Math.abs(diferenciaExtExacta) <= 0.0001) {
                color = 'text-green-600'; texto = 'Pago exacto';
                vueltoSection.classList.add('hidden'); vueltoEntregadoChk.checked = false;
                pagoCompleto = true;
            } else if (diferenciaExtExacta < 0) {
                color = 'text-red-600'; texto = `Falta: ${formateador(Math.abs(diferenciaExtExacta))} (≈ ${formatearUsd(equivalenteBs)})`;
                vueltoSection.classList.add('hidden');
            } else {
                color = 'text-red-600'; texto = `Vuelto: ${formateador(diferenciaExtExacta)} (≈ ${formatearBs(equivalenteBs)})`;
                vueltoSection.classList.remove('hidden');
                pagoCompleto = true;
            }
        }
        estadoDiv.className = `text-[10px] font-bold ${color} p-2 bg-slate-100`;
        estadoDiv.innerHTML = texto;
        estadoDiv.classList.remove('hidden');
        scrollAlFinal('#modal-estado-pago', 50);
        guardarModalStateNormal();
        actualizarBotonConfirmar(pagoCompleto);
    }

    function actualizarSubtipo() {
        subtipoPago.classList.toggle('hidden', tipoSelect.value !== 'Bolívares');
        subtipoDivisa.classList.toggle('hidden', tipoSelect.value !== 'Divisas');
        subtipoBinance.classList.toggle('hidden', tipoSelect.value !== 'Binance');
        refrescarTablaProductos();
        actualizarTotalMonedaNormal();
        renderInputMontoRecibido();
        scrollAlFinal('#panel-pago-container', 50);
    }

    tipoSelect.addEventListener('change', () => {
        if (tipoSelect.value === 'Mixto') {
            localStorage.setItem('inovix_modal_state', JSON.stringify({tipoPago:'Mixto'}));
            renderPagoMixto();
            return;
        }
        actualizarSubtipo();
    });
    subtipoDivisa.addEventListener('change', actualizarSubtipo);
    subtipoBinance.addEventListener('change', actualizarSubtipo);
    subtipoPago.addEventListener('change', actualizarSubtipo);
    vueltoEntregadoChk.addEventListener('change', (e) => {
        document.getElementById('modal-vuelto-metodo-container').classList.toggle('hidden', !e.target.checked);
        guardarModalStateNormal();
    });
    vueltoMetodo.addEventListener('change', guardarModalStateNormal);

    actualizarTotalMonedaNormal();
    renderInputMontoRecibido();
    refrescarTablaProductos();

    function guardarModalStateNormal() {
        const input = document.getElementById('modal-monto-recibido');
        const state = {
            tipoPago: tipoSelect.value,
            subtipoPago: subtipoPago.value,
            subtipoDivisa: subtipoDivisa.value,
            subtipoBinance: subtipoBinance.value,
            montoRecibido: input ? input.value : '',
            vueltoEntregado: vueltoEntregadoChk.checked,
            vueltoMetodo: vueltoMetodo.value
        };
        localStorage.setItem('inovix_modal_state', JSON.stringify(state));
    }
}

let pagosMixtosTemp = [];
let cobroMixtoCompletadoTemp = false;

function renderPagoMixto() {
    panelPagoContainer.innerHTML = `
        <div class="mb-3">
            <button onclick="renderPagoNormal('Bolívares'); localStorage.setItem('inovix_modal_state', JSON.stringify({tipoPago:'Bolívares'}));" class="text-[10px] text-indigo-600 hover:text-indigo-800 underline font-bold">↩ Volver a pago simple</button>
        </div>
        <div>
            <label class="text-[10px] font-bold text-slate-500 uppercase block mb-1">Cliente</label>
            <p class="text-sm font-bold text-zinc-800 truncate bg-white p-2 border border-gray-300" style="border-radius: 8px;">${escapeHtml(domCliNom.value.trim() || "Cliente no especificado")}</p>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-3">
            <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-3 border border-blue-200 text-center" style="border-radius: 8px;">
                <p class="text-[10px] font-bold text-blue-600 uppercase">Total en Bs</p>
                <p class="text-lg font-black text-blue-700">${formatearBs(totalFinalBs)}</p>
            </div>
            <div class="bg-gradient-to-br from-violet-50 to-violet-100 p-3 border border-violet-200 text-center" style="border-radius: 8px;">
                <p class="text-[10px] font-bold text-violet-600 uppercase">Total en USD</p>
                <p class="text-lg font-black text-violet-700">${formatearUsd(totalFinalBs/tasa)}</p>
            </div>
        </div>
        <div class="bg-white p-3 border border-gray-200 shadow-sm" style="border-radius: 8px;">
            <p class="text-[9px] font-bold text-slate-500 uppercase mb-2">Agregar pago</p>
            <div class="flex flex-col gap-2">
                <select id="mix-input-metodo" class="w-full h-8 px-2 text-[10px] bg-gray-50 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-700" style="border-radius: 8px;">
                    <optgroup label="💰 Bolívares">
                        <option value="Efectivo Bs">💵 Efectivo Bs</option>
                        <option value="Pago Móvil Bs">📱 Pago Móvil Bs</option>
                        <option value="Transferencia Bs">🏦 Transferencia Bs</option>
                        <option value="Punto de Venta Bs">💳 Punto de Venta Bs</option>
                    </optgroup>
                    <optgroup label="💵 Divisas">
                        <option value="Divisas-USD">💲 Efectivo USD</option>
                        <option value="Zelle">🔵 Zelle</option>
                        <option value="Zinli">🟢 Zinli</option>
                    </optgroup>
                    <optgroup label="₿ Binance">
                        <option value="Binance-USDT">₮ USDT</option>
                        <option value="Binance-USDC">₮ USDC</option>
                    </optgroup>
                </select>
                <div id="mix-input-monto-container">
                    <input type="text" id="mix-input-monto" placeholder="Monto" class="w-full h-8 px-2 text-[10px] bg-gray-50 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold" style="border-radius: 8px;">
                </div>
                <button id="mix-btn-agregar" class="btn-action h-8 px-2 text-white font-bold text-[9px] shadow-sm border-0" style="background: linear-gradient(135deg, #001f3f 0%, #003366 100%); border-radius: 8px;">+ AGREGAR</button>
            </div>
        </div>
        <div class="bg-white p-3 border border-gray-200 shadow-sm" style="border-radius: 8px;">
            <p class="text-[9px] font-bold text-slate-500 uppercase mb-2">Abonos registrados</p>
            <div id="mix-lista-pagos" class="space-y-1.5 max-h-[160px] overflow-y-auto custom-scrollbar text-[10px] text-slate-400">Sin abonos registrados aún.</div>
        </div>
        <div id="mix-caja-estado" class="bg-white p-3 border border-gray-200 text-center shadow-sm" style="border-radius: 8px;">
            <p id="mix-lbl-estado" class="text-[9px] font-bold text-slate-400 uppercase">Estado</p>
            <p id="mix-val-estado-bs" class="text-lg font-black text-zinc-700">0,00 Bs</p>
            <p id="mix-val-estado-usd" class="text-[10px] font-bold text-slate-400">0,00 $</p>
        </div>
        <div id="mix-vuelto-section" class="hidden pt-2 border-t border-slate-200 mt-2">
            <label class="flex items-center gap-2">
                <input type="checkbox" id="mix-vuelto-entregado" class="w-3.5 h-3.5 text-blue-600 border-gray-300" style="border-radius: 8px;">
                <span class="text-[9px] font-bold text-slate-600 uppercase">Dar vuelto</span>
            </label>
            <div id="mix-vuelto-metodo-container" class="hidden mt-2">
                <label class="text-[9px] font-bold text-slate-500 block mb-1">Método para el vuelto</label>
                <select id="mix-vuelto-metodo" class="w-full h-8 px-2 text-[9px] bg-white border border-gray-300" style="border-radius: 8px;">
                    <optgroup label="💰 Bolívares">
                        <option value="Efectivo Bs">💵 Efectivo Bs</option>
                        <option value="Pago Móvil Bs">📱 Pago Móvil Bs</option>
                        <option value="Transferencia Bs">🏦 Transferencia Bs</option>
                        <option value="Punto de Venta Bs">💳 Punto de Venta Bs</option>
                    </optgroup>
                    <optgroup label="💵 Divisas">
                        <option value="Divisas-USD">💲 Efectivo USD</option>
                        <option value="Zelle">🔵 Zelle</option>
                        <option value="Zinli">🟢 Zinli</option>
                    </optgroup>
                    <optgroup label="₿ Binance">
                        <option value="Binance-USDT">₮ USDT</option>
                        <option value="Binance-USDC">₮ USDC</option>
                    </optgroup>
                </select>
            </div>
        </div>
    `;
    pagosMixtosTemp = [];
    cobroMixtoCompletadoTemp = false;
    actualizarVistaMixtoIntegrado();

    const mixMetodoSelect = document.getElementById('mix-input-metodo');
    const mixMontoContainer = document.getElementById('mix-input-monto-container');

    function actualizarInputMontoMixto() {
        const metodo = mixMetodoSelect.value;
        let placeholder = "Monto (ej: 1.200,50)";
        if (metodo === 'Efectivo Bs') placeholder = "Monto entero (ej: 1.200)";
        mixMontoContainer.innerHTML = `<input type="text" id="mix-input-monto" placeholder="${placeholder}" class="w-full h-8 px-2 text-[10px] bg-gray-50 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold" style="border-radius: 8px;">`;
    }
    mixMetodoSelect.addEventListener('change', () => {
        actualizarInputMontoMixto();
        actualizarVistaMixtoIntegrado();
    });
    actualizarInputMontoMixto();

    document.getElementById('mix-btn-agregar').addEventListener('click', agregarFilaPagoMixtoIntegrado);

    const mixVueltoChk = document.getElementById('mix-vuelto-entregado');
    const mixVueltoMetodoContainer = document.getElementById('mix-vuelto-metodo-container');
    mixVueltoChk.addEventListener('change', () => {
        mixVueltoMetodoContainer.classList.toggle('hidden', !mixVueltoChk.checked);
    });
}

async function agregarFilaPagoMixtoIntegrado() {
    const metodo = document.getElementById('mix-input-metodo').value;
    const montoInput = document.getElementById('mix-input-monto');
    let monto = parsearNumero(montoInput.value);
    if (isNaN(monto) || monto <= 0) return;
    const esExtranjera = METODOS_DIVISAS_BINANCE.includes(metodo);
    let moneda = 'BS', tasaUsar = tasa;
    if (esExtranjera) {
        if (metodo === 'Binance-USDT') moneda = 'USDT';
        else if (metodo === 'Binance-USDC') moneda = 'USDC';
        else moneda = 'USD';
    }
    const valorEnBs = esExtranjera ? round2(monto * tasaUsar) : monto;
    pagosMixtosTemp.push({ metodo, monto_original: monto, moneda, valor_bs: valorEnBs, esExtranjera, tasaUsada: tasaUsar });
    montoInput.value = '';
    actualizarVistaMixtoIntegrado();
    scrollAlFinal('#mix-lista-pagos', 50);
}

function borrarPagoMixtoIntegrado(index) { pagosMixtosTemp.splice(index, 1); actualizarVistaMixtoIntegrado(); }

function actualizarVistaMixtoIntegrado() {
    let totalPagadoBs = 0;
    const listaDom = document.getElementById('mix-lista-pagos');
    listaDom.innerHTML = pagosMixtosTemp.length ? pagosMixtosTemp.map((p, idx) => {
        totalPagadoBs += p.valor_bs;
        let montoMostrar = p.moneda === 'BS' ? formatearNumero(p.monto_original) + ' Bs' : formatearMontoExtranjero(p.monto_original) + ' ' + p.moneda;
        return `<div class="flex justify-between items-center p-2.5 bg-gray-50 border border-gray-200" style="border-radius: 8px;">
                    <div class="flex items-center gap-2.5">
                        <span class="w-7 h-7 bg-blue-700 text-white flex items-center justify-center font-bold text-[10px]" style="border-radius: 8px;">${idx+1}</span>
                        <div><p class="text-[11px] font-bold text-zinc-700">${p.metodo}</p>
                        <p class="text-[9px] text-slate-500">Monto exacto: ${montoMostrar}</p></div>
                    </div>
                    <button onclick="borrarPagoMixtoIntegrado(${idx})" class="text-red-500 hover:bg-red-50 p-1.5 text-[10px] font-bold transition-colors">Borrar</button>
                </div>`;
    }).join('') : 'Sin abonos registrados aún.';

    totalPagadoBs = round2(totalPagadoBs);
    const diferenciaBsExacta = round2(totalPagadoBs - totalFinalBs);
    const cajaEstado = document.getElementById('mix-caja-estado'),
          lblEstado = document.getElementById('mix-lbl-estado'),
          valBs = document.getElementById('mix-val-estado-bs'),
          valUsd = document.getElementById('mix-val-estado-usd');
    const vueltoSection = document.getElementById('mix-vuelto-section');
    const metodoActual = document.getElementById('mix-input-metodo')?.value || '';
    const esExtranjeroActual = METODOS_DIVISAS_BINANCE.includes(metodoActual);
    const simboloActual = esExtranjeroActual ? obtenerSimboloMoneda(metodoActual) : '';

    if (Math.abs(diferenciaBsExacta) <= 0.005) {
        cajaEstado.className = "bg-emerald-50 p-3 border border-emerald-200 text-center shadow-sm";
        lblEstado.className = "text-[9px] font-bold text-emerald-600 uppercase mb-1";
        lblEstado.textContent = "PAGO EXACTO";
        valBs.className = "text-lg font-black text-emerald-700"; valBs.textContent = "PAGO EXACTO";
        valUsd.className = "text-[10px] font-bold text-emerald-500 hidden";
        cobroMixtoCompletadoTemp = true;
        if (vueltoSection) vueltoSection.classList.add('hidden');
    } else if (diferenciaBsExacta < 0) {
        cajaEstado.className = "bg-white p-3 border border-red-200 text-center shadow-sm";
        lblEstado.className = "text-[9px] font-bold text-red-500 uppercase mb-1"; lblEstado.textContent = "Falta por Cobrar";
        const faltaBs = Math.abs(diferenciaBsExacta), faltaUsd = faltaBs / tasa;
        if (esExtranjeroActual) {
            valBs.className = "text-lg font-black text-red-600";
            valBs.innerHTML = `Monto exacto: ${simboloActual} ${formatearMontoExtranjero(faltaUsd)}`;
            valUsd.className = "text-[10px] font-bold text-red-400";
            valUsd.innerHTML = `≈ ${formatearBs(faltaBs)}`;
        } else {
            valBs.className = "text-lg font-black text-red-600";
            valBs.innerHTML = `Monto exacto: ${formatearNumero(faltaBs)} Bs`;
            valUsd.className = "text-[10px] font-bold text-red-400";
            valUsd.innerHTML = `Monto exacto: ${formatearUsd(faltaUsd)}`;
        }
        cobroMixtoCompletadoTemp = false;
        if (vueltoSection) vueltoSection.classList.add('hidden');
    } else {
        cajaEstado.className = "bg-emerald-50 p-3 border border-emerald-200 text-center shadow-sm";
        lblEstado.className = "text-[9px] font-bold text-emerald-600 uppercase mb-1"; lblEstado.textContent = "Sobró dinero / Dar vuelto";
        const sobraBs = diferenciaBsExacta, sobraUsd = sobraBs / tasa;
        if (esExtranjeroActual) {
            valBs.className = "text-lg font-black text-emerald-700";
            valBs.innerHTML = `Monto exacto: ${simboloActual} ${formatearMontoExtranjero(sobraUsd)}`;
            valUsd.className = "text-[10px] font-bold text-emerald-500";
            valUsd.innerHTML = `≈ ${formatearBs(sobraBs)}`;
        } else {
            valBs.className = "text-lg font-black text-emerald-700";
            valBs.innerHTML = `Monto exacto: ${formatearNumero(sobraBs)} Bs`;
            valUsd.className = "text-[10px] font-bold text-emerald-500";
            valUsd.innerHTML = `Monto exacto: ${formatearUsd(sobraUsd)}`;
        }
        cobroMixtoCompletadoTemp = true;
        if (vueltoSection) vueltoSection.classList.remove('hidden');
    }
    scrollAlFinal('#mix-caja-estado', 50);
    actualizarBotonConfirmar(cobroMixtoCompletadoTemp);
}

function abrirModalPago() {
    if (!carrito.length) return window.parent.Swal.fire({ icon: 'warning', title: 'Carrito vacío', text: 'Agrega productos antes de cobrar.', confirmButtonColor: '#2563eb' });
    actualizarModalResumen();
    const saved = localStorage.getItem('inovix_modal_state');
    let tipo = 'Bolívares';
    if (saved) { try { const st = JSON.parse(saved); if (st.tipoPago) tipo = st.tipoPago; } catch(e){} }
    if (tipo === 'Mixto') renderPagoMixto(); else renderPagoNormal(tipo);
    modalPago.style.display = 'flex';
    scrollAlFinal('#panel-pago-container', 100);
}
function cerrarModalPago() { modalPago.style.display = 'none'; }

async function confirmarPagoModal() {
    if (btnConfirmarPagoModal && btnConfirmarPagoModal.disabled) return;
    const isMixto = !document.getElementById('modal-tipo-pago') && document.getElementById('mix-input-metodo');
    if (isMixto) {
        if (!cobroMixtoCompletadoTemp) return window.parent.Swal.fire({ icon: 'warning', title: 'Pago Incompleto', text: 'Debes completar el pago mixto (falta o sobra dinero).' });
        let clienteMixto = null;
        const rawName = domCliNom.value.trim().toUpperCase();
        const itemsCopia = [...carrito];
        const totalBsPagado = round2(pagosMixtosTemp.reduce((sum, p) => sum + p.valor_bs, 0));
        const vueltoBs = round2(totalBsPagado - totalFinalBs);
        const vueltoEntregadoMixto = document.getElementById('mix-vuelto-entregado')?.checked || false;
        const vueltoMetodoMixto = vueltoEntregadoMixto ? document.getElementById('mix-vuelto-metodo')?.value : null;

        for (let i = 0; i < pagosMixtosTemp.length; i++) {
            const pago = pagosMixtosTemp[i];
            const nombreCliente = i === 0 ? (!rawName || rawName === "(NUEVO CLIENTE)" ? "CLIENTE EVENTUAL" : rawName) : clienteMixto;
            const totalBsFinalPago = round2(pago.valor_bs);
            const totalUsdFinal = pago.esExtranjera ? pago.monto_original : round2(pago.valor_bs / tasa);
            const metodoConTasa = pago.metodo + '~' + pago.tasaUsada;
            const exito = await window.parent.electronAPI.db.registrarVentaCompleta({
                cliente: nombreCliente, telefono: domCliTel.value.trim(),
                total_bs: totalBsFinalPago, total_usd: totalUsdFinal,
                metodo: metodoConTasa, descuento: 0, items: carrito,
                es_seleccionado: i === 0 ? clienteSeleccionadoLista : true, deducirStock: i === 0,
                monto_recibido: null,
                vuelto: (i === 0 && vueltoEntregadoMixto && vueltoBs > 0) ? vueltoBs : null,
                vuelto_entregado: (i === 0 && vueltoEntregadoMixto && vueltoBs > 0),
                vuelto_metodo: (i === 0 && vueltoEntregadoMixto && vueltoBs > 0) ? vueltoMetodoMixto : null
            });
            if (!exito) return window.parent.Swal.fire({ icon: 'error', title: 'Error', text: 'Error al procesar algunos pagos' });
            if (i === 0 && typeof exito === 'string') clienteMixto = exito;
        }
        window.parent.Swal.fire({ icon: 'success', title: 'Venta Mixta Procesada', toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
        limpiarVenta(); cerrarModalPago(); verificarAlertasStockCritico(itemsCopia);
        localStorage.removeItem('inovix_modal_state');
        return;
    }

    const tipoSelect = document.getElementById('modal-tipo-pago');
    const montoInput = document.getElementById('modal-monto-recibido');
    if (!montoInput || !montoInput.value.trim()) return window.parent.Swal.fire({ icon: 'warning', title: 'Monto requerido', text: 'Debe ingresar un monto recibido.' });
    const montoRecibido = parsearNumero(montoInput.value);
    if (montoRecibido <= 0) return window.parent.Swal.fire({ icon: 'warning', title: 'Monto inválido', text: 'Ingrese un monto mayor a cero.' });
    const tipo = tipoSelect.value;
    const metodo = tipo === 'Bolívares' ? document.getElementById('modal-subtipo-pago').value : tipo === 'Divisas' ? document.getElementById('modal-subtipo-divisa').value : document.getElementById('modal-subtipo-binance').value;
    let total_bs = totalFinalBs, total_usd = 0;
    const esMetodoExt = METODOS_DIVISAS_BINANCE.includes(metodo);
    if (esMetodoExt) { total_usd = round4(totalFinalBs / tasa); total_bs = 0; }
    let vuelto = null;
    const vueltoEntregado = document.getElementById('modal-vuelto-entregado')?.checked || false;
    const vueltoMetodo = vueltoEntregado ? document.getElementById('modal-vuelto-metodo')?.value : null;
    if (montoRecibido > 0 && vueltoEntregado) {
        if (!esMetodoExt) vuelto = round2(montoRecibido - totalFinalBs);
        else vuelto = round2(montoRecibido * tasa - totalFinalBs);
    }
    const rawName = domCliNom.value.trim().toUpperCase();
    const itemsCopia = [...carrito];
    try {
        const exito = await window.parent.electronAPI.db.registrarVentaCompleta({
            cliente: !rawName || rawName === "(NUEVO CLIENTE)" ? "CLIENTE EVENTUAL" : rawName,
            telefono: domCliTel.value.trim(), total_bs, total_usd, metodo, descuento: 0,
            items: carrito, es_seleccionado: clienteSeleccionadoLista, deducirStock: true,
            monto_recibido: montoRecibido, vuelto, vuelto_entregado: vueltoEntregado, vuelto_metodo: vueltoMetodo
        });
        if (exito) {
            window.parent.Swal.fire({ icon: 'success', title: 'Venta Procesada', toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
            limpiarVenta(); cerrarModalPago(); verificarAlertasStockCritico(itemsCopia);
            localStorage.removeItem('inovix_modal_state');
        } else window.parent.Swal.fire({ icon: 'error', title: 'Error', text: 'Error en la base de datos' });
    } catch (e) { window.parent.Swal.fire({ icon: 'error', title: 'Error', text: e.message }); }
}

function saveStateToLocal() {
    localStorage.setItem('inovix_ventas_state', JSON.stringify({ carrito, clienteNombre: domCliNom.value, clienteTelefono: domCliTel.value, clienteSeleccionadoLista }));
}
function restoreStateFromLocal() {
    const data = localStorage.getItem('inovix_ventas_state');
    if (data) {
        try {
            const state = JSON.parse(data);
            carrito = state.carrito || [];
            domCliNom.value = state.clienteNombre || '';
            domCliTel.value = state.clienteTelefono || '';
            clienteSeleccionadoLista = state.clienteSeleccionadoLista || false;
            actualizarVistaCarrito();
        } catch(e) { localStorage.removeItem('inovix_ventas_state'); }
    }
}

async function initVentas() {
    const style = document.createElement('style');
    style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        #modal-pago, #modal-gastos, #modal-carritos, #modal-redondeo { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; }
        #modal-pago > div { width: 1100px !important; max-width: 95vw !important; border-radius: 14px !important; overflow: hidden; }
        #panel-pago-container input, #panel-pago-container select, #panel-pago-container .border, #modal-pago .border { border-radius: 8px !important; }
        #modal-pago .rounded-lg, #modal-pago .rounded-xl { border-radius: 8px !important; }
        #modal-pago button { border-radius: 8px !important; }
        #modal-pago > div > div:first-child { background: linear-gradient(135deg, #001f3f 0%, #003366 100%) !important; }
        #btn-confirmar-pago-modal:disabled { opacity: 0.6; }
    `;
    document.head.appendChild(style);

    configurarEventos();
    await actualizarDatosVentas();
    restoreStateFromLocal();
    document.getElementById('badge-carritos').textContent = carritosEnEspera.length;
    if (btnConfirmarPagoModal) btnConfirmarPagoModal.addEventListener('click', confirmarPagoModal);
    if (inputEscanner) {
        inputEscanner.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const codigo = inputEscanner.value.trim();
                if (codigo) { await procesarCodigoBarras(codigo); inputEscanner.value = ''; }
            }
        });
    }
}

async function actualizarDatosVentas() {
    try {
        const valTasa = await window.parent.electronAPI.db.obtenerConfig("tasa_usd");
        tasa = valTasa ? parseFloat(valTasa) : 1.0;
        const prodsRaw = await window.parent.electronAPI.db.buscarProductos("");
        todosLosProductos = prodsRaw.map(p => ({
            id: p.id, sku: p.sku, nombre: p.nombre,
            p_venta_bs: parseFloat(p.p_venta_bs), p_venta_usd: parseFloat(p.p_venta_usd || 0),
            stock: parseInt(p.stock || 0), stock_critico: parseInt(p.stock_critico || 5),
            es_por_peso: !!p.es_por_peso,
            precio_kg_bs: parseFloat(p.precio_kg_bs || 0), precio_kg_usd: parseFloat(p.precio_kg_usd || 0),
            stock_kg: parseFloat(p.stock_kg || 0)
        }));
        clientesBD = await window.parent.electronAPI.db.obtenerNombresClientes();
        buscarEnTiempoReal();
    } catch(e) {}
}

function configurarEventos() {
    domBuscar.addEventListener('keyup', buscarEnTiempoReal);
    domCliNom.addEventListener('keyup', (e) => { if (!["ArrowUp","ArrowDown","Enter","Tab","Escape"].includes(e.key)) filtrarClientesTiempoReal(); });
    domCliNom.addEventListener('input', () => { if (!domCliNom.value.trim()) { domCliTel.value = ""; clienteSeleccionadoLista = false; } saveStateToLocal(); });
    domCliTel.addEventListener('input', saveStateToLocal);
    document.addEventListener('click', (e) => { if (!domCliNom.contains(e.target) && !domPanelSugerencias.contains(e.target)) domPanelSugerencias.classList.add('hidden'); });
    domComboProd.addEventListener('change', () => {
        const prodId = domComboProd.value;
        if (!prodId) { domCant.placeholder = "Cant."; return; }
        const prod = todosLosProductos.find(p => String(p.id) === String(prodId));
        domCant.placeholder = (prod && prod.es_por_peso) ? "Peso (kg)" : "Cant.";
    });
}

function buscarEnTiempoReal() {
    const texto = domBuscar.value.trim().toLowerCase();
    productosEncontrados = texto ? todosLosProductos.filter(p => (p.nombre||'').toLowerCase().includes(texto) || (p.sku||'').toLowerCase().includes(texto)) : todosLosProductos;
    domComboProd.innerHTML = productosEncontrados.length ? productosEncontrados.map(p => {
        let precioMostrar;
        if (p.es_por_peso) precioMostrar = `Bs ${p.precio_kg_bs.toLocaleString('es-VE', {minimumFractionDigits:2})}/kg | $ ${p.precio_kg_usd.toLocaleString('es-VE', {minimumFractionDigits:2})}/kg`;
        else precioMostrar = `${formatearBs(p.p_venta_bs)} | ${formatearUsd(p.p_venta_usd)}`;
        return `<option value="${p.id}">${p.nombre} | ${precioMostrar}</option>`;
    }).join('') : '<option value="">Sin coincidencias</option>';
    domComboProd.dispatchEvent(new Event('change'));
}

function filtrarClientesTiempoReal() {
    const texto = domCliNom.value.trim().toUpperCase();
    domPanelSugerencias.innerHTML = '';
    if (!texto) { domPanelSugerencias.classList.add('hidden'); clienteSeleccionadoLista = false; return; }
    const filtrados = clientesBD.filter(c => (c.nombre||'').toUpperCase().startsWith(texto));
    if (!filtrados.length) { domPanelSugerencias.classList.add('hidden'); return; }
    filtrados.forEach(cliente => {
        const btn = document.createElement('div');
        btn.className = "px-4 py-2 text-sm text-zinc-800 hover:bg-slate-100 cursor-pointer transition-colors";
        btn.textContent = cliente.nombre;
        btn.onclick = () => { domCliNom.value = cliente.nombre; if (cliente.telefono && cliente.telefono !== 'S/D') domCliTel.value = cliente.telefono; domPanelSugerencias.classList.add('hidden'); clienteSeleccionadoLista = true; saveStateToLocal(); };
        domPanelSugerencias.appendChild(btn);
    });
    domPanelSugerencias.classList.remove('hidden');
}

function agregarAlCarrito() {
    const prodId = domComboProd.value; if (!prodId) return;
    const prod = todosLosProductos.find(p => String(p.id) === String(prodId)); if (!prod) return;
    const cantStr = domCant.value.trim();
    if (!cantStr) return window.parent.Swal.fire({ icon: 'warning', title: 'Cantidad requerida', text: 'Debe ingresar una cantidad.', toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
    if (prod.es_por_peso) {
        const kg = parseFloat(cantStr.replace(',', '.'));
        if (isNaN(kg) || kg <= 0) return window.parent.Swal.fire({ icon: 'error', title: 'Peso inválido', text: 'Ingrese un peso válido mayor a 0.', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        if (prod.stock_kg > 0 && kg > prod.stock_kg) return window.parent.Swal.fire({ icon: 'warning', title: 'Stock Insuficiente', text: `Solo quedan ${prod.stock_kg.toFixed(3)} kg disponibles`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
        const precioUsd = round2(kg * prod.precio_kg_usd);
        const precioBs = round2(precioUsd * tasa);
        carrito.push({ id: prod.id, nombre: prod.nombre, cant: 1, precio_bs: precioBs, precio_usd: precioUsd, precio_kg_bs: prod.precio_kg_bs, precio_kg_usd: prod.precio_kg_usd, stock_max: prod.stock_kg, stock_critico: prod.stock_critico, es_por_peso: true, peso_kg: kg });
    } else {
        let cant = parseInt(cantStr);
        if (isNaN(cant) || cant <= 0) return window.parent.Swal.fire({ icon: 'error', title: 'Error', text: 'Cantidad no válida', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        if (cant > prod.stock) return window.parent.Swal.fire({ icon: 'warning', title: 'Stock Insuficiente', text: `Solo quedan ${prod.stock} disponibles`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
        const idx = carrito.findIndex(item => item.id === prod.id && !item.es_por_peso);
        if (idx !== -1) {
            if (carrito[idx].cant + cant > prod.stock) return window.parent.Swal.fire({ icon: 'warning', title: 'Límite de Stock', text: 'No puedes agregar más unidades', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
            carrito[idx].cant += cant;
        } else carrito.push({ id: prod.id, nombre: prod.nombre, cant, precio_bs: parseFloat(prod.p_venta_bs), precio_usd: prod.p_venta_usd, stock_max: prod.stock, stock_critico: prod.stock_critico });
    }
    domCant.value = '';
    domCant.placeholder = "Cant.";
    domBuscar.value = '';
    buscarEnTiempoReal();
    actualizarVistaCarrito();
    scrollAlFinal('#carrito-items', 50);
}

function actualizarVistaCarrito() {
    totalFinalBs = 0;
    if (!carrito.length) {
        domCarritoItems.innerHTML = `<div class="flex items-center justify-center h-full text-slate-400 text-xs font-medium">🛒 No hay productos en el carrito</div>`;
        domLblTotalBs.textContent = '0,00 Bs'; domLblTotalUsd.textContent = '0,00 $'; saveStateToLocal(); return;
    }
    domCarritoItems.innerHTML = carrito.map((item, idx) => {
        const subBs = round2(item.cant * item.precio_bs); totalFinalBs = round2(totalFinalBs + subBs);
        const subUsd = round2(item.cant * (item.precio_usd || (item.precio_bs / tasa)));
        let cantidadColumna, precioUnitarioBsMostrar, precioUnitarioUsdMostrar;
        if (item.es_por_peso) {
            const pesoMostrar = (item.peso_kg % 1 === 0) ? item.peso_kg + ' kg' : item.peso_kg.toFixed(3) + ' kg';
            cantidadColumna = `<span class="w-8 text-center font-bold text-sm">${pesoMostrar}</span>`;
            precioUnitarioBsMostrar = formatearBs(item.precio_kg_bs) + '/kg';
            precioUnitarioUsdMostrar = formatearUsd(item.precio_kg_usd) + '/kg';
        } else {
            cantidadColumna = `
                <button onclick="disminuirCantidad(${idx})" class="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-md transition-colors">−</button>
                <span class="w-8 text-center font-bold text-sm">${item.cant}</span>
                <button onclick="aumentarCantidad(${idx})" class="w-6 h-6 flex items-center justify-center bg-blue-100 hover:bg-blue-200 text-blue-600 font-bold rounded-md transition-colors">+</button>`;
            precioUnitarioBsMostrar = formatearBs(item.precio_bs);
            precioUnitarioUsdMostrar = formatearUsd(item.precio_usd);
        }
        const stockMostrar = item.es_por_peso ? ((item.stock_max % 1 === 0) ? item.stock_max : item.stock_max.toFixed(3)) : item.stock_max;
        return `<div class="bg-white border border-slate-200 rounded-xl flex items-center px-4 py-2.5 shadow-sm hover:shadow-md transition-shadow">
            <div class="w-[32%] pr-2"><p class="text-[12px] font-bold text-zinc-700 truncate">${escapeHtml(item.nombre)}</p><p class="text-[10px] text-slate-400">Stock: ${stockMostrar}</p></div>
            <div class="w-[18%] flex items-center justify-center gap-1">${cantidadColumna}</div>
            <div class="w-[18%] flex flex-col items-end pr-2"><p class="text-[11px] font-bold text-slate-700">${precioUnitarioBsMostrar}</p><p class="text-[10px] text-slate-400">${precioUnitarioUsdMostrar}</p></div>
            <div class="w-[22%] flex flex-col items-end pr-2"><p class="text-[12px] font-black text-blue-600">${formatearBs(subBs)}</p><p class="text-[10px] font-bold text-blue-400">${formatearUsd(subUsd)}</p></div>
            <div class="w-[10%] flex justify-center"><button onclick="eliminarItem(${idx})" class="w-7 h-7 flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-500 font-bold text-sm rounded-lg transition-colors border border-red-200">✕</button></div>
        </div>`;
    }).join('');
    domLblTotalBs.textContent = formatearBs(totalFinalBs);
    domLblTotalUsd.textContent = formatearUsd(round2(totalFinalBs/tasa));
    saveStateToLocal();
}

function aumentarCantidad(index) {
    if (carrito[index].cant >= carrito[index].stock_max) return window.parent.Swal.fire({ icon: 'warning', title: 'Límite de Stock', text: `Máximo disponible: ${carrito[index].stock_max}`, toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
    carrito[index].cant++; actualizarVistaCarrito();
}
function disminuirCantidad(index) { carrito[index].cant > 1 ? (carrito[index].cant--, actualizarVistaCarrito()) : eliminarItem(index); }
function eliminarItem(index) { carrito.splice(index, 1); actualizarVistaCarrito(); }
function limpiarVenta() {
    carrito = []; pagosMixtos = []; cobroMixtoCompletado = false; pagosMixtosTemp = [];
    domCliNom.value = ''; domCliTel.value = ''; domBuscar.value = ''; domCant.value = '';
    clienteSeleccionadoLista = false;
    localStorage.removeItem('inovix_ventas_state'); localStorage.removeItem('inovix_modal_state');
    actualizarDatosVentas(); actualizarVistaCarrito();
}
function guardarCarritoActualEnEspera() {
    if (!carrito.length) return window.parent.Swal.fire({ icon: 'info', title: 'Mostrador Vacío', text: 'No hay productos para pausar.', confirmButtonColor: '#2563eb' });
    carritosEnEspera.push({ id: Date.now(), hora: new Date().toLocaleTimeString('es-VE', {hour:'2-digit', minute:'2-digit'}), cliente: domCliNom.value.trim() || "Cliente Anónimo", telefono: domCliTel.value.trim(), total_bs: totalFinalBs, items: [...carrito], clienteSeleccionadoLista });
    guardarCarritosEnEspera();
    window.parent.Swal.fire({ icon: 'success', title: 'Venta Pausada', text: 'El mostrador está libre para el siguiente cliente.', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
    limpiarVenta();
}

function abrirModalCarritosGuardados() {
    const contenedor = document.getElementById('lista-carritos-guardados');
    if (!contenedor) return;
    if (!carritosEnEspera.length) {
        contenedor.innerHTML = '<p class="text-center text-slate-500 text-[13px] py-10">No hay ventas en espera.</p>';
    } else {
        contenedor.innerHTML = carritosEnEspera.map((c, idx) => `
            <div class="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100 hover:shadow-sm transition-shadow">
                <div>
                    <p class="font-bold text-zinc-700 text-[11px]">${escapeHtml(c.cliente)}</p>
                    <p class="text-[9px] text-slate-500">${c.hora} — ${c.items.length} producto(s) | Bs ${formatearBs(c.total_bs)}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="recuperarCarritoEnEspera(${idx})" class="px-3 py-1.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg hover:bg-blue-100 transition-colors">Cargar</button>
                    <button onclick="descartarCarritoEnEspera(${idx})" class="px-3 py-1.5 bg-red-50 text-red-500 text-[10px] font-bold rounded-lg hover:bg-red-100 transition-colors">Eliminar</button>
                </div>
            </div>
        `).join('');
    }
    modalCarritos.style.display = 'flex';
}
function cerrarModalCarritosGuardados() { modalCarritos.style.display = 'none'; }

function recuperarCarritoEnEspera(index) {
    const guardado = carritosEnEspera[index];
    if (!guardado) return;
    carrito = [...guardado.items];
    domCliNom.value = guardado.cliente || '';
    domCliTel.value = guardado.telefono || '';
    clienteSeleccionadoLista = guardado.clienteSeleccionadoLista || false;
    actualizarVistaCarrito();
    carritosEnEspera.splice(index, 1);
    guardarCarritosEnEspera();
    cerrarModalCarritosGuardados();
    window.parent.Swal.fire({ icon: 'success', title: 'Venta Recuperada', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
}
function descartarCarritoEnEspera(index) { carritosEnEspera.splice(index, 1); guardarCarritosEnEspera(); abrirModalCarritosGuardados(); }
function verificarAlertasStockCritico(itemsVendidos) {}

async function finalizarFiado() {
    if (!carrito.length) return window.parent.Swal.fire({ icon: 'info', title: 'Carrito vacío', text: 'Agrega productos antes de fiar' });
    const rawName = domCliNom.value.trim().toUpperCase();
    if (!rawName || ["MOSTRADOR","CLIENTE EVENTUAL","(NUEVO CLIENTE)"].includes(rawName))
        return window.parent.Swal.fire({ icon: 'warning', title: 'Identificación requerida', text: 'Debe identificar al cliente' });
    try {
        const itemsCopia = [...carrito];
        const exito = await window.parent.electronAPI.db.registrarFiadoCompleto({ cliente: rawName, telefono: domCliTel.value.trim(), total_bs: totalFinalBs, items: carrito, es_seleccionado: clienteSeleccionadoLista });
        if (exito) { window.parent.Swal.fire({ icon: 'success', title: 'Fiado Registrado', toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 }); limpiarVenta(); verificarAlertasStockCritico(itemsCopia); }
        else window.parent.Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo registrar el fiado' });
    } catch (error) { window.parent.Swal.fire({ icon: 'error', title: 'Error', text: error.message }); }
}

function abrirModalGastos() {
  document.getElementById('gasto-desc').value = '';
  document.getElementById('gasto-monto').value = '';
  document.getElementById('gasto-metodo').value = 'Efectivo Bs';
  modalGastos.style.display = 'flex';
  setTimeout(() => {
    const montoInput = document.getElementById('gasto-monto');
    if (montoInput) {
      montoInput.type = 'text';
      montoInput.placeholder = '0,00';
      montoInput.removeEventListener('input', formatearMontoGasto);
      montoInput.addEventListener('input', formatearMontoGasto);
    }
    document.getElementById('gasto-desc').focus();
  }, 100);
}

function formatearMontoGasto(e) {
  let val = e.target.value;
  val = val.replace(/[^\d.,]/g, '');
  const comaIndex = val.indexOf(',');
  if (comaIndex !== -1) {
    val = val.substring(0, comaIndex + 1) + val.substring(comaIndex + 1).replace(/,/g, '');
  }
  e.target.value = val;
}

function cerrarModalGastos() { modalGastos.style.display = 'none'; }
async function procesarRegistroGasto() {
    const desc = document.getElementById('gasto-desc').value.trim(), montoStr = document.getElementById('gasto-monto').value, metodo = document.getElementById('gasto-metodo').value;
    const monto = parsearNumero(montoStr);
    if (!desc) return window.parent.Swal.fire({ icon: 'warning', title: 'Falta Descripción', text: 'Debes indicar en qué se gastó el dinero.', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
    if (isNaN(monto) || monto <= 0) return window.parent.Swal.fire({ icon: 'warning', title: 'Monto Inválido', text: 'Ingresa un monto válido mayor a 0.', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
    const esMonedaExtranjera = METODOS_DIVISAS_BINANCE.includes(metodo);
    const bs = esMonedaExtranjera ? round2(monto * tasa) : round2(monto);
    const usd = esMonedaExtranjera ? round8(monto) : (tasa > 0 ? round2(monto / tasa) : 0);
    try { if (await window.parent.electronAPI.db.registrarGasto(desc, bs, usd, metodo)) { window.parent.Swal.fire({ icon: 'success', title: 'Gasto Registrado', text: 'Salida de dinero registrada correctamente.', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 }); cerrarModalGastos(); } else window.parent.Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar el gasto.' }); } catch (e) { window.parent.Swal.fire({ icon: 'error', title: 'Error', text: e.message }); }
}
function cerrarModalRedondeo() { modalRedondeo.style.display = 'none'; }

function abrirModalEscaner() {
    if (modalEscaner) { modalEscaner.style.display = 'flex'; setTimeout(() => { if (inputEscanner) { inputEscanner.value = ''; inputEscanner.focus(); } }, 100); }
}
function cerrarModalEscaner() { if (modalEscaner) modalEscaner.style.display = 'none'; }

async function procesarCodigoBarras(codigo) {
    if (codigo.length === 13 && /^\d{13}$/.test(codigo) && codigo[0] === '2') {
        const sku = codigo.substring(1, 7);
        const pesoGramos = parseInt(codigo.substring(7, 12), 10);
        if (isNaN(pesoGramos) || pesoGramos <= 0) {
            window.parent.Swal.fire({ icon: 'error', title: 'Código inválido', text: 'El peso no es válido.' }); return;
        }
        const pesoKg = pesoGramos / 1000;
        try {
            const producto = await window.parent.electronAPI.db.obtenerProductoPorSku(sku);
            if (!producto) { window.parent.Swal.fire({ icon: 'warning', title: 'Producto no encontrado', text: `No hay producto con código ${sku}` }); return; }
            if (!producto.es_por_peso) { window.parent.Swal.fire({ icon: 'warning', title: 'Producto no configurado por peso', text: 'Este producto no se vende por kilogramos.' }); return; }
            const precioKgUsd = producto.precio_kg_usd;
            const precioUsd = round2(pesoKg * precioKgUsd);
            const precioBs = round2(precioUsd * tasa);
            const stockKgDisponible = producto.stock_kg || 0;
            if (stockKgDisponible > 0 && pesoKg > stockKgDisponible) {
                window.parent.Swal.fire({ icon: 'error', title: 'Stock insuficiente', text: `Solo quedan ${stockKgDisponible.toFixed(3)} kg de ${producto.nombre}` }); return;
            }
            carrito.push({ id: producto.id, nombre: producto.nombre, cant: 1, precio_bs: precioBs, precio_usd: precioUsd, precio_kg_bs: producto.precio_kg_bs, precio_kg_usd: producto.precio_kg_usd, stock_max: stockKgDisponible, stock_critico: producto.stock_critico, es_por_peso: true, peso_kg: pesoKg });
            actualizarVistaCarrito();
            const pesoMostrarToast = (pesoKg % 1 === 0) ? pesoKg + ' kg' : pesoKg.toFixed(3) + ' kg';
            window.parent.Swal.fire({ icon: 'success', title: 'Producto agregado', text: `${escapeHtml(producto.nombre)} (${pesoMostrarToast}) - Bs ${precioBs.toFixed(2)}`, toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
            cerrarModalEscaner();
        } catch (err) { window.parent.Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
    } else {
        window.parent.Swal.fire({ icon: 'info', title: 'Código no reconocido', text: 'No es un código de barras de peso variable. Ingrese manualmente el producto.' });
    }
}
function procesarCodigoBarrasDesdeBoton() { const codigo = inputEscanner.value.trim(); if (codigo) { procesarCodigoBarras(codigo); inputEscanner.value = ''; } }

Object.assign(window, {
    abrirModalPago, cerrarModalPago, confirmarPagoModal,
    agregarFilaPagoMixto: agregarFilaPagoMixtoIntegrado,
    borrarPagoMixto: borrarPagoMixtoIntegrado,
    finalizarFiado, abrirModalGastos, cerrarModalGastos, procesarRegistroGasto,
    guardarCarritoActualEnEspera, abrirModalCarritosGuardados, cerrarModalCarritosGuardados,
    recuperarCarritoEnEspera, descartarCarritoEnEspera, limpiarVenta,
    aumentarCantidad, disminuirCantidad, eliminarItem, agregarAlCarrito,
    cerrarModalRedondeo,
    abrirModalEscaner, cerrarModalEscaner, procesarCodigoBarras,
    procesarCodigoBarrasDesdeBoton
});
initVentas();