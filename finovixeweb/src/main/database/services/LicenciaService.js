const { execSync } = require('child_process');
const crypto = require('crypto');
const DatabaseService = require('./DatabaseService');

const SECRET_SALT = "Inovix_Master_Secret_Salt_2026_@Palenzuela";

class LicenciaService {

  static getHWID() {
    try {
      let board = execSync('wmic baseboard get serialnumber').toString().split('\n')[1].trim();
      let cpu = execSync('wmic cpu get processorid').toString().split('\n')[1].trim();
      let hwidRaw = `${board}-${cpu}`;
      const idLimpio = crypto.createHash('md5').update(hwidRaw).digest('hex').toUpperCase();
      return `${idLimpio.substring(0,4)}-${idLimpio.substring(4,8)}-${idLimpio.substring(8,12)}-${idLimpio.substring(12,16)}`;
    } catch (e) {
      return "ERROR-HWID-0000";
    }
  }

  static generarLlave(hwid) {
    return crypto.createHmac('sha256', SECRET_SALT)
                 .update(hwid)
                 .digest('hex')
                 .substring(0, 16).toUpperCase();
  }

  static verificarLicencia() {
    try {
      const hwid = this.getHWID();
      const llaveCorrecta = this.generarLlave(hwid);
      const llaveGuardada = DatabaseService.obtener_config('licencia_key');
      return llaveGuardada === llaveCorrecta;
    } catch (e) {
      return false;
    }
  }

  static activar(llaveIntroducida) {
    const hwid = this.getHWID();
    const llaveCorrecta = this.generarLlave(hwid);
    if (llaveIntroducida.trim().toUpperCase() === llaveCorrecta) {
      DatabaseService.db.prepare("INSERT OR REPLACE INTO configuracion VALUES ('licencia_key', ?)")
                        .run(llaveCorrecta);
      return true;
    }
    return false;
  }
}

module.exports = LicenciaService;