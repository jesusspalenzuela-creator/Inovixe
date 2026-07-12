function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function initDashboard() {
  await cargarDatosDashboard();
}

function normalizarNombreCorto(metodo) {
  const s = metodo.trim();
  if (s === 'Efectivo Bs') return 'Efectivo';
  if (s === 'Pago Móvil Bs') return 'Pago Móvil';
  if (s === 'Transferencia Bs') return 'Transferencia';
  if (s === 'Punto de Venta Bs') return 'Punto Venta';
  if (s === 'Divisas-USD') return 'Efectivo USD';
  if (s === 'Zelle') return 'Zelle';
  if (s === 'Zinli') return 'Zinli';
  if (s === 'Binance-USDT') return 'USDT';
  if (s === 'Binance-USDC') return 'USDC';
  return s;
}

function esMetodoExtranjero(metodo) {
  const metodosExtranjeros = ['Divisas-USD', 'Zelle', 'Zinli', 'Binance-USDT', 'Binance-USDC'];
  return metodosExtranjeros.includes(metodo.trim());
}

function limpiarMetodoGrafico(metodo) {
  if (!metodo) return '';
  let m = metodo.trim();
  m = m.replace(/^(Abono Fiado: |Pago Fiado: |Cobro Fiado: )/, '');
  m = m.replace(/~[\d.,]+$/, '').trim();
  return m;
}

function desglosarMetodoMixto(metodoLimpio) {
  const componentes = [];
  const segmentos = metodoLimpio.split('|');
  for (const seg of segmentos) {
    const limpio = seg.trim();
    if (!limpio) continue;
    const match = limpio.match(/^([^:]+):([^~]+)(?:~(.+))?$/);
    if (match) {
      const nombre = match[1].trim();
      const montoStr = match[2].trim();
      const monto = parseFloat(montoStr);
      if (!isNaN(monto) && monto > 0) {
        componentes.push({
          metodo: nombre,
          monto: monto,
          esExt: esMetodoExtranjero(nombre)
        });
      }
    }
  }
  return componentes;
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

function obtenerIconoMetodo(metodo) {
  if (metodo.includes('Efectivo Bs') || metodo.includes('Efectivo USD')) return '💵';
  if (metodo.includes('Pago Móvil')) return '📱';
  if (metodo.includes('Transferencia')) return '🏦';
  if (metodo.includes('Punto de Venta')) return '💳';
  if (metodo.includes('Zelle')) return '🔵';
  if (metodo.includes('Zinli')) return '🟢';
  if (metodo.includes('USDT')) return '₮';
  if (metodo.includes('USDC')) return '₮';
  return '💰';
}

function obtenerColorIcono(metodo) {
  if (metodo.includes('Efectivo')) return 'bg-amber-100 text-amber-700';
  if (metodo.includes('Pago Móvil')) return 'bg-blue-100 text-blue-700';
  if (metodo.includes('Transferencia')) return 'bg-sky-100 text-sky-700';
  if (metodo.includes('Punto de Venta')) return 'bg-indigo-100 text-indigo-700';
  if (metodo.includes('Zelle')) return 'bg-violet-100 text-violet-700';
  if (metodo.includes('Zinli')) return 'bg-emerald-100 text-emerald-700';
  if (metodo.includes('USDT')) return 'bg-teal-100 text-teal-700';
  if (metodo.includes('USDC')) return 'bg-cyan-100 text-cyan-700';
  return 'bg-slate-100 text-slate-600';
}

const formatCurrency = (value) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function cargarDatosDashboard() {
  try {
    const hoy = new Date();
    const offset = hoy.getTimezoneOffset() * 60000;
    const fechaHoy = new Date(hoy.getTime() - offset).toISOString().split('T')[0];

    const [t_raw, s_bajo, c_tot, f_pen, criticos, resumenHoy] = await Promise.all([
      window.parent.electronAPI.db.obtenerConfig("tasa_usd"),
      window.parent.electronAPI.db.getCountStockBajo(),
      window.parent.electronAPI.db.getCountClientes(),
      window.parent.electronAPI.db.getFiadosPendientes(),
      window.parent.electronAPI.db.obtenerProductosCriticos(),
      window.parent.electronAPI.db.obtenerResumenCajaV2(fechaHoy)
    ]);

    const tasa = t_raw ? parseFloat(t_raw) : 1.0;
    const fmtBs = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

    const ventasDetalle = document.getElementById('dash-ventas-detalle');

    if (resumenHoy && resumenHoy.ingresos && resumenHoy.ingresos.length > 0) {
      let totalBs = 0, totalUsd = 0;
      let metodosBs = [], metodosUsd = [];

      resumenHoy.ingresos.forEach(i => {
        const metodoOriginal = i.metodo.trim();
        const metodoLimpio = limpiarMetodoGrafico(metodoOriginal);

        if (metodoLimpio.includes('|')) {
          const componentes = desglosarMetodoMixto(metodoLimpio);
          componentes.forEach(comp => {
            if (comp.esExt) {
              totalUsd += comp.monto;
              metodosUsd.push({
                nombre: comp.metodo,
                nombreCorto: normalizarNombreCorto(comp.metodo),
                monto: comp.monto
              });
            } else {
              totalBs += comp.monto;
              metodosBs.push({
                nombre: comp.metodo,
                nombreCorto: normalizarNombreCorto(comp.metodo),
                monto: comp.monto
              });
            }
          });
        } else {
          const bs = i.suma_bs || 0;
          const usd = i.suma_usd || 0;
          if (esMetodoExtranjero(metodoLimpio)) {
            totalUsd += usd;
            if (usd > 0) {
              metodosUsd.push({
                nombre: metodoLimpio,
                nombreCorto: normalizarNombreCorto(metodoLimpio),
                monto: usd
              });
            }
          } else {
            totalBs += bs;
            if (bs > 0) {
              metodosBs.push({
                nombre: metodoLimpio,
                nombreCorto: normalizarNombreCorto(metodoLimpio),
                monto: bs
              });
            }
          }
        }
      });

      const agrupar = (lista) => {
        const map = new Map();
        lista.forEach(item => {
          const key = item.nombreCorto;
          if (map.has(key)) {
            map.get(key).monto += item.monto;
          } else {
            map.set(key, { ...item });
          }
        });
        return Array.from(map.values()).sort((a, b) => b.monto - a.monto);
      };

      metodosBs = agrupar(metodosBs);
      metodosUsd = agrupar(metodosUsd);

      let html = '';

      if (totalBs > 0 || totalUsd > 0) {
        html += `<div class="grid grid-cols-2 gap-2 mb-3">`;
        if (totalBs > 0) {
          html += `<div class="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
            <p class="text-[9px] font-bold text-blue-500 uppercase tracking-wide">Total Bs</p>
            <p class="text-lg font-black text-blue-700">Bs ${totalBs.toLocaleString('es-VE', fmtBs)}</p>
          </div>`;
        } else {
          html += `<div></div>`;
        }
        if (totalUsd > 0) {
          const totalUsdStr = formatearMontoExtranjeroVisual(totalUsd);
          html += `<div class="bg-violet-50 border border-violet-100 rounded-lg p-3 text-center">
            <p class="text-[9px] font-bold text-violet-500 uppercase tracking-wide">Total $/Crypto</p>
            <p class="text-lg font-black text-violet-700">$ ${totalUsdStr}</p>
          </div>`;
        } else {
          html += `<div></div>`;
        }
        html += `</div>`;
      }

      if (metodosBs.length > 0) {
        const maxBs = metodosBs[0].monto;
        html += `<div class="mb-2">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">💵 Bolívares</p>
          <div class="space-y-1.5">`;
        metodosBs.forEach(m => {
          const porcentaje = maxBs > 0 ? Math.round((m.monto / maxBs) * 100) : 0;
          const icono = obtenerIconoMetodo(m.nombre);
          const colorIcono = obtenerColorIcono(m.nombre);
          html += `
            <div class="metodo-card-dash">
              <div class="metodo-icon ${colorIcono}">${icono}</div>
              <div class="flex-1 min-w-0">
                <p class="text-[11px] font-semibold text-zinc-700 truncate">${escapeHtml(m.nombreCorto)}</p>
                <div class="barra-progreso">
                  <div class="barra-progreso-fill" style="width:${porcentaje}%"></div>
                </div>
              </div>
              <p class="text-[12px] font-bold text-zinc-800 ml-2">Bs ${m.monto.toLocaleString('es-VE', fmtBs)}</p>
            </div>`;
        });
        html += `</div></div>`;
      }

      if (metodosUsd.length > 0) {
        const maxUsd = metodosUsd[0].monto;
        html += `<div>
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">💲 Dólares / Crypto</p>
          <div class="space-y-1.5">`;
        metodosUsd.forEach(m => {
          const porcentaje = maxUsd > 0 ? Math.round((m.monto / maxUsd) * 100) : 0;
          const icono = obtenerIconoMetodo(m.nombre);
          const colorIcono = obtenerColorIcono(m.nombre);
          const montoStr = formatearMontoExtranjeroVisual(m.monto);
          html += `
            <div class="metodo-card-dash">
              <div class="metodo-icon ${colorIcono}">${icono}</div>
              <div class="flex-1 min-w-0">
                <p class="text-[11px] font-semibold text-zinc-700 truncate">${escapeHtml(m.nombreCorto)}</p>
                <div class="barra-progreso">
                  <div class="barra-progreso-fill" style="width:${porcentaje}%; background:#8b5cf6;"></div>
                </div>
              </div>
              <p class="text-[12px] font-bold text-zinc-800 ml-2">$ ${montoStr}</p>
            </div>`;
        });
        html += `</div></div>`;
      }

      ventasDetalle.innerHTML = html || '<p class="text-[11px] text-slate-400 text-center py-4">Sin movimientos</p>';
    } else {
      ventasDetalle.innerHTML = `
        <div class="flex flex-col items-center justify-center py-8 text-slate-400">
          <span class="text-xl mb-1.5">📊</span>
          <p class="text-[11px] font-medium">Sin ventas registradas hoy</p>
        </div>`;
    }

    document.getElementById('dash-clientes-val').textContent = c_tot || 0;
    document.getElementById('dash-stock-val').textContent = s_bajo || 0;
    document.getElementById('dash-fiados-val').textContent = f_pen || 0;
    document.getElementById('dash-tasa-val').textContent = `${tasa.toLocaleString('es-VE', fmtBs)} Bs/$`;

    const alertasContainer = document.getElementById('dash-alertas-container');
    if (!criticos || criticos.length === 0) {
      alertasContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-6 text-slate-400">
          <span class="text-lg mb-1">✓</span>
          <p class="text-[10px] font-medium">Sin alertas</p>
          <p class="text-[9px]">Stock bajo control</p>
        </div>`;
    } else {
      alertasContainer.innerHTML = criticos.map(p => {
        const esPorPeso = p.es_por_peso === 1;
        const stockActual = esPorPeso ? parseFloat(p.stock_kg || 0) : parseInt(p.stock || 0);
        const stockCritico = parseInt(p.stock_critico || 5);
        const porcentaje = stockCritico > 0 ? Math.round((stockActual / stockCritico) * 100) : 0;
        
        let barColor, textColor, bgLight;
        if (porcentaje <= 25) { barColor = 'bg-red-500'; textColor = 'text-red-600'; bgLight = 'bg-red-50'; }
        else if (porcentaje <= 60) { barColor = 'bg-amber-500'; textColor = 'text-amber-600'; bgLight = 'bg-amber-50'; }
        else { barColor = 'bg-orange-400'; textColor = 'text-orange-500'; bgLight = 'bg-orange-50'; }

        let stockMostrar;
        if (esPorPeso) {
          stockMostrar = (stockActual % 1 === 0) ? stockActual + ' kg' : stockActual.toFixed(3) + ' kg';
        } else {
          stockMostrar = stockActual;
        }

        return `
          <div class="flex items-center gap-3 p-2.5 ${bgLight} rounded-lg border border-slate-100">
            <div class="w-8 h-8 rounded-full ${barColor} flex items-center justify-center text-white text-xs font-bold">!</div>
            <div class="flex-1 min-w-0">
              <p class="text-[11px] font-semibold text-zinc-800 truncate">${escapeHtml(p.nombre)}</p>
              <div class="w-full bg-slate-200 rounded-full h-1.5 mt-1">
                <div class="${barColor} h-1.5 rounded-full" style="width: ${Math.min(porcentaje, 100)}%"></div>
              </div>
            </div>
            <div class="text-right">
              <span class="text-[10px] font-bold ${textColor}">${stockMostrar}</span>
              <span class="text-[9px] text-slate-400"> / ${stockCritico}</span>
            </div>
          </div>`;
      }).join('');
    }

    (async () => {
      try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        if (!response.ok) throw new Error('Fallo HTTP');
        const data = await response.json();
        document.getElementById('dash-bcv-real-val').textContent = `Bs ${data.promedio.toLocaleString('es-VE', fmtBs)}`;
        document.getElementById('indicador-bcv').className = 'w-1.5 h-1.5 rounded-full bg-emerald-500 ml-auto';
      } catch (err) {
        document.getElementById('dash-bcv-real-val').textContent = 'Offline';
        document.getElementById('indicador-bcv').className = 'w-1.5 h-1.5 rounded-full bg-slate-400 ml-auto';
      }
    })();
  } catch (error) {}
}

initDashboard();