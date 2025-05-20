// Solución específica para fly.io - Configuración de credenciales
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

// Función para verificar y crear directorios
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(chalk.blue('🔧 [Setup]') + ` Creando directorio: ${dirPath}`);
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  }
  return false;
}

// Función para configurar credenciales
async function setupCredentials() {
  try {
    console.log(chalk.blue('🔧 [Setup]') + ' Iniciando configuración de credenciales...');
    
    // 1. Asegurar que los directorios existan
    const appDir = '/app';
    const sessionDir = path.join(appDir, 'session');
    
    ensureDirectoryExists(sessionDir);
    
    // 2. Definir la ruta del archivo de credenciales
    const credPath = path.join(sessionDir, 'serviceAccount.json');
    
    // 3. Intentar obtener credenciales de diferentes fuentes
    let firebaseCreds = null;
    
    // Opción 1: Desde variable de entorno FIREBASE_JSON (base64)
    if (process.env.FIREBASE_JSON) {
      try {
        console.log(chalk.blue('🔧 [Setup]') + ' Intentando usar FIREBASE_JSON (base64)');
        const raw = Buffer.from(process.env.FIREBASE_JSON, 'base64').toString('utf8');
        firebaseCreds = JSON.parse(raw);
        console.log(chalk.green('✅ [Setup]') + ' Credenciales obtenidas desde FIREBASE_JSON');
      } catch (error) {
        console.error(chalk.red('❌ [Error]'), 'Error al procesar FIREBASE_JSON:', error.message);
        console.log('Contenido de FIREBASE_JSON (primeros 50 caracteres):', 
          process.env.FIREBASE_JSON ? process.env.FIREBASE_JSON.substring(0, 50) + '...' : 'undefined');
      }
    }
    
    // Opción 2: Desde archivo serviceAccount.json en la raíz
    if (!firebaseCreds && fs.existsSync('./serviceAccount.json')) {
      try {
        console.log(chalk.blue('🔧 [Setup]') + ' Intentando usar ./serviceAccount.json');
        const raw = fs.readFileSync('./serviceAccount.json', 'utf8');
        firebaseCreds = JSON.parse(raw);
        console.log(chalk.green('✅ [Setup]') + ' Credenciales obtenidas desde ./serviceAccount.json');
      } catch (error) {
        console.error(chalk.red('❌ [Error]'), 'Error al leer serviceAccount.json:', error.message);
      }
    }
    
    // Opción 3: Desde archivo serviceAccount.json en /app
    if (!firebaseCreds && fs.existsSync('/app/serviceAccount.json')) {
      try {
        console.log(chalk.blue('🔧 [Setup]') + ' Intentando usar /app/serviceAccount.json');
        const raw = fs.readFileSync('/app/serviceAccount.json', 'utf8');
        firebaseCreds = JSON.parse(raw);
        console.log(chalk.green('✅ [Setup]') + ' Credenciales obtenidas desde /app/serviceAccount.json');
      } catch (error) {
        console.error(chalk.red('❌ [Error]'), 'Error al leer /app/serviceAccount.json:', error.message);
      }
    }
    
    // Si no se encontraron credenciales, salir
    if (!firebaseCreds) {
      throw new Error('No se pudieron obtener credenciales de ninguna fuente');
    }
    
    // 4. Escribir credenciales al archivo en el volumen persistente
    try {
      fs.writeFileSync(credPath, JSON.stringify(firebaseCreds, null, 2));
      console.log(chalk.green('✅ [Setup]') + ` Credenciales guardadas en ${credPath}`);
      
      // Verificar permisos del archivo
      fs.chmodSync(credPath, 0o600); // Solo lectura/escritura para el propietario
      console.log(chalk.green('✅ [Setup]') + ' Permisos del archivo de credenciales ajustados');
      
      // Verificar que el archivo existe y es legible
      const stats = fs.statSync(credPath);
      console.log(chalk.blue('🔍 [Info]') + ` Archivo de credenciales: ${stats.size} bytes`);
      
      // Leer el archivo para verificar su contenido
      const content = fs.readFileSync(credPath, 'utf8');
      const parsed = JSON.parse(content);
      console.log(chalk.blue('🔍 [Info]') + ` Credenciales para proyecto: ${parsed.project_id}`);
    } catch (error) {
      console.error(chalk.red('❌ [Error]'), 'Error al guardar credenciales:', error.message);
      throw error;
    }
    
    // 5. Configurar la variable de entorno GOOGLE_APPLICATION_CREDENTIALS
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
    console.log(chalk.green('✅ [Setup]') + ` GOOGLE_APPLICATION_CREDENTIALS = ${credPath}`);
    
    // 6. Verificar que la variable de entorno está configurada
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS no está configurada');
    }
    
    // 7. Verificar que el archivo existe
    if (!fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      throw new Error(`El archivo de credenciales no existe: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
    }
    
    console.log(chalk.green('✅ [Setup]') + ' Configuración de credenciales completada con éxito');
    return true;
  } catch (error) {
    console.error(chalk.red('❌ [Fatal Error]'), 'Error en la configuración de credenciales:', error);
    return false;
  }
}

// Exportar la función para usarla en index.js
export default setupCredentials;
