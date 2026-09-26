const crypto = require('crypto');
const express = require('express');
const { safeEqual, loginState, recordLoginFailure, clearLoginFailures } = require('../security');
const { clearCookieOptions } = require('../runtime');
const { formatPhone } = require('../phone');
const { parseId, errorList } = require('../format');
const {
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
  listClasses,
  getClass,
  createClass,
  updateClass,
  deleteClass,
  listSubmissions,
  getSubmission,
  countSubmissions,
  deleteSubmission,
  counts,
  getContactSettings,
  setSetting,
} = require('../db');
const { validatePlan, validateClass, validateSettings } = require('../validators');

const router = express.Router();

function renderLogin(res, status, error) {
  return res.status(status).render('admin/login', {
    pageTitle: 'Entrar · Academia Free Life',
    error: error || '',
  });
}

function renderMissing(res, message) {
  return res.status(404).render('admin/missing', {
    pageTitle: 'Não encontrado · Academia Free Life',
    message,
  });
}

function emptyPlanForm() {
  return {
    name: '',
    price_label: 'A definir',
    period_label: '',
    description: '',
    benefits: '',
    highlighted: false,
    active: true,
    is_placeholder: false,
    sort_order: '0',
  };
}

function formFromPlan(plan) {
  return {
    name: plan.name,
    price_label: plan.price_label,
    period_label: plan.period_label,
    description: plan.description,
    benefits: plan.benefits,
    highlighted: plan.highlighted,
    active: plan.active,
    is_placeholder: plan.is_placeholder,
    sort_order: String(plan.sort_order),
  };
}

function emptyClassForm() {
  return {
    name: '',
    description: '',
    weekdays: [],
    start_time: '',
    end_time: '',
    active: true,
    is_placeholder: false,
    sort_order: '0',
  };
}

function formFromClass(item) {
  return {
    name: item.name,
    description: item.description,
    weekdays: item.weekdayList,
    start_time: item.start_time,
    end_time: item.end_time,
    active: item.active,
    is_placeholder: item.is_placeholder,
    sort_order: String(item.sort_order),
  };
}

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.locals.noindex = true;
  res.locals.inboxCount = req.session && req.session.admin ? countSubmissions(req.db) : 0;
  next();
});

router.get('/', (req, res) => {
  if (!req.session.admin) return renderLogin(res, 200, '');
  const stats = counts(req.db);
  res.render('admin/dashboard', {
    pageTitle: 'Painel · Academia Free Life',
    stats,
    submissions: listSubmissions(req.db, 8),
  });
});

router.post('/entrar', (req, res, next) => {
  if (req.session.admin) return res.redirect('/admin');

  const ip = req.ip || 'local';
  if (loginState(ip).blocked) {
    return renderLogin(res, 429, 'Muitas tentativas. Espere alguns minutos e tente de novo.');
  }

  const runtime = req.app.get('runtime');
  const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  const withinLimit = password.length > 0 && password.length <= 200;
  const matches = withinLimit && safeEqual(password, runtime.adminPassword);
  if (!withinLimit) safeEqual('x', runtime.adminPassword);
  if (!password) return renderLogin(res, 400, 'Informe a senha.');
  if (!matches) {
    recordLoginFailure(ip);
    return renderLogin(res, 401, 'Senha incorreta.');
  }

  clearLoginFailures(ip);
  return req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.admin = true;
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    req.session.flash = { type: 'ok', text: 'Você entrou no painel.' };
    return res.redirect('/admin');
  });
});

router.use((req, res, next) => {
  if (!req.session.admin) return res.redirect('/admin');
  return next();
});

router.post('/sair', (req, res) => {
  const runtime = req.app.get('runtime');
  req.session.destroy(() => {
    res.clearCookie(runtime.sessionCookie, clearCookieOptions(runtime));
    res.redirect('/admin');
  });
});

router.get('/mensagens', (req, res) => {
  res.render('admin/submissions', {
    pageTitle: 'Mensagens · Academia Free Life',
    submissions: listSubmissions(req.db, 200),
  });
});

router.get('/mensagens/:id/excluir', (req, res) => {
  const id = parseId(req.params.id);
  const item = id && getSubmission(req.db, id);
  if (!item) return renderMissing(res, 'Mensagem não encontrada.');
  return res.render('admin/confirm-delete', {
    pageTitle: 'Apagar mensagem · Academia Free Life',
    heading: 'Apagar mensagem',
    kind: 'mensagem',
    name: item.name,
    action: `/admin/mensagens/${item.id}/excluir`,
    cancelHref: '/admin/mensagens',
    confirmLabel: 'Apagar',
  });
});

router.post('/mensagens/:id/excluir', (req, res) => {
  const id = parseId(req.params.id);
  if (!id || !deleteSubmission(req.db, id)) {
    return renderMissing(res, 'Mensagem não encontrada.');
  }
  req.session.flash = { type: 'ok', text: 'Mensagem apagada.' };
  return res.redirect('/admin/mensagens');
});

router.get('/planos', (req, res) => {
  res.render('admin/plans', {
    pageTitle: 'Planos · Painel · Academia Free Life',
    plans: listPlans(req.db),
  });
});

router.get('/planos/novo', (req, res) => {
  res.render('admin/plan-form', {
    pageTitle: 'Novo plano · Academia Free Life',
    mode: 'novo',
    action: '/admin/planos',
    form: emptyPlanForm(),
    errors: {},
  });
});

router.post('/planos', (req, res) => savePlan(req, res, null));

router.get('/planos/:id/editar', (req, res) => {
  const plan = parseId(req.params.id) && getPlan(req.db, parseId(req.params.id));
  if (!plan) return renderMissing(res, 'Plano não encontrado.');
  return res.render('admin/plan-form', {
    pageTitle: 'Editar plano · Academia Free Life',
    mode: 'editar',
    action: `/admin/planos/${plan.id}`,
    deleteHref: `/admin/planos/${plan.id}/excluir`,
    form: formFromPlan(plan),
    errors: {},
  });
});

router.post('/planos/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id || !getPlan(req.db, id)) return renderMissing(res, 'Plano não encontrado.');
  return savePlan(req, res, id);
});

router.get('/planos/:id/excluir', (req, res) => {
  const plan = parseId(req.params.id) && getPlan(req.db, parseId(req.params.id));
  if (!plan) return renderMissing(res, 'Plano não encontrado.');
  return res.render('admin/confirm-delete', {
    pageTitle: 'Excluir plano · Academia Free Life',
    heading: 'Excluir plano',
    kind: 'plano',
    name: plan.name,
    action: `/admin/planos/${plan.id}/excluir`,
    cancelHref: '/admin/planos',
    confirmLabel: 'Excluir',
  });
});

router.post('/planos/:id/excluir', (req, res) => {
  const id = parseId(req.params.id);
  if (!id || !deletePlan(req.db, id)) return renderMissing(res, 'Plano não encontrado.');
  req.session.flash = { type: 'ok', text: 'Plano excluído.' };
  return res.redirect('/admin/planos');
});

router.get('/modalidades', (req, res) => {
  res.render('admin/classes', {
    pageTitle: 'Modalidades · Painel · Academia Free Life',
    classes: listClasses(req.db),
  });
});

router.get('/modalidades/novo', (req, res) => {
  res.render('admin/class-form', {
    pageTitle: 'Nova modalidade · Academia Free Life',
    mode: 'novo',
    action: '/admin/modalidades',
    form: emptyClassForm(),
    errors: {},
  });
});

router.post('/modalidades', (req, res) => saveClass(req, res, null));

router.get('/modalidades/:id/editar', (req, res) => {
  const item = parseId(req.params.id) && getClass(req.db, parseId(req.params.id));
  if (!item) return renderMissing(res, 'Modalidade não encontrada.');
  return res.render('admin/class-form', {
    pageTitle: 'Editar modalidade · Academia Free Life',
    mode: 'editar',
    action: `/admin/modalidades/${item.id}`,
    deleteHref: `/admin/modalidades/${item.id}/excluir`,
    form: formFromClass(item),
    errors: {},
  });
});

router.post('/modalidades/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id || !getClass(req.db, id)) return renderMissing(res, 'Modalidade não encontrada.');
  return saveClass(req, res, id);
});

router.get('/modalidades/:id/excluir', (req, res) => {
  const item = parseId(req.params.id) && getClass(req.db, parseId(req.params.id));
  if (!item) return renderMissing(res, 'Modalidade não encontrada.');
  return res.render('admin/confirm-delete', {
    pageTitle: 'Excluir modalidade · Academia Free Life',
    heading: 'Excluir modalidade',
    kind: 'modalidade',
    name: item.name,
    action: `/admin/modalidades/${item.id}/excluir`,
    cancelHref: '/admin/modalidades',
    confirmLabel: 'Excluir',
  });
});

router.post('/modalidades/:id/excluir', (req, res) => {
  const id = parseId(req.params.id);
  if (!id || !deleteClass(req.db, id)) return renderMissing(res, 'Modalidade não encontrada.');
  req.session.flash = { type: 'ok', text: 'Modalidade excluída.' };
  return res.redirect('/admin/modalidades');
});

router.get('/telefone', (req, res) => {
  const settings = getContactSettings(req.db);
  res.render('admin/settings', {
    pageTitle: 'Telefone e WhatsApp · Academia Free Life',
    settings,
    form: {
      phone: formatPhone(settings.phoneFromEnv ? settings.phone : settings.storedPhone),
      whatsapp: formatPhone(settings.whatsappFromEnv ? settings.whatsapp : settings.storedWhatsapp),
    },
    errors: {},
  });
});

router.post('/telefone', (req, res) => {
  const settings = getContactSettings(req.db);
  const result = validateSettings(req.body, settings);
  if (!result.ok) {
    return res.status(400).render('admin/settings', {
      pageTitle: 'Telefone e WhatsApp · Academia Free Life',
      settings,
      form: result.form,
      errors: result.errors,
      errorList: errorList(result.errors),
    });
  }

  if (!settings.phoneFromEnv) setSetting(req.db, 'phone', result.phone);
  if (!settings.whatsappFromEnv) setSetting(req.db, 'whatsapp', result.whatsapp);
  req.session.flash = { type: 'ok', text: 'Telefone e WhatsApp atualizados.' };
  return res.redirect('/admin/telefone');
});

function savePlan(req, res, id) {
  const result = validatePlan(req.body);
  if (!result.ok) {
    return res.status(400).render('admin/plan-form', {
      pageTitle: `${id ? 'Editar plano' : 'Novo plano'} · Academia Free Life`,
      mode: id ? 'editar' : 'novo',
      action: id ? `/admin/planos/${id}` : '/admin/planos',
      deleteHref: id ? `/admin/planos/${id}/excluir` : '',
      form: result.form,
      errors: result.errors,
      errorList: errorList(result.errors),
    });
  }

  if (id) {
    if (!updatePlan(req.db, id, result.data)) return renderMissing(res, 'Plano não encontrado.');
    req.session.flash = { type: 'ok', text: 'Plano atualizado.' };
  } else {
    createPlan(req.db, result.data);
    req.session.flash = { type: 'ok', text: 'Plano criado.' };
  }
  return res.redirect('/admin/planos');
}

function saveClass(req, res, id) {
  const result = validateClass(req.body);
  if (!result.ok) {
    return res.status(400).render('admin/class-form', {
      pageTitle: `${id ? 'Editar modalidade' : 'Nova modalidade'} · Academia Free Life`,
      mode: id ? 'editar' : 'novo',
      action: id ? `/admin/modalidades/${id}` : '/admin/modalidades',
      deleteHref: id ? `/admin/modalidades/${id}/excluir` : '',
      form: result.form,
      errors: result.errors,
      errorList: errorList(result.errors),
    });
  }

  if (id) {
    if (!updateClass(req.db, id, result.data)) return renderMissing(res, 'Modalidade não encontrada.');
    req.session.flash = { type: 'ok', text: 'Modalidade atualizada.' };
  } else {
    createClass(req.db, result.data);
    req.session.flash = { type: 'ok', text: 'Modalidade criada.' };
  }
  return res.redirect('/admin/modalidades');
}

module.exports = router;
