const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;

const initDatabase = async () => {
  // Le decimos que guarde el archivo en la raíz del proyecto
  const dbPath = path.join(__dirname, 'pos_system.db');

  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -10000');
  db.pragma('temp_store = MEMORY');
  db.pragma('foreign_keys = ON');

  const DatabaseService = require('./services/DatabaseService');
  await DatabaseService.init(db);

  return db;
};

const getDb = () => {
  if (!db) throw new Error('Base de datos no inicializada');
  return db;
};

module.exports = { initDatabase, getDb };