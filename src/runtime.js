const crypto = require('crypto');
const path = require('path');
const config = require('./config');

const DEV_PASSWORD = 'freelife-admin';
const DEV_SECRET = 'dev-only-troque-esta-chave-freelife';

function integerPort(value, fallback) {
  if (value == null || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

function resolveRuntimeConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  let adminPassword = env.ADMIN_PASSWORD || '';
  let generatedPassword = false;

  if (!adminPassword) {
    if (isProduction) {
      adminPassword = crypto.randomBytes(18).toString('base64url');
      generatedPassword = true;
    } else {
      adminPassword = DEV_PASSWORD;
    }
  }

  let sessionSecret = env.SESSION_SECRET || '';
  let generatedSecret = false;
  if (!sessionSecret) {
    if (isProduction) {
      sessionSecret = crypto.randomBytes(32).toString('base64url');
      generatedSecret = true;
    } else {
      sessionSecret = DEV_SECRET;
    }
  }

  const dbPath = env.DB_PATH ? path.resolve(env.DB_PATH) : config.dbPath;

  return {
    isProduction,
    port: integerPort(env.PORT, config.port || 47231),
    host: env.HOST || config.host || '0.0.0.0',
    dbPath,
    adminPassword,
    generatedPassword,
    usingDefaultPassword: adminPassword === DEV_PASSWORD,
    sessionSecret,
    generatedSecret,
    usingDefaultSecret: generatedSecret || sessionSecret === DEV_SECRET,
    cookieSecure: env.COOKIE_SECURE === '1',
    trustProxy: env.TRUST_PROXY === '1',
    sessionCookie: 'freelife.sid',
  };
}

function sessionCookieOptions(runtime) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(runtime.cookieSecure),
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  };
}

function clearCookieOptions(runtime) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(runtime.cookieSecure),
    path: '/',
  };
}

function warnRuntime(runtime) {
  if (runtime.generatedPassword) {
    console.error('');
    console.error('****************************************************************');
    console.error('AVISO DE SEGURANÇA: ADMIN_PASSWORD não está definido em produção.');
    console.error('A senha pública do README NÃO será usada.');
    console.error('Senha aleatória só deste processo (muda quando o servidor reinicia):');
    console.error(runtime.adminPassword);
    console.error('Defina ADMIN_PASSWORD no ambiente e reinicie.');
    console.error('****************************************************************');
    console.error('');
  } else if (runtime.isProduction && runtime.usingDefaultPassword) {
    console.error('');
    console.error('****************************************************************');
    console.error('AVISO DE SEGURANÇA: ADMIN_PASSWORD em produção é a senha padrão pública.');
    console.error('Troque a variável e reinicie antes de divulgar o site.');
    console.error('****************************************************************');
    console.error('');
  } else if (runtime.usingDefaultPassword) {
    console.warn('AVISO: senha do admin é a padrão documentada no README. Defina ADMIN_PASSWORD antes de publicar.');
  }

  if (runtime.generatedSecret) {
    console.error('AVISO DE SEGURANÇA: SESSION_SECRET não definido em produção. Uma chave aleatória vale só até o processo terminar. Defina SESSION_SECRET.');
  } else if (runtime.usingDefaultSecret) {
    console.warn('AVISO: SESSION_SECRET não definido. Defina uma chave longa antes de publicar.');
  }

  if (runtime.isProduction && !runtime.cookieSecure) {
    console.error('AVISO DE SEGURANÇA: COOKIE_SECURE não está em 1. Com HTTPS, defina COOKIE_SECURE=1 para o cookie de sessão não ir em claro.');
  }
}

module.exports = {
  DEV_PASSWORD,
  resolveRuntimeConfig,
  sessionCookieOptions,
  clearCookieOptions,
  warnRuntime,
};
