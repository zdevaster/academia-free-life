const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { presentPlan, presentClass } = require('./format');
const { normalizePhone, normalizeWhatsapp } = require('./phone');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price_label TEXT NOT NULL,
  period_label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  benefits TEXT NOT NULL DEFAULT '',
  highlighted INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  is_placeholder INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  weekdays TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  is_placeholder INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  interest TEXT NOT NULL,
  plan_id INTEGER,
  plan_name TEXT NOT NULL DEFAULT '',
  class_id INTEGER,
  class_name TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const EXAMPLE_BENEFITS = [
  'Acesso à unidade (exemplo)',
  'Horário a confirmar',
  'Condições a confirmar',
].join('\n');

function nowIso() {
  return new Date().toISOString();
}

function seed(db) {
  const run = db.transaction(() => {
    const existing = db.prepare(`SELECT 1 AS ok FROM settings WHERE key = 'seeded'`).get();
    if (existing) return false;

    const stamp = nowIso();
    const insertPlan = db.prepare(`
      INSERT INTO plans (
        name, price_label, period_label, description, benefits,
        highlighted, active, is_placeholder, sort_order, created_at, updated_at
      ) VALUES (
        @name, @price_label, @period_label, @description, @benefits,
        0, 1, 1, @sort_order, @stamp, @stamp
      )
    `);

    const plans = [
      {
        name: 'Mensal (exemplo)',
        price_label: 'A definir',
        period_label: 'por mês',
        description:
          'Plano de exemplo. O valor real não constava da ficha do Google. Substitua nome, preço e benefícios no painel antes de divulgar.',
        sort_order: 1,
      },
      {
        name: 'Trimestral (exemplo)',
        price_label: 'A definir',
        period_label: 'a cada 3 meses',
        description:
          'Plano de exemplo para um período maior. Não é a tabela oficial da academia.',
        sort_order: 2,
      },
      {
        name: 'Anual (exemplo)',
        price_label: 'A definir',
        period_label: 'por ano',
        description:
          'Plano de exemplo. Apague ou edite quando a academia informar as condições reais.',
        sort_order: 3,
      },
    ];

    plans.forEach((plan) => {
      insertPlan.run({ ...plan, benefits: EXAMPLE_BENEFITS, stamp });
    });

    const insertClass = db.prepare(`
      INSERT INTO classes (
        name, description, weekdays, start_time, end_time,
        active, is_placeholder, sort_order, created_at, updated_at
      ) VALUES (
        @name, @description, @weekdays, @start_time, @end_time,
        1, 1, @sort_order, @stamp, @stamp
      )
    `);

    const classes = [
      {
        name: 'Musculação (exemplo)',
        description:
          'Horário de exemplo. A ficha do Google não trazia a grade. Confirme dias e horas com a academia e edite este registro.',
        weekdays: '1,2,3,4,5',
        start_time: '06:00',
        end_time: '22:00',
        sort_order: 1,
      },
      {
        name: 'Funcional (exemplo)',
        description:
          'Turma de exemplo. Substitua o nome se a academia não oferece esta aula.',
        weekdays: '1,3,5',
        start_time: '07:00',
        end_time: '08:00',
        sort_order: 2,
      },
      {
        name: 'Alongamento (exemplo)',
        description:
          'Turma de exemplo. Dias e horário foram inventados só para a grade aparecer editável.',
        weekdays: '2,4',
        start_time: '19:00',
        end_time: '19:45',
        sort_order: 3,
      },
      {
        name: 'Sábado (exemplo)',
        description:
          'Bloco de exemplo no sábado. Apague se a unidade não abre neste dia — o horário real não foi informado.',
        weekdays: '6',
        start_time: '09:00',
        end_time: '10:00',
        sort_order: 4,
      },
    ];

    classes.forEach((item) => insertClass.run({ ...item, stamp }));

    const insertSetting = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`);
    insertSetting.run('seeded', '1');
    insertSetting.run('phone', '');
    insertSetting.run('whatsapp', '');
    return true;
  });

  return run();
}

function initDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 3000');
  db.exec(SCHEMA);
  const seeded = seed(db);
  return { db, seeded };
}

function listPlans(db, { activeOnly = false } = {}) {
  const sql = activeOnly
    ? 'SELECT * FROM plans WHERE active = 1 ORDER BY sort_order ASC, id ASC'
    : 'SELECT * FROM plans ORDER BY sort_order ASC, id ASC';
  return db.prepare(sql).all().map(presentPlan);
}

function getPlan(db, id) {
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
  return row ? presentPlan(row) : null;
}

function createPlan(db, data) {
  const stamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO plans (
        name, price_label, period_label, description, benefits,
        highlighted, active, is_placeholder, sort_order, created_at, updated_at
      ) VALUES (
        @name, @price_label, @period_label, @description, @benefits,
        @highlighted, @active, @is_placeholder, @sort_order, @created_at, @updated_at
      )`
    )
    .run({ ...data, created_at: stamp, updated_at: stamp });
  return result.lastInsertRowid;
}

function updatePlan(db, id, data) {
  const result = db
    .prepare(
      `UPDATE plans SET
        name = @name,
        price_label = @price_label,
        period_label = @period_label,
        description = @description,
        benefits = @benefits,
        highlighted = @highlighted,
        active = @active,
        is_placeholder = @is_placeholder,
        sort_order = @sort_order,
        updated_at = @updated_at
      WHERE id = @id`
    )
    .run({ ...data, id, updated_at: nowIso() });
  return result.changes;
}

function deletePlan(db, id) {
  return db.prepare('DELETE FROM plans WHERE id = ?').run(id).changes;
}

function listClasses(db, { activeOnly = false } = {}) {
  const sql = activeOnly
    ? 'SELECT * FROM classes WHERE active = 1 ORDER BY sort_order ASC, id ASC'
    : 'SELECT * FROM classes ORDER BY sort_order ASC, id ASC';
  return db.prepare(sql).all().map(presentClass);
}

function getClass(db, id) {
  const row = db.prepare('SELECT * FROM classes WHERE id = ?').get(id);
  return row ? presentClass(row) : null;
}

function createClass(db, data) {
  const stamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO classes (
        name, description, weekdays, start_time, end_time,
        active, is_placeholder, sort_order, created_at, updated_at
      ) VALUES (
        @name, @description, @weekdays, @start_time, @end_time,
        @active, @is_placeholder, @sort_order, @created_at, @updated_at
      )`
    )
    .run({ ...data, created_at: stamp, updated_at: stamp });
  return result.lastInsertRowid;
}

function updateClass(db, id, data) {
  const result = db
    .prepare(
      `UPDATE classes SET
        name = @name,
        description = @description,
        weekdays = @weekdays,
        start_time = @start_time,
        end_time = @end_time,
        active = @active,
        is_placeholder = @is_placeholder,
        sort_order = @sort_order,
        updated_at = @updated_at
      WHERE id = @id`
    )
    .run({ ...data, id, updated_at: nowIso() });
  return result.changes;
}

function deleteClass(db, id) {
  return db.prepare('DELETE FROM classes WHERE id = ?').run(id).changes;
}

function listSubmissions(db, limit = 200) {
  return db
    .prepare('SELECT * FROM submissions ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(limit);
}

function getSubmission(db, id) {
  return db.prepare('SELECT * FROM submissions WHERE id = ?').get(id) || null;
}

function countSubmissions(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n;
}

function createSubmission(db, data) {
  const result = db
    .prepare(
      `INSERT INTO submissions (
        name, phone, email, interest, plan_id, plan_name, class_id, class_name, message, created_at
      ) VALUES (
        @name, @phone, @email, @interest, @plan_id, @plan_name, @class_id, @class_name, @message, @created_at
      )`
    )
    .run({ ...data, created_at: nowIso() });
  return result.lastInsertRowid;
}

function deleteSubmission(db, id) {
  return db.prepare('DELETE FROM submissions WHERE id = ?').run(id).changes;
}

function placeholderFlags(db) {
  const plans = db
    .prepare('SELECT COUNT(*) AS n FROM plans WHERE active = 1 AND is_placeholder = 1')
    .get().n;
  const classes = db
    .prepare('SELECT COUNT(*) AS n FROM classes WHERE active = 1 AND is_placeholder = 1')
    .get().n;
  return { plans, classes, any: plans + classes > 0 };
}

function counts(db) {
  return {
    submissions: countSubmissions(db),
    plans: db.prepare('SELECT COUNT(*) AS n FROM plans').get().n,
    activePlans: db.prepare('SELECT COUNT(*) AS n FROM plans WHERE active = 1').get().n,
    classes: db.prepare('SELECT COUNT(*) AS n FROM classes').get().n,
    activeClasses: db.prepare('SELECT COUNT(*) AS n FROM classes WHERE active = 1').get().n,
  };
}

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}

function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

function getContactSettings(db) {
  const storedPhone = getSetting(db, 'phone');
  const storedWhatsapp = getSetting(db, 'whatsapp');
  let phone = storedPhone;
  let whatsapp = storedWhatsapp;
  let phoneFromEnv = false;
  let whatsappFromEnv = false;

  const envPhone = (process.env.PHONE || '').trim();
  if (envPhone) {
    const normalized = normalizePhone(envPhone);
    if (normalized) {
      phone = normalized;
      phoneFromEnv = true;
    }
  }

  const envWhatsapp = (process.env.WHATSAPP || '').trim();
  if (envWhatsapp) {
    const normalized = normalizeWhatsapp(envWhatsapp);
    if (normalized) {
      whatsapp = normalized;
      whatsappFromEnv = true;
    }
  }

  return {
    phone,
    whatsapp,
    storedPhone,
    storedWhatsapp,
    phoneFromEnv,
    whatsappFromEnv,
  };
}

module.exports = {
  initDb,
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
  createSubmission,
  deleteSubmission,
  placeholderFlags,
  counts,
  getContactSettings,
  setSetting,
};
