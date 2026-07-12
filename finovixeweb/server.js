const express = require('express');
const path = require('path');
const { initDatabase } = require('./src/main/database/db');
const DatabaseService = require('./src/main/database/services/DatabaseService');

const app = express();
// Permite que el sistema envíe y reciba información pesada (como tus PDFs o imágenes)
app.use(express.json({ limit: '50mb' }));

// 1. Mostrar las pantallas de Finovixe al entrar al dominio
app.use(express.static(path.join(__dirname, 'src/renderer')));

// 2. El puente de datos: Reemplaza a IPC de Electron
app.post('/api/finovixe', async (req, res) => {
    const { accion, argumentos } = req.body;
    try {
        // Ejecuta la función que la pantalla pida (Ej. buscar_productos)
        const resultado = await DatabaseService[accion](...(argumentos || []));
        res.json({ success: true, data: resultado });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Encender la base de datos y luego el sistema web
initDatabase().then(() => {
    app.listen(3000, () => {
        console.log('Finovixe listo para la nube operando en el puerto 3000');
    });
}).catch(err => console.error("Error al iniciar:", err));