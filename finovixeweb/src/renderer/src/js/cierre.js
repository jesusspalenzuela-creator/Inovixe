let estadoArqueo = {}, cierreBloqueado = false, gastosDelDiaGlobal = [], tasaActualCierre = 1.0;

const METODOS_EXTRANJEROS = ['Divisas-USD', 'Zelle', 'Zinli', 'Binance-USDT', 'Binance-USDC'];
const METODOS_DECIMAL_EXT = ['Binance-USDT', 'Binance-USDC', 'Zelle', 'Zinli'];

const METODOS_VENTA = [
  { id: "Efectivo Bs", nombre: "💵 Efectivo Bs", moneda: "Bs", colorHeader: "from-blue-500 to-blue-600", colorBorde: "border-blue-200" },
  { id: "Pago Móvil Bs", nombre: "📱 Pago Móvil Bs", moneda: "Bs", colorHeader: "from-blue-400 to-blue-500", colorBorde: "border-blue-200" },
  { id: "Transferencia Bs", nombre: "🏦 Transferencia Bs", moneda: "Bs", colorHeader: "from-indigo-400 to-indigo-500", colorBorde: "border-indigo-200" },
  { id: "Punto de Venta Bs", nombre: "💳 Punto de Venta Bs", moneda: "Bs", colorHeader: "from-cyan-400 to-cyan-500", colorBorde: "border-cyan-200" },
  { id: "Divisas-USD", nombre: "💲 Efectivo USD", moneda: "$", colorHeader: "from-violet-500 to-violet-600", colorBorde: "border-violet-200" },
  { id: "Zelle", nombre: "🔵 Zelle USD", moneda: "$", colorHeader: "from-emerald-500 to-emerald-600", colorBorde: "border-emerald-200" },
  { id: "Zinli", nombre: "🟢 Zinli USD", moneda: "$", colorHeader: "from-green-400 to-green-500", colorBorde: "border-green-200" },
  { id: "Binance-USDT", nombre: "₮ Binance USDT", moneda: "USDT", colorHeader: "from-teal-500 to-teal-600", colorBorde: "border-teal-200" },
  { id: "Binance-USDC", nombre: "₮ Binance USDC", moneda: "USDC", colorHeader: "from-teal-400 to-teal-500", colorBorde: "border-teal-200" },
];

const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function esMetodoExtranjero(metodo) { return METODOS_EXTRANJEROS.includes(metodo); }

function parseMontoInput(str) { if (!str) return 0; let s = str.toString().trim(); s = s.replace(/\./g, '').replace(',', '.'); return parseFloat(s) || 0; }

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

function formatearNumero(val, moneda, metodoId = null) {
  if (val === 0) return '0,00';
  if (metodoId && METODOS_DECIMAL_EXT.includes(metodoId)) {
    return formatearMontoExtranjeroVisual(val);
  }
  if (moneda === 'Bs') return val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (moneda === '$' || moneda === 'USDT' || moneda === 'USDC') {
    return formatearMontoExtranjeroVisual(val);
  }
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function initCierre() {
  const hoy = new Date();
  document.getElementById('cierre-fecha').value = new Date(hoy.getTime() - (hoy.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  try {
    const tasa = await window.parent.electronAPI.db.obtenerConfig("tasa_usd");
    tasaActualCierre = tasa ? parseFloat(tasa) : 1.0;
  } catch (e) { tasaActualCierre = 1.0; }
  await cargarDatos();
}

function normalizarMetodoVenta(metodoCompleto) {
  if (!metodoCompleto) return null;
  const s = metodoCompleto.trim();
  if (s === "Efectivo Bs") return "Efectivo Bs";
  if (s === "Pago Móvil Bs" || s === "Pago Móvil") return "Pago Móvil Bs";
  if (s === "Transferencia Bs" || s === "Transferencia") return "Transferencia Bs";
  if (s === "Punto de Venta Bs" || s === "Punto de Venta" || s === "Punto") return "Punto de Venta Bs";
  if (s === "Divisas-USD" || s === "Efectivo USD") return "Divisas-USD";
  if (s === "Zelle") return "Zelle";
  if (s === "Zinli") return "Zinli";
  if (s === "Binance-USDT" || s === "Binance - USDT") return "Binance-USDT";
  if (s === "Binance-USDC" || s === "Binance - USDC") return "Binance-USDC";
  const upper = s.toUpperCase();
  if (upper.includes("BINANCE-USDT")) return "Binance-USDT";
  if (upper.includes("BINANCE-USDC")) return "Binance-USDC";
  if (upper.includes("ZELLE")) return "Zelle";
  if (upper.includes("ZINLI")) return "Zinli";
  if (upper.includes("DIVISAS-USD") || (upper.includes("USD") && !upper.includes("USDT") && !upper.includes("USDC"))) return "Divisas-USD";
  if (upper.includes("PUNTO")) return "Punto de Venta Bs";
  if (upper.includes("PAGO MÓVIL") || upper.includes("PAGO MOVIL")) return "Pago Móvil Bs";
  if (upper.includes("TRANSFERENCIA")) return "Transferencia Bs";
  if (upper.includes("EFECTIVO")) return "Efectivo Bs";
  return null;
}

async function cargarDatos() {
  const fecha = document.getElementById('cierre-fecha').value;
  if (!fecha) return;
  const reg = await window.parent.electronAPI.db.verificarCierre(fecha);
  if (reg) {
    cierreBloqueado = true;
    estadoArqueo = JSON.parse(reg.arqueo);
    document.getElementById('btn-confirmar').classList.add('hidden');
    document.getElementById('btn-limpiar').classList.add('hidden');
    document.getElementById('btn-pdf-cierre').classList.remove('hidden');
    document.getElementById('badge-cerrado').classList.remove('hidden');
    document.getElementById('arqueo-instruccion').textContent = "Visualización de solo lectura.";
    renderizarGrid(); return;
  }
  cierreBloqueado = false;
  document.getElementById('btn-confirmar').classList.remove('hidden');
  document.getElementById('btn-limpiar').classList.remove('hidden');
  document.getElementById('btn-pdf-cierre').classList.add('hidden');
  document.getElementById('badge-cerrado').classList.add('hidden');
  document.getElementById('arqueo-instruccion').textContent = "Ingresa lo contado en cada método";
  const { ingresos, gastos } = await window.parent.electronAPI.db.obtenerResumenCajaV2(fecha);
  estadoArqueo = {};
  METODOS_VENTA.forEach(m => { estadoArqueo[m.id] = { esperado: 0, contado: 0, gastos: 0, moneda: m.moneda, nombre: m.nombre, bloqueado: false }; });

  ingresos.forEach(i => {
    const metodoId = normalizarMetodoVenta(i.metodo);
    if (metodoId && estadoArqueo[metodoId]) {
      const esExtranjera = ['$','€','COP','USDT','USDC'].includes(estadoArqueo[metodoId].moneda);
      const monto = esExtranjera ? (i.suma_usd || 0) : (i.suma_bs || 0);
      estadoArqueo[metodoId].esperado += monto;
    }
  });

  gastos.forEach(g => {
    const metodoId = normalizarMetodoVenta(g.metodo);
    if (metodoId && estadoArqueo[metodoId]) {
      const esExtranjera = ['$','€','COP','USDT','USDC'].includes(estadoArqueo[metodoId].moneda);
      const monto = esExtranjera ? (g.suma_usd || 0) : (g.suma_bs || 0);
      estadoArqueo[metodoId].gastos += monto;
    }
  });

  const tempKey = `cierreTemp_${fecha}`;
  const tempData = localStorage.getItem(tempKey);
  if (tempData) {
    try {
      const saved = JSON.parse(tempData);
      Object.keys(saved).forEach(id => {
        if (estadoArqueo[id]) {
          estadoArqueo[id].contado = saved[id].contado ?? 0;
          estadoArqueo[id].bloqueado = saved[id].bloqueado ?? false;
        }
      });
    } catch (e) {}
  }

  renderizarGrid();
}

function renderizarGrid() {
  const grid = document.getElementById('grid-metodos');
  grid.innerHTML = METODOS_VENTA.map(metodo => {
    const d = estadoArqueo[metodo.id];
    if (!d) return '';
    if (d.esperado === 0 && d.gastos === 0 && d.contado === 0 && !cierreBloqueado) return '';
    const neto = METODOS_DECIMAL_EXT.includes(metodo.id) ? (d.esperado - d.gastos) : round2(d.esperado - d.gastos);
    const dif = METODOS_DECIMAL_EXT.includes(metodo.id) ? (d.contado - neto) : round2(d.contado - neto);
    const idSan = metodo.id.replace(/[^a-zA-Z0-9]/g, '');
    let colorDif, bgDif, iconoDif;
    if (Math.abs(dif) < 0.01) { colorDif = 'text-emerald-600'; bgDif = 'bg-emerald-100'; iconoDif = '✓'; }
    else if (dif > 0) { colorDif = 'text-blue-600'; bgDif = 'bg-blue-100'; iconoDif = '↑'; }
    else { colorDif = 'text-rose-600'; bgDif = 'bg-rose-100'; iconoDif = '↓'; }

    const bloqueado = d.bloqueado || cierreBloqueado;
    const guardarBtn = !bloqueado ? `<button onclick="guardarContadoIndividual('${metodo.id}')" class="btn-accion-tarjeta btn-guardar">Guardar</button>` : '';
    const editarBtn = bloqueado && !cierreBloqueado ? `<button onclick="editarContadoIndividual('${metodo.id}')" class="btn-accion-tarjeta btn-editar">Editar</button>` : '';

    return `
      <div class="metodo-card">
        <div class="metodo-header">
          <div class="flex items-center gap-2">
            <div class="icono-metodo bg-gradient-to-br ${metodo.colorHeader}">
              <span class="text-white text-lg">${escapeHtml(metodo.nombre.split(' ')[0])}</span>
            </div>
            <span class="text-[11px] font-bold text-slate-700">${escapeHtml(metodo.nombre.split(' ').slice(1).join(' '))}</span>
          </div>
          <span class="text-[9px] font-bold text-white bg-gradient-to-r ${metodo.colorHeader} px-2 py-1 rounded-full">${escapeHtml(metodo.moneda)}</span>
        </div>
        <div class="space-y-2 flex-1">
          <div class="flex justify-between"><span class="text-[10px] text-slate-500">📥 Ingresos</span><span class="text-[10px] font-bold text-emerald-600">+${formatearNumero(d.esperado, metodo.moneda, metodo.id)}</span></div>
          <div class="flex justify-between"><span class="text-[10px] text-slate-500">📤 Gastos</span><span class="text-[10px] font-bold text-rose-500">${d.gastos > 0 ? '-' : ''}${formatearNumero(d.gastos, metodo.moneda, metodo.id)}</span></div>
          <div class="border-t border-slate-100 pt-2">
            <div class="flex justify-between">
              <span class="text-[10px] font-bold text-slate-600">Neto</span>
              <span class="text-[11px] font-black text-zinc-800">${formatearNumero(neto, metodo.moneda, metodo.id)} ${escapeHtml(metodo.moneda)}</span>
            </div>
          </div>
          <div class="pt-2">
            <div class="flex items-center gap-1">
              <input type="text" inputmode="decimal" id="input-${idSan}" ${bloqueado ? 'disabled' : ''}
                oninput="actualizarContadoLive('${metodo.id}', this)"
                onblur="formatearContado('${metodo.id}', this, '${metodo.moneda}')"
                onfocus="desformatearContado('${metodo.id}', this)"
                value="${d.contado > 0 ? formatearNumero(d.contado, metodo.moneda, metodo.id) : ''}"
                placeholder="0,00"
                class="input-contado flex-1 h-8 px-2 text-[11px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200 font-bold text-zinc-800 placeholder-slate-400">
              <span class="text-[9px] font-bold text-slate-400 w-8 text-center">${escapeHtml(metodo.moneda)}</span>
            </div>
            <div class="flex justify-end gap-2 mt-2">
              ${guardarBtn}
              ${editarBtn}
            </div>
          </div>
          <div class="flex justify-between pt-2 border-t border-slate-50">
            <span class="text-[9px] text-slate-500">Diferencia</span>
            <span id="dif-${idSan}" class="text-[9px] font-black px-2 py-0.5 rounded-full ${colorDif} ${bgDif}">${iconoDif} ${Math.abs(dif)<0.01?'0,00':(dif>0?'+':'')+formatearNumero(dif,metodo.moneda,metodo.id)} ${escapeHtml(metodo.moneda)}</span>
          </div>
        </div>
      </div>`;
  }).join('');
  actualizarMensajeEstado();
}

function guardarContadoIndividual(metodoId) {
  if (cierreBloqueado) return;
  const input = document.getElementById(`input-${metodoId.replace(/[^a-zA-Z0-9]/g, '')}`);
  if (!input) return;
  const val = parseMontoInput(input.value);
  estadoArqueo[metodoId].contado = val;
  estadoArqueo[metodoId].bloqueado = true;
  input.disabled = true;
  formatearContado(metodoId, input, estadoArqueo[metodoId].moneda);

  const fecha = document.getElementById('cierre-fecha').value;
  const tempKey = `cierreTemp_${fecha}`;
  const tempData = {};
  Object.keys(estadoArqueo).forEach(id => {
    tempData[id] = {
      contado: estadoArqueo[id].contado,
      bloqueado: estadoArqueo[id].bloqueado
    };
  });
  localStorage.setItem(tempKey, JSON.stringify(tempData));

  renderizarGrid();
}

function editarContadoIndividual(metodoId) {
  if (cierreBloqueado) return;
  estadoArqueo[metodoId].bloqueado = false;
  const input = document.getElementById(`input-${metodoId.replace(/[^a-zA-Z0-9]/g, '')}`);
  if (input) {
    input.disabled = false;
    input.focus();
  }
  renderizarGrid();
}

function actualizarContadoLive(metodoId, input) {
  if (cierreBloqueado || estadoArqueo[metodoId]?.bloqueado) return;
  estadoArqueo[metodoId].contado = parseMontoInput(input.value);
  actualizarDiferenciaIndividual(metodoId);
  actualizarMensajeEstado();
}

function actualizarDiferenciaIndividual(metodoId) {
  const d = estadoArqueo[metodoId];
  if (!d) return;
  const neto = METODOS_DECIMAL_EXT.includes(metodoId) ? (d.esperado - d.gastos) : round2(d.esperado - d.gastos);
  const dif = METODOS_DECIMAL_EXT.includes(metodoId) ? (d.contado - neto) : round2(d.contado - neto);
  const idSan = metodoId.replace(/[^a-zA-Z0-9]/g, '');
  const el = document.getElementById(`dif-${idSan}`);
  if (!el) return;
  let colorDif, bgDif, iconoDif;
  if (Math.abs(dif) < 0.01) { colorDif = 'text-emerald-600'; bgDif = 'bg-emerald-100'; iconoDif = '✓'; }
  else if (dif > 0) { colorDif = 'text-blue-600'; bgDif = 'bg-blue-100'; iconoDif = '↑'; }
  else { colorDif = 'text-rose-600'; bgDif = 'bg-rose-100'; iconoDif = '↓'; }
  el.className = `text-[9px] font-black px-2 py-0.5 rounded-full ${colorDif} ${bgDif}`;
  el.textContent = `${iconoDif} ${Math.abs(dif)<0.01?'0,00':(dif>0?'+':'')+formatearNumero(dif,d.moneda,metodoId)} ${d.moneda}`;
}

function desformatearContado(metodoId, input) {
  if (cierreBloqueado || estadoArqueo[metodoId]?.bloqueado) return;
  const d = estadoArqueo[metodoId];
  if (!d) return;
  input.value = d.contado === 0 ? '' : d.contado.toString().replace('.', ',');
}

function formatearContado(metodoId, input, moneda) {
  if (cierreBloqueado) return;
  const val = parseMontoInput(input.value);
  estadoArqueo[metodoId].contado = val;
  input.value = val === 0 ? '' : formatearNumero(val, moneda, metodoId);
  actualizarDiferenciaIndividual(metodoId);
  actualizarMensajeEstado();
}

function actualizarMensajeEstado() {
  const lbl = document.getElementById('mensaje-estado');
  let ok = true, msgs = [];
  Object.keys(estadoArqueo).forEach(id => {
    const d = estadoArqueo[id];
    const neto = METODOS_DECIMAL_EXT.includes(id) ? (d.esperado - d.gastos) : round2(d.esperado - d.gastos);
    if (neto === 0 && d.contado === 0) return;
    const dif = METODOS_DECIMAL_EXT.includes(id) ? (d.contado - neto) : round2(d.contado - neto);
    if (Math.abs(dif) >= 0.01) { ok = false; msgs.push(`${d.nombre.split(' ')[0]}: ${dif>0?'+':''}${formatearNumero(dif,d.moneda,id)} ${d.moneda}`); }
  });
  if (ok) { lbl.textContent = "✅ CAJA CUADRADA"; lbl.className = "font-black text-[11px] mr-auto px-3 py-1.5 rounded border text-emerald-600 bg-emerald-50 border-emerald-200"; }
  else if (msgs.length) { lbl.textContent = `⚠️ ${msgs.join(' | ')}`; lbl.className = "font-black text-[11px] mr-auto px-3 py-1.5 rounded border text-rose-600 bg-rose-50 border-rose-200"; }
  else { lbl.textContent = "Sin movimientos"; lbl.className = "font-black text-[11px] mr-auto px-3 py-1.5 rounded border text-slate-500 bg-slate-50 border-slate-200"; }
}

const limpiarArqueo = () => {
  if (!cierreBloqueado) {
    Object.keys(estadoArqueo).forEach(k => { estadoArqueo[k].contado = 0; estadoArqueo[k].bloqueado = false; });
    const fecha = document.getElementById('cierre-fecha').value;
    localStorage.removeItem(`cierreTemp_${fecha}`);
    renderizarGrid();
  }
};

async function confirmarCierre() {
  if (cierreBloqueado) return;
  if ((await window.parent.Swal.fire({ title: '¿Cerrar Caja?', text: "Se bloquearán los montos.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#2563eb' })).isConfirmed) {
    if (await window.parent.electronAPI.db.guardarCierre({ fecha: document.getElementById('cierre-fecha').value, estadoMensaje: document.getElementById('mensaje-estado').textContent, arqueo: estadoArqueo })) {
      localStorage.removeItem(`cierreTemp_${document.getElementById('cierre-fecha').value}`);
      window.parent.Swal.fire('Éxito', 'Cierre realizado.', 'success'); cargarDatos();
    }
  }
}

async function abrirModalListaGastos() {
  gastosDelDiaGlobal = await window.parent.electronAPI.db.obtenerGastosDia(document.getElementById('cierre-fecha').value);
  document.getElementById('tabla-lista-gastos').innerHTML = !gastosDelDiaGlobal.length
    ? '<tr><td colspan="3" class="text-center py-6 text-slate-400 font-medium text-xs">Sin gastos registrados</td></tr>'
    : gastosDelDiaGlobal.map(g => {
        const metodoId = normalizarMetodoVenta(g.metodo);
        let montoMostrar = '';
        if (metodoId) {
          const esExt = esMetodoExtranjero(g.metodo);
          const moneda = METODOS_VENTA.find(m => m.id === metodoId)?.moneda || '$';
          if (esExt) {
            const valUsd = parseFloat(g.monto_usd || 0);
            if (valUsd > 0) {
              montoMostrar = `${formatearMontoExtranjeroVisual(valUsd)} ${moneda}`;
            } else {
              const valBs = parseFloat(g.monto_bs || 0);
              if (valBs > 0) {
                const convertido = valBs / tasaActualCierre; // ← CORREGIDO
                montoMostrar = `${formatearMontoExtranjeroVisual(convertido)} ${moneda}`;
              } else {
                montoMostrar = `${moneda} 0,00`;
              }
            }
          } else {
            const val = parseFloat(g.monto_bs || 0);
            montoMostrar = `Bs ${val.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
          }
        } else {
          const esExt = esMetodoExtranjero(g.metodo);
          const val = esExt ? parseFloat(g.monto_usd || 0) : parseFloat(g.monto_bs || 0);
          montoMostrar = esExt ? `${formatearMontoExtranjeroVisual(val)} $` : `Bs ${val.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
        }
        return `<tr class="hover:bg-slate-50">
          <td class="py-2.5 px-4 font-bold text-zinc-700 text-[11px]">${escapeHtml(g.descripcion)}</td>
          <td class="py-2.5 px-4 text-[10px] font-bold text-slate-500">${escapeHtml(g.metodo)}</td>
          <td class="py-2.5 px-4 font-black text-rose-600 text-right text-[11px]">${montoMostrar}</td>
        </tr>`;
      }).join('');
  document.getElementById('modal-lista-gastos').classList.remove('hidden');
}

function cerrarModalListaGastos() { document.getElementById('modal-lista-gastos').classList.add('hidden'); }

async function descargarCierrePDF() {
  const f = document.getElementById('cierre-fecha').value;
  window.parent.Swal.fire({ title: 'Generando PDF...', didOpen: () => window.parent.Swal.showLoading() });
  const container = document.createElement('div');
  container.style.cssText = 'padding:20px; font-family: Arial; font-size: 9px;';
  let filas = Object.keys(estadoArqueo).filter(id => { const d=estadoArqueo[id]; return d.esperado!==0||d.gastos!==0||d.contado!==0; }).map(id => {
    const d=estadoArqueo[id]; const neto = METODOS_DECIMAL_EXT.includes(id) ? (d.esperado - d.gastos) : round2(d.esperado - d.gastos);
    const dif = METODOS_DECIMAL_EXT.includes(id) ? (d.contado - neto) : round2(d.contado - neto);
    return `<tr><td style="padding:4px 6px;border-bottom:1px solid #eee;font-weight:bold">${escapeHtml(d.nombre)}</td><td style="text-align:right;padding:4px 6px;border-bottom:1px solid #eee;color:green">+${formatearNumero(d.esperado,d.moneda,id)}</td><td style="text-align:right;padding:4px 6px;border-bottom:1px solid #eee;color:red">${d.gastos>0?'-':''}${formatearNumero(d.gastos,d.moneda,id)}</td><td style="text-align:right;padding:4px 6px;border-bottom:1px solid #eee;font-weight:bold">${formatearNumero(neto,d.moneda,id)} ${escapeHtml(d.moneda)}</td><td style="text-align:right;padding:4px 6px;border-bottom:1px solid #eee">${formatearNumero(d.contado,d.moneda,id)}</td><td style="text-align:right;padding:4px 6px;border-bottom:1px solid #eee;font-weight:bold;color:${Math.abs(dif)<0.01?'green':'red'}">${dif>0?'+':''}${formatearNumero(dif,d.moneda,id)} ${escapeHtml(d.moneda)}</td></tr>`;
  }).join('');
  container.innerHTML = `<div style="text-align:center;margin-bottom:15px"><h2>REPORTE CIERRE DE CAJA</h2><p>Fecha: ${escapeHtml(f)}</p></div><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f1f5f9"><th style="text-align:left;padding:6px;border-bottom:2px solid #333">Método</th><th style="text-align:right;padding:6px;border-bottom:2px solid #333">Ingresos</th><th style="text-align:right;padding:6px;border-bottom:2px solid #333">Gastos</th><th style="text-align:right;padding:6px;border-bottom:2px solid #333">Neto</th><th style="text-align:right;padding:6px;border-bottom:2px solid #333">Contado</th><th style="text-align:right;padding:6px;border-bottom:2px solid #333">Dif</th></tr></thead><tbody>${filas}</tbody></table><br><div style="text-align:center;padding:10px;border:1px solid #333;font-weight:bold;font-size:10px">${escapeHtml(document.getElementById('mensaje-estado').textContent)}</div>`;
  const pdfBase64 = await html2pdf().from(container).outputPdf('datauristring');
  const result = await window.parent.electronAPI.utils.guardarPDF(`Cierre_Caja_${f}.pdf`, pdfBase64.split(',')[1]);
  window.parent.Swal.close();
  if (result?.success) window.parent.Swal.fire({ icon: 'success', title: '¡PDF Descargado!', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
}

async function descargarGastosPDF() {
  const f = document.getElementById('cierre-fecha').value;
  window.parent.Swal.fire({ title: 'Generando PDF...', didOpen: () => window.parent.Swal.showLoading() });
  const container = document.createElement('div');
  container.style.cssText = 'padding:20px; font-family: Arial; font-size: 9px;';
  const filasGastos = gastosDelDiaGlobal.map(g => {
    const metodoId = normalizarMetodoVenta(g.metodo);
    let montoMostrar = '';
    if (metodoId) {
      const esExt = esMetodoExtranjero(g.metodo);
      if (esExt) {
        const val = parseFloat(g.monto_usd || 0);
        if (val > 0) {
          montoMostrar = `${formatearMontoExtranjeroVisual(val)} ${METODOS_VENTA.find(m => m.id === metodoId)?.moneda || '$'}`;
        } else {
          const valBs = parseFloat(g.monto_bs || 0);
          if (valBs > 0) {
            const convertido = valBs / tasaActualCierre; // ← CORREGIDO
            montoMostrar = `${formatearMontoExtranjeroVisual(convertido)} ${METODOS_VENTA.find(m => m.id === metodoId)?.moneda || '$'}`;
          } else {
            montoMostrar = `${METODOS_VENTA.find(m => m.id === metodoId)?.moneda || '$'} 0,00`;
          }
        }
      } else {
        const val = parseFloat(g.monto_bs || 0);
        montoMostrar = `Bs ${val.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
      }
    } else {
      const esExt = esMetodoExtranjero(g.metodo);
      const val = esExt ? parseFloat(g.monto_usd || 0) : parseFloat(g.monto_bs || 0);
      montoMostrar = esExt ? `${formatearMontoExtranjeroVisual(val)} $` : `Bs ${val.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
    }
    return `<tr><td style="padding:4px 6px;border-bottom:1px solid #eee">${escapeHtml(g.descripcion)}</td><td style="padding:4px 6px;border-bottom:1px solid #eee">${escapeHtml(g.metodo)}</td><td style="text-align:right;padding:4px 6px;border-bottom:1px solid #eee">${montoMostrar}</td></tr>`;
  }).join('');
  container.innerHTML = `<div style="text-align:center;margin-bottom:15px"><h2>REPORTE DE GASTOS</h2><p>Fecha: ${escapeHtml(f)}</p></div><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f1f5f9"><th style="text-align:left;padding:6px;border-bottom:2px solid #333">Descripción</th><th style="text-align:left;padding:6px;border-bottom:2px solid #333">Método</th><th style="text-align:right;padding:6px;border-bottom:2px solid #333">Monto</th></tr></thead><tbody>${filasGastos}</tbody></table>`;
  const pdfBase64 = await html2pdf().from(container).outputPdf('datauristring');
  const result = await window.parent.electronAPI.utils.guardarPDF(`Gastos_${f}.pdf`, pdfBase64.split(',')[1]);
  window.parent.Swal.close();
  if (result?.success) window.parent.Swal.fire({ icon: 'success', title: '¡PDF Descargado!', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
}

Object.assign(window, { cargarDatos, actualizarContadoLive, desformatearContado, formatearContado, limpiarArqueo, confirmarCierre, abrirModalListaGastos, cerrarModalListaGastos, descargarCierrePDF, descargarGastosPDF, guardarContadoIndividual, editarContadoIndividual });
initCierre();