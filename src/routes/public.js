const express = require('express');
const { INTERESTS, groupWeek, errorList, parseId } = require('../format');
const {
  listPlans,
  listClasses,
  createSubmission,
} = require('../db');
const { validateSubmission } = require('../validators');
const { allowAction } = require('../security');

const router = express.Router();

const SUCCESS =
  'Mensagem enviada. Ela ficou registrada para a academia. O retorno depende do contato da unidade — não há um prazo publicado.';

function blankForm(query, plans, classes) {
  const interestIds = new Set(INTERESTS.map((item) => item.id));
  const planId = parseId(query.plano);
  const classId = parseId(query.modalidade);
  let interest = '';
  if (interestIds.has(query.interesse)) interest = query.interesse;
  else if (planId) interest = 'matricula';
  else if (classId) interest = 'aula-experimental';

  return {
    name: '',
    phone: '',
    email: '',
    interest,
    plan_id: planId && plans.some((plan) => plan.id === planId) ? String(planId) : '',
    class_id: classId && classes.some((item) => item.id === classId) ? String(classId) : '',
    message: '',
  };
}

router.get('/', (req, res) => {
  const plans = listPlans(req.db, { activeOnly: true }).slice(0, 3);
  const classes = listClasses(req.db, { activeOnly: true }).slice(0, 4);
  res.render('home', {
    pageTitle: 'Academia Free Life · São José do Rio Preto',
    metaDescription:
      'Academia Free Life no Res. Macedo Teles I, São José do Rio Preto — SP. Endereço, nota no Google, planos e contato.',
    plans,
    classes,
  });
});

router.get('/planos', (req, res) => {
  res.render('planos', {
    pageTitle: 'Planos · Academia Free Life',
    metaDescription:
      'Planos da Academia Free Life. Valores marcados como exemplo precisam ser confirmados com a academia.',
    plans: listPlans(req.db, { activeOnly: true }),
  });
});

router.get('/modalidades', (req, res) => {
  const classes = listClasses(req.db, { activeOnly: true });
  res.render('modalidades', {
    pageTitle: 'Modalidades e horários · Academia Free Life',
    metaDescription:
      'Modalidades e grade de horários da Academia Free Life. Itens de exemplo não são a programação oficial.',
    classes,
    week: groupWeek(classes),
  });
});

router.get('/contato', (req, res) => {
  const plans = listPlans(req.db, { activeOnly: true });
  const classes = listClasses(req.db, { activeOnly: true });
  res.render('contato', {
    pageTitle: 'Contato · Academia Free Life',
    metaDescription:
      'Endereço, mapa e formulário da Academia Free Life na Av. Dr. Ernani Pires Domingues, 5070, São José do Rio Preto.',
    plans,
    classes,
    form: blankForm(req.query, plans, classes),
    errors: {},
    errorList: [],
  });
});

router.post('/contato', (req, res) => {
  const plans = listPlans(req.db, { activeOnly: true });
  const classes = listClasses(req.db, { activeOnly: true });
  const page = {
    pageTitle: 'Contato · Academia Free Life',
    metaDescription:
      'Endereço, mapa e formulário da Academia Free Life na Av. Dr. Ernani Pires Domingues, 5070, São José do Rio Preto.',
    plans,
    classes,
  };

  if (!allowAction('contact', req.ip || 'local', 12, 10 * 60 * 1000)) {
    return res.status(429).render('contato', {
      ...page,
      form: {
        name: '',
        phone: '',
        email: '',
        interest: '',
        plan_id: '',
        class_id: '',
        message: '',
      },
      errors: {},
      errorList: [
        {
          field: 'message',
          message: 'Muitas mensagens a partir deste acesso. Espere alguns minutos e tente de novo.',
        },
      ],
    });
  }

  if (String((req.body && req.body.hp_field) || '').trim()) {
    req.session.flash = { type: 'ok', text: SUCCESS };
    return res.redirect('/contato');
  }

  const result = validateSubmission(req.body, { plans, classes });
  if (!result.ok) {
    return res.status(400).render('contato', {
      ...page,
      form: result.form,
      errors: result.errors,
      errorList: errorList(result.errors),
    });
  }

  createSubmission(req.db, result.data);
  req.session.flash = { type: 'ok', text: SUCCESS };
  return res.redirect('/contato');
});

module.exports = router;
