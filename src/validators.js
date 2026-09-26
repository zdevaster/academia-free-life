const { INTERESTS, asArray } = require('./format');
const { normalizePhone, normalizeWhatsapp } = require('./phone');

function hasControls(value) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value);
}

function cleanBlock(value, { min, max }) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (hasControls(text)) return { ok: false, value: text };
  if (text.length < min || text.length > max) return { ok: false, value: text };
  return { ok: true, value: text };
}

function cleanLine(value, { min, max }) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (hasControls(text)) return { ok: false, value: text };
  if (text.length < min || text.length > max) return { ok: false, value: text };
  return { ok: true, value: text };
}

function parseSort(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  if (!/^\d{1,3}$/.test(raw)) return null;
  const number = Number(raw);
  if (!Number.isInteger(number) || number < 0 || number > 999) return null;
  return number;
}

function flag(value) {
  return value === '1' || value === 'on';
}

function validatePlan(body) {
  const source = body || {};
  const errors = {};
  const name = cleanLine(source.name, { min: 2, max: 80 });
  const price = cleanLine(source.price_label, { min: 1, max: 40 });
  const period = cleanLine(source.period_label, { min: 0, max: 40 });
  const description = cleanBlock(source.description, { min: 0, max: 500 });
  const rawBenefits = String(source.benefits ?? '').replace(/\r\n/g, '\n');
  const benefitLines = rawBenefits
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const sort = parseSort(source.sort_order);

  if (!name.ok) errors.name = 'Informe o nome do plano (2 a 80 caracteres).';
  if (!price.ok) errors.price_label = 'Informe o valor em texto, com até 40 caracteres. Pode ser “A definir”.';
  if (!period.ok) errors.period_label = 'O período pode ter no máximo 40 caracteres.';
  if (!description.ok) errors.description = 'A descrição pode ter no máximo 500 caracteres.';
  if (hasControls(rawBenefits) || benefitLines.length > 20 || benefitLines.some((line) => line.length > 140)) {
    errors.benefits = 'Use até 20 benefícios, um por linha, com no máximo 140 caracteres cada.';
  }
  if (sort == null) errors.sort_order = 'A ordem precisa ser um número de 0 a 999.';

  const form = {
    name: String(source.name ?? '').replace(/\s+/g, ' ').trim(),
    price_label: String(source.price_label ?? '').replace(/\s+/g, ' ').trim(),
    period_label: String(source.period_label ?? '').replace(/\s+/g, ' ').trim(),
    description: String(source.description ?? '').replace(/\r\n/g, '\n').trim(),
    benefits: rawBenefits.trim(),
    highlighted: flag(source.highlighted),
    active: flag(source.active),
    is_placeholder: flag(source.is_placeholder),
    sort_order: String(source.sort_order ?? '').trim(),
  };

  if (Object.keys(errors).length) return { ok: false, errors, form };

  return {
    ok: true,
    errors,
    form,
    data: {
      name: name.value,
      price_label: price.value,
      period_label: period.value,
      description: description.value,
      benefits: benefitLines.join('\n'),
      highlighted: form.highlighted ? 1 : 0,
      active: form.active ? 1 : 0,
      is_placeholder: form.is_placeholder ? 1 : 0,
      sort_order: sort,
    },
  };
}

function normalizeWeekdays(value) {
  const ids = [
    ...new Set(
      asArray(value)
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 1 && item <= 7)
    ),
  ];
  ids.sort((a, b) => a - b);
  return ids;
}

function normalizeTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function validateClass(body) {
  const source = body || {};
  const errors = {};
  const name = cleanLine(source.name, { min: 2, max: 80 });
  const description = cleanBlock(source.description, { min: 0, max: 500 });
  const weekdays = normalizeWeekdays(source.weekdays);
  const start = normalizeTime(source.start_time);
  const end = normalizeTime(source.end_time);
  const sort = parseSort(source.sort_order);

  if (!name.ok) errors.name = 'Informe o nome da modalidade (2 a 80 caracteres).';
  if (!description.ok) errors.description = 'A descrição pode ter no máximo 500 caracteres.';
  if (!weekdays.length) errors.weekdays = 'Marque pelo menos um dia da semana.';
  if (!start) errors.start_time = 'Informe o horário de início.';
  if (!end) errors.end_time = 'Informe o horário de término.';
  if (start && end && end <= start) {
    errors.end_time = 'O horário de término precisa ser depois do início.';
  }
  if (sort == null) errors.sort_order = 'A ordem precisa ser um número de 0 a 999.';

  const form = {
    name: String(source.name ?? '').replace(/\s+/g, ' ').trim(),
    description: String(source.description ?? '').replace(/\r\n/g, '\n').trim(),
    weekdays,
    start_time: start || String(source.start_time ?? '').trim(),
    end_time: end || String(source.end_time ?? '').trim(),
    active: flag(source.active),
    is_placeholder: flag(source.is_placeholder),
    sort_order: String(source.sort_order ?? '').trim(),
  };

  if (Object.keys(errors).length) return { ok: false, errors, form };

  return {
    ok: true,
    errors,
    form,
    data: {
      name: name.value,
      description: description.value,
      weekdays: weekdays.join(','),
      start_time: start,
      end_time: end,
      active: form.active ? 1 : 0,
      is_placeholder: form.is_placeholder ? 1 : 0,
      sort_order: sort,
    },
  };
}

function validateSubmission(body, { plans, classes }) {
  const source = body || {};
  const errors = {};
  const name = cleanLine(source.name, { min: 2, max: 80 });
  const phone = normalizePhone(source.phone);
  const emailRaw = String(source.email ?? '').trim();
  const message = cleanBlock(source.message, { min: 10, max: 2000 });
  const interest = String(source.interest ?? '');
  const planId = source.plan_id ? Number(source.plan_id) : null;
  const classId = source.class_id ? Number(source.class_id) : null;

  if (!name.ok || !/\p{L}/u.test(name.value || '')) {
    errors.name = 'Informe seu nome (mínimo de 2 caracteres).';
  } else if (!/^[\p{L}\p{M}\p{N}.'’ -]+$/u.test(name.value)) {
    errors.name = 'Use letras, números e espaços no nome.';
  }

  if (!String(source.phone ?? '').trim()) {
    errors.phone = 'Informe um telefone com DDD. Exemplo: (17) 99999-9999.';
  } else if (!phone) {
    errors.phone = 'Telefone inválido. Use DDD + número, com 10 ou 11 dígitos.';
  }

  if (emailRaw) {
    if (emailRaw.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      errors.email = 'Informe um e-mail válido ou deixe o campo em branco.';
    }
  }

  if (!INTERESTS.some((item) => item.id === interest)) {
    errors.interest = 'Selecione o motivo do contato.';
  }

  let plan = null;
  if (source.plan_id) {
    plan = plans.find((item) => item.id === planId) || null;
    if (!plan) errors.plan_id = 'Escolha um plano da lista ou deixe em branco.';
  }

  let classItem = null;
  if (source.class_id) {
    classItem = classes.find((item) => item.id === classId) || null;
    if (!classItem) errors.class_id = 'Escolha uma modalidade da lista ou deixe em branco.';
  }

  if (!message.ok) {
    errors.message =
      String(source.message ?? '').trim().length > 2000
        ? 'A mensagem pode ter no máximo 2000 caracteres.'
        : 'Escreva uma mensagem com pelo menos 10 caracteres.';
  }

  const form = {
    name: String(source.name ?? '').replace(/\s+/g, ' ').trim(),
    phone: String(source.phone ?? '').trim(),
    email: emailRaw,
    interest: INTERESTS.some((item) => item.id === interest) ? interest : '',
    plan_id: source.plan_id ? String(source.plan_id) : '',
    class_id: source.class_id ? String(source.class_id) : '',
    message: String(source.message ?? '').replace(/\r\n/g, '\n').trim(),
  };

  if (Object.keys(errors).length) return { ok: false, errors, form };

  return {
    ok: true,
    errors,
    form,
    data: {
      name: name.value,
      phone,
      email: emailRaw,
      interest,
      plan_id: plan ? plan.id : null,
      plan_name: plan ? plan.name : '',
      class_id: classItem ? classItem.id : null,
      class_name: classItem ? classItem.name : '',
      message: message.value,
    },
  };
}

function validateSettings(body, { phoneFromEnv, whatsappFromEnv }) {
  const source = body || {};
  const errors = {};
  const phoneRaw = String(source.phone ?? '').trim();
  const whatsappRaw = String(source.whatsapp ?? '').trim();
  let phone = '';
  let whatsapp = '';

  if (!phoneFromEnv) {
    if (phoneRaw) {
      phone = normalizePhone(phoneRaw);
      if (!phone) errors.phone = 'Informe um telefone com DDD (10 ou 11 dígitos) ou deixe em branco.';
    }
  }

  if (!whatsappFromEnv) {
    if (whatsappRaw) {
      whatsapp = normalizeWhatsapp(whatsappRaw);
      if (!whatsapp) {
        errors.whatsapp = 'Informe um celular com DDD (11 dígitos, começando com 9) ou deixe em branco.';
      }
    }
  }

  const form = {
    phone: phoneRaw,
    whatsapp: whatsappRaw,
  };

  if (Object.keys(errors).length) return { ok: false, errors, form, phone, whatsapp };
  return { ok: true, errors, form, phone, whatsapp };
}

module.exports = {
  validatePlan,
  validateClass,
  validateSubmission,
  validateSettings,
};
