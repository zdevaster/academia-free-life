const crypto = require('crypto');
const path = require('path');
const express = require('express');
const session = require('express-session');
const config = require('./config');
const { safeEqual } = require('./security');
const { resolveRuntimeConfig, sessionCookieOptions } = require('./runtime');
const { formatPhone, telHref, whatsappHref } = require('./phone');
const {
  DAYS,
  INTERESTS,
  interestLabel,
  formatWhen,
  starFills,
} = require('./format');
const { initDb, placeholderFlags, getContactSettings } = require('./db');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function createApp(options = {}) {
  const runtime = options.runtime || resolveRuntimeConfig(process.env);
  const dbPath = options.dbPath || runtime.dbPath;
  const { db, seeded } = initDb(dbPath);
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', runtime.trustProxy ? 1 : false);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('runtime', runtime);
  app.set('db', db);
  if (process.env.NODE_ENV === 'production') app.set('view cache', true);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Origin-Agent-Cluster', '?1');
    if (runtime.cookieSecure) {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  });

  app.use(express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 40 }));
  app.use(
    express.static(path.join(__dirname, '..', 'public'), {
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    })
  );

  app.use(
    session({
      name: runtime.sessionCookie,
      secret: runtime.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: sessionCookieOptions(runtime),
    })
  );

  app.use((req, res, next) => {
    if (req.path.length > 1 && req.path.endsWith('/')) {
      const query = req.url.slice(req.path.length);
      return res.redirect(301, req.path.slice(0, -1) + query);
    }
    return next();
  });

  app.use((req, res, next) => {
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    }

    const cspNonce = crypto.randomBytes(16).toString('base64url');
    const settings = getContactSettings(db);
    const contact = {
      ...settings,
      phoneLabel: formatPhone(settings.phone),
      whatsappLabel: formatPhone(settings.whatsapp),
      telHref: telHref(settings.phone),
      whatsappHref: whatsappHref(settings.whatsapp),
    };

    res.locals.csrfToken = req.session.csrfToken;
    res.locals.cspNonce = cspNonce;
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    res.locals.gym = config.gym;
    res.locals.maps = config.maps;
    res.locals.year = new Date().getFullYear();
    res.locals.path = req.path;
    res.locals.flags = placeholderFlags(db);
    res.locals.contact = contact;
    res.locals.stars = starFills(config.gym.rating);
    res.locals.days = DAYS;
    res.locals.interests = INTERESTS;
    res.locals.interestLabel = interestLabel;
    res.locals.formatWhen = formatWhen;
    res.locals.formatPhone = formatPhone;
    res.locals.usingDefaultPassword = runtime.usingDefaultPassword;
    res.locals.generatedPassword = runtime.generatedPassword;
    res.locals.pageTitle = 'Academia Free Life · São José do Rio Preto';
    res.locals.metaDescription =
      'Academia Free Life no Res. Macedo Teles I, São José do Rio Preto — SP. Endereço, nota no Google, planos e contato.';
    res.locals.noindex = false;
    res.locals.jsonLd = jsonForScript({
      '@context': 'https://schema.org',
      '@type': 'ExerciseGym',
      name: config.gym.name,
      address: {
        '@type': 'PostalAddress',
        streetAddress: config.gym.street,
        addressLocality: config.gym.city,
        addressRegion: config.gym.state,
        postalCode: config.gym.cep,
        addressCountry: 'BR',
      },
      ...(settings.phone ? { telephone: `+55${settings.phone}` } : {}),
    });

    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${cspNonce}'`,
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "frame-src https://maps.google.com https://www.google.com",
        "connect-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'",
        "object-src 'none'",
      ].join('; ')
    );

    req.db = db;

    if (req.method === 'POST') {
      const sent = req.body && typeof req.body._csrf === 'string' ? req.body._csrf : '';
      if (!safeEqual(sent, req.session.csrfToken)) {
        return res.status(403).render('403', {
          pageTitle: 'Pedido recusado · Academia Free Life',
          noindex: true,
        });
      }
    }

    return next();
  });

  app.use(publicRoutes);
  app.use('/admin', adminRoutes);

  app.use((req, res) => {
    res.status(404).render('404', {
      pageTitle: 'Página não encontrada · Academia Free Life',
      noindex: true,
    });
  });

  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    const tooLarge = err && (err.type === 'entity.too.large' || err.status === 413);
    res.status(tooLarge ? 413 : 500);
    try {
      return res.render('500', {
        pageTitle: 'Erro · Academia Free Life',
        noindex: true,
        detail: tooLarge ? 'O envio passou do tamanho permitido.' : '',
      });
    } catch (renderError) {
      console.error(renderError);
      return res.type('text').send('Erro interno.');
    }
  });

  return { app, db, runtime, seeded };
}

module.exports = { createApp, jsonForScript };
