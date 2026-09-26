require('dotenv').config();

const { createApp } = require('./src/app');
const { getContactSettings } = require('./src/db');
const { warnRuntime } = require('./src/runtime');

const { app, db, runtime, seeded } = createApp();

if (!Number.isInteger(runtime.port)) {
  console.error('PORT inválida. Use um número de 1 a 65535.');
  process.exit(1);
}

warnRuntime(runtime);

const server = app.listen(runtime.port, runtime.host, () => {
  const shownHost = runtime.host === '0.0.0.0' ? '127.0.0.1' : runtime.host;
  console.log(`Academia Free Life em http://${shownHost}:${runtime.port}`);
  console.log(`Banco: ${runtime.dbPath}`);
  if (seeded) console.log('Banco novo criado com planos e horários de exemplo.');
  const envPhone = (process.env.PHONE || '').trim();
  const envWhatsapp = (process.env.WHATSAPP || '').trim();
  const contact = getContactSettings(db);
  if (envPhone && !contact.phoneFromEnv) {
    console.warn('AVISO: PHONE no ambiente é inválido e foi ignorado.');
  }
  if (envWhatsapp && !contact.whatsappFromEnv) {
    console.warn('AVISO: WHATSAPP no ambiente é inválido e foi ignorado.');
  }
});

function shutdown() {
  server.close(() => {
    try {
      db.close();
    } catch (error) {
      console.error(error);
    }
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
