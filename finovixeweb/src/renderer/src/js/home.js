let currentUser = null;

const titulosSecciones = {
  home: 'Inicio',
  dashboard: 'Panel Principal',
  ventas: 'Punto de Venta',
  cierre: 'Cierre de Caja',
  inventario: 'Inventario',
  clientes: 'Clientes',
  fiados: 'Créditos',
  proveedores: 'Proveedores',
  reportes: 'Reportes',
  configuracion: 'Configuración'
};

const mapaPermisos = {
  'dashboard': 'btn-nav-dashboard',
  'ventas': 'btn-nav-ventas',
  'cierre': 'btn-nav-cierre',
  'inventario': 'btn-nav-inventario',
  'clientes': 'btn-nav-clientes',
  'creditos': 'btn-nav-fiados',
  'proveedores': 'btn-nav-proveedores',
  'reportes': 'btn-nav-reportes'
};

Swal.mixin({
  heightAuto: false,
  scrollbarPadding: false
});

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
  localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
}

function restoreSidebarState() {
  const collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  if (collapsed) {
    document.getElementById('sidebar').classList.add('collapsed');
  }
}

function focalizarIframe() {
  const iframe = document.querySelector('iframe');
  if (iframe) setTimeout(() => iframe.contentWindow.focus(), 100);
}

function configurarMixinSwalIframe(iframe) {
  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    const script = iframeDoc.createElement('script');
    script.textContent = `
      (function() {
        function aplicarMixin() {
          if (typeof Swal !== 'undefined' && Swal.mixin) {
            Swal.mixin({
              heightAuto: false,
              scrollbarPadding: false
            });
          }
        }
        aplicarMixin();
        document.addEventListener('DOMContentLoaded', aplicarMixin);
        setTimeout(aplicarMixin, 300);
      })();
    `;
    iframeDoc.head.appendChild(script);
  } catch (e) {
    setTimeout(() => configurarMixinSwalIframe(iframe), 200);
  }
}

document.addEventListener('mousedown', () => {
  const iframe = document.querySelector('iframe');
  if (iframe) iframe.contentWindow.focus();
});

function navegar(seccion) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('onclick').includes(`'${seccion}'`)) item.classList.add('active');
  });

  document.getElementById('page-title').textContent = titulosSecciones[seccion] || 'FINOVIXE';
  const content = document.getElementById('content-placeholder');

  if (seccion === 'home') {
    content.innerHTML = `<div class="min-h-full flex flex-col p-6 space-y-6 max-w-4xl mx-auto pb-10">
      <div class="bg-white rounded-3xl border border-slate-200 border-t-4 border-t-blue-600 p-10 text-center shadow-lg">
        <span class="inline-block px-6 py-2 bg-blue-50 text-blue-600 font-bold text-[12px] rounded-full uppercase tracking-wider mb-4 border border-blue-100">👋 ¡Hola, bienvenido!</span>
        <div class="flex justify-center items-center">
          <h1 class="text-7xl font-black tracking-widest text-zinc-900">FINOVI<span class="text-blue-600">XE</span></h1>
        </div>
        <p class="text-slate-600 font-medium text-lg mt-4">Tecnología que impulsa tu negocio.</p>
      </div>
      <div class="bg-white rounded-3xl border border-slate-200 p-8 shadow-md relative overflow-hidden">
        <h3 class="text-xs font-bold text-blue-600 tracking-widest text-center mb-5 uppercase flex items-center justify-center gap-2">
          <span>🛡️</span> Términos de Uso y Condiciones Generales
        </h3>
        <div class="bg-slate-50 border-l-4 border-blue-500 rounded-r-2xl p-6 text-slate-700 text-sm leading-relaxed shadow-inner">
          <p class="mb-3">
            <strong class="text-zinc-900">ACERCA DE FINOVIXE Y LÍMITES DE RESPONSABILIDAD:</strong> Finovixe es una herramienta de apoyo administrativo diseñada para ayudarte a gestionar y organizar el día a día de tu negocio de forma simple y eficiente. <strong>No es un software fiscal, no está registrado ante el SENIAT y no emite facturas electrónicas ni comprobantes fiscales.</strong> Todos los documentos generados (reportes, recibos, PDF) carecen de validez fiscal y no deben ser presentados ante organismos tributarios. El desarrollador no asume ninguna responsabilidad por el uso indebido, errores humanos, omisiones, decisiones administrativas o consecuencias derivadas del manejo de la información registrada. El usuario es el único responsable de verificar y respaldar sus datos, así como de la exactitud de la información que ingresa.
          </p>
          <p class="mb-3">
            <strong class="text-zinc-900">OBLIGACIONES TRIBUTARIAS Y CONVERSIÓN DE MONEDA:</strong> Esta herramienta es un apoyo administrativo y no sustituye la asesoría contable o fiscal. El cumplimiento de todas las obligaciones legales y tributarias es responsabilidad exclusiva del propietario o administrador del negocio. Finovixe utiliza exclusivamente la tasa de cambio oficial del BCV como referencia base para todas las conversiones monetarias. La tasa se obtiene de forma automática cuando hay conexión a internet. La opción manual se ofrece únicamente para casos de fuerza mayor (falla de conexión); en ese escenario, el administrador debe ingresar manualmente la tasa del BCV vigente. Cualquier diferencia entre la tasa configurada y la tasa oficial es responsabilidad de quien administra el sistema.
          </p>
          <p class="text-blue-600 font-semibold">📋 Te invitamos a utilizar este sistema de manera responsable y conforme a las normativas legales vigentes.</p>
        </div>
      </div>
    </div>`;
  } else if (titulosSecciones[seccion]) {
    content.innerHTML = `<iframe src="${seccion}.html" onload="focalizarIframe(); configurarMixinSwalIframe(this)" class="w-full h-full border-0 rounded-3xl"></iframe>`;
    focalizarIframe();
  } else {
    content.innerHTML = `<div class="flex items-center justify-center h-full"><h2 class="text-3xl text-slate-500">Sección en desarrollo...</h2></div>`;
  }
}

async function cerrarSesion() {
  const confirmacion = await Swal.fire({
    title: '¿Cerrar Sesión?',
    text: "¿Estás seguro de que deseas salir del sistema?",
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sí, salir',
    cancelButtonText: 'Cancelar',
    backdrop: 'rgba(15, 23, 42, 0.8)',
    heightAuto: false
  });

  if (confirmacion.isConfirmed) {
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
  }
}

function iniciarRelojGlobal() {
  const clockElement = document.getElementById('global-clock');
  const tasaElement = document.getElementById('global-tasa');
  const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };

  setInterval(() => clockElement.textContent = new Date().toLocaleDateString('es-VE', opciones), 1000);

  window.electronAPI.db.obtenerConfig("tasa_usd")
    .then(t_raw => tasaElement.textContent = t_raw ? parseFloat(t_raw).toLocaleString('es-VE', {minimumFractionDigits: 2}) : '1.00')
    .catch(() => tasaElement.textContent = '---');
}

function aplicarPermisosMenu() {
  if (!currentUser || currentUser.rol === 'admin' || currentUser.permisos === 'todas') return;
  const perms = currentUser.permisos ? currentUser.permisos.split(',') : [];

  for (const [key, btnId] of Object.entries(mapaPermisos)) {
    if (!perms.includes(key)) {
      const btn = document.getElementById(btnId);
      if (btn) btn.classList.add('hidden');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  restoreSidebarState();
  iniciarRelojGlobal();
  currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (currentUser) {
    aplicarPermisosMenu();
  }
  navegar('home');
});

window.navegar = navegar;
window.cerrarSesion = cerrarSesion;
window.toggleSidebar = toggleSidebar;