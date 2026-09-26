const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD = 'senha-de-teste';
process.env.SESSION_SECRET = 'segredo-de-teste-longo-o-bastante';
process.env.COOKIE_SECURE = '';
process.env.TRUST_PROXY = '';
process.env.PHONE = '';
process.env.WHATSAPP = '';
delete process.env.DB_PATH;

const request = require('supertest');
const { createApp, jsonForScript } = require('../src/app');
const { resetSecurityState, safeEqual } = require('../src/security');
const { resolveRuntimeConfig, warnRuntime, DEV_PASSWORD } = require('../src/runtime');

const PASSWORD = 'senha-de-teste';

describe('site', { concurrency: false }, () => {
  let app;
  let db;
  let dbPath;

  before(() => {
    dbPath = path.join(os.tmpdir(), `freelife-test-${process.pid}.sqlite`);
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(dbPath + suffix);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    ({ app, db } = createApp({ dbPath }));
  });

  after(() => {
    db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(dbPath + suffix);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  });

  beforeEach(() => {
    resetSecurityState();
  });

  test('compare senhas em tempo constante e escapa JSON-LD', () => {
    assert.equal(safeEqual('abc', 'abc'), true);
    assert.equal(safeEqual('abc', 'abd'), false);
    assert.equal(jsonForScript({ html: '</script><script>' }), '{"html":"\\u003c/script\\u003e\\u003cscript\\u003e"}');
  });

  test('produção sem ADMIN_PASSWORD não usa a senha pública', () => {
    const runtime = resolveRuntimeConfig({ NODE_ENV: 'production' });
    assert.equal(runtime.generatedPassword, true);
    assert.equal(runtime.usingDefaultPassword, false);
    assert.notEqual(runtime.adminPassword, DEV_PASSWORD);
    assert.ok(runtime.adminPassword.length >= 20);
    assert.equal(runtime.generatedSecret, true);
    assert.equal(runtime.trustProxy, false);

    const lines = [];
    const original = console.error;
    console.error = (...args) => lines.push(args.join(' '));
    try {
      warnRuntime(runtime);
    } finally {
      console.error = original;
    }
    const text = lines.join('\n');
    assert.match(text, /ADMIN_PASSWORD não está definido em produção/);
    assert.match(text, /A senha pública do README NÃO será usada/);
    assert.match(text, new RegExp(runtime.adminPassword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  test('produção com a senha pública avisa, e TRUST_PROXY só liga com 1', () => {
    const runtime = resolveRuntimeConfig({
      NODE_ENV: 'production',
      ADMIN_PASSWORD: DEV_PASSWORD,
      SESSION_SECRET: 'chave-longa-de-producao',
      TRUST_PROXY: '1',
    });
    assert.equal(runtime.generatedPassword, false);
    assert.equal(runtime.usingDefaultPassword, true);
    assert.equal(runtime.trustProxy, true);
    assert.equal(resolveRuntimeConfig({ TRUST_PROXY: 'true' }).trustProxy, false);
  });

  test('páginas públicas renderizam e o aviso de exemplo fica só em planos e horários', async () => {
    const home = await request(app).get('/');
    assert.equal(home.status, 200);
    assert.match(home.text, /Academia Free Life/);
    assert.match(home.text, /Av\. Dr\. Ernani Pires Domingues, 5070/);
    assert.match(home.text, /4,8/);
    assert.match(home.text, /276/);
    assert.equal(home.text.includes('class="banner"'), false);
    assert.equal(home.text.includes('Conteúdo de exemplo'), false);
    assert.equal(home.text.includes('class="example-note"'), false);
    assert.equal(home.text.includes('tel:'), false);
    assert.equal(home.text.includes('wa.me'), false);
    assert.equal(home.headers['x-content-type-options'], 'nosniff');
    assert.equal(home.headers['x-frame-options'], 'SAMEORIGIN');
    assert.equal(home.headers['x-powered-by'], undefined);
    assert.match(home.headers['content-security-policy'], /default-src 'self'/);
    assert.match(home.headers['content-security-policy'], /script-src 'self' 'nonce-/);
    assert.match(home.text, /nonce="[^"]+"/);

    const planos = await request(app).get('/planos');
    assert.equal(planos.status, 200);
    assert.match(planos.text, /class="example-note"/);
    assert.match(planos.text, /badge-example/);
    assert.match(planos.text, /A definir/);
    assert.match(planos.text, /Mensal \(exemplo\)/);

    const modalidades = await request(app).get('/modalidades');
    assert.equal(modalidades.status, 200);
    assert.match(modalidades.text, /class="example-note"/);
    assert.match(modalidades.text, /Musculação \(exemplo\)/);

    const contato = await request(app).get('/contato');
    assert.equal(contato.status, 200);
    assert.match(contato.text, /name="_csrf"/);
    assert.match(contato.text, /<label for="name">/);
    assert.match(contato.text, /Mapa do Google/);
    assert.match(contato.text, /15040-548/);

    const missing = await request(app).get('/nao-existe');
    assert.equal(missing.status, 404);
  });

  test('formulário valida, grava e ignora o honeypot', async () => {
    const agent = request.agent(app);
    const page = await agent.get('/contato');
    const token = csrfOf(page.text);

    const invalid = await agent
      .post('/contato')
      .type('form')
      .send({ _csrf: token, name: 'A', phone: '123', interest: '', message: 'curta' });
    assert.equal(invalid.status, 400);
    assert.match(invalid.text, /Informe seu nome/);
    assert.match(invalid.text, /Telefone inválido/);

    const honeypot = await agent.post('/contato').type('form').redirects(0).send({
      _csrf: token,
      hp_field: 'sou um robô',
      name: 'Robo Spam',
      phone: '17988887777',
      interest: 'duvida',
      message: 'Esta mensagem não pode ser gravada no banco.',
    });
    assert.equal(honeypot.status, 302);

    const saved = await agent.post('/contato').type('form').redirects(0).send({
      _csrf: token,
      name: 'Ana Souza',
      phone: '(17) 98888-7766',
      email: 'ana@example.com',
      interest: 'duvida',
      message: 'Quero saber o horário de funcionamento da unidade.',
    });
    assert.equal(saved.status, 302);
    assert.equal(saved.headers.location, '/contato');

    const again = await agent.get('/contato');
    assert.match(again.text, /Mensagem enviada/);

    const denied = await request(app).post('/contato').type('form').send({
      name: 'Sem Token',
      phone: '17988887777',
      interest: 'duvida',
      message: 'Esta mensagem não tem token CSRF.',
    });
    assert.equal(denied.status, 403);

    await login(agent);
    const inbox = await agent.get('/admin/mensagens');
    assert.match(inbox.text, /Ana Souza/);
    assert.match(inbox.text, /Quero saber o horário/);
    assert.equal(inbox.text.includes('Robo Spam'), false);
    assert.equal(inbox.text.includes('Sem Token'), false);
    assert.equal(inbox.headers['cache-control'], 'no-store');
  });

  test('login do painel, sessão nova e bloqueio depois de 8 erros', async () => {
    const stranger = request.agent(app);
    const open = await stranger.get('/admin/planos').redirects(0);
    assert.equal(open.status, 302);
    assert.equal(open.headers.location, '/admin');

    const loginPage = await stranger.get('/admin');
    assert.equal(loginPage.status, 200);
    assert.match(loginPage.text, /<label for="password">/);
    const token = csrfOf(loginPage.text);
    const beforeCookie = cookieValue(loginPage);

    const empty = await stranger.post('/admin/entrar').type('form').send({ _csrf: token, password: '' });
    assert.equal(empty.status, 400);
    assert.match(empty.text, /Informe a senha/);

    const wrong = await stranger
      .post('/admin/entrar')
      .type('form')
      .send({ _csrf: token, password: 'errada' });
    assert.equal(wrong.status, 401);
    assert.match(wrong.text, /Senha incorreta/);
    assert.match(wrong.text, /aria-invalid="true"/);

    const ok = await stranger
      .post('/admin/entrar')
      .type('form')
      .redirects(0)
      .send({ _csrf: token, password: PASSWORD });
    assert.equal(ok.status, 302);
    assert.equal(ok.headers.location, '/admin');
    const afterCookie = cookieValue(ok);
    assert.ok(afterCookie);
    assert.notEqual(afterCookie, beforeCookie);

    const home = await stranger.get('/admin');
    assert.match(home.text, /Você entrou no painel/);
    assert.match(home.text, /Ainda há dados de exemplo/);
    assert.equal(home.text.includes('Senha padrão'), false);

    const attacker = request.agent(app);
    const form = await attacker.get('/admin');
    const attackToken = csrfOf(form.text);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const attemptRes = await attacker
        .post('/admin/entrar')
        .type('form')
        .set('X-Forwarded-For', `203.0.113.${attempt + 1}`)
        .send({ _csrf: attackToken, password: `errada-${attempt}` });
      assert.equal(attemptRes.status, 401);
    }
    const locked = await attacker
      .post('/admin/entrar')
      .type('form')
      .set('X-Forwarded-For', '198.51.100.8')
      .send({ _csrf: attackToken, password: PASSWORD });
    assert.equal(locked.status, 429);
    assert.match(locked.text, /Muitas tentativas/);
  });

  test('CRUD de planos escapa HTML e não interpreta SQL', async () => {
    const agent = request.agent(app);
    await login(agent);

    const forged = await agent.post('/admin/planos').type('form').send({
      _csrf: 'token-errado',
      name: 'Forjado',
      price_label: 'R$ 1',
      active: '1',
    });
    assert.equal(forged.status, 403);

    const blank = await agent.get('/admin/planos/novo');
    const invalid = await agent.post('/admin/planos').type('form').send({
      _csrf: csrfOf(blank.text),
      name: 'x',
      price_label: '',
      sort_order: 'nope',
    });
    assert.equal(invalid.status, 400);
    assert.match(invalid.text, /Informe o nome do plano/);

    const xssName = 'XSS <script>alert(1)</script>';
    const created = await agent.post('/admin/planos').type('form').redirects(0).send({
      _csrf: csrfOf(blank.text),
      name: xssName,
      price_label: 'A definir',
      period_label: 'por mês',
      description: 'Plano criado no teste.',
      benefits: 'Musculação\nAvaliação',
      active: '1',
      sort_order: '9',
    });
    assert.equal(created.status, 302);

    const sqlName = "Mensal'; DROP TABLE plans;--";
    const createdSql = await agent.get('/admin/planos/novo');
    const sqlSave = await agent.post('/admin/planos').type('form').redirects(0).send({
      _csrf: csrfOf(createdSql.text),
      name: sqlName,
      price_label: 'A definir',
      active: '1',
      sort_order: '8',
    });
    assert.equal(sqlSave.status, 302);

    const hiddenName = 'Plano oculto QA';
    const hiddenForm = await agent.get('/admin/planos/novo');
    await agent.post('/admin/planos').type('form').redirects(0).send({
      _csrf: csrfOf(hiddenForm.text),
      name: hiddenName,
      price_label: 'A definir',
      sort_order: '7',
    });

    const adminList = await agent.get('/admin/planos');
    assert.match(adminList.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.equal(adminList.text.includes('<script>alert(1)</script>'), false);
    assert.match(adminList.text, /DROP TABLE plans/);
    assert.match(adminList.text, /Mensal \(exemplo\)/);
    assert.match(adminList.text, /Plano oculto QA/);

    const publicPlans = await request(app).get('/planos');
    assert.match(publicPlans.text, /&lt;script&gt;/);
    assert.match(publicPlans.text, /DROP TABLE plans/);
    assert.equal(publicPlans.text.includes('Plano oculto QA'), false);
    assert.match(publicPlans.text, /Musculação/);

    const id = idAfter(adminList.text, xssName, '/admin/planos');
    const edit = await agent.get(`/admin/planos/${id}/editar`);
    const updated = await agent
      .post(`/admin/planos/${id}`)
      .type('form')
      .redirects(0)
      .send({
        _csrf: csrfOf(edit.text),
        name: 'Plano editado QA',
        price_label: 'A definir',
        description: 'Texto atualizado.',
        active: '1',
        highlighted: '1',
        sort_order: '4',
      });
    assert.equal(updated.status, 302);

    const afterEdit = await request(app).get('/planos');
    assert.match(afterEdit.text, /Plano editado QA/);
    assert.equal(afterEdit.text.includes(xssName), false);

    const removePage = await agent.get(`/admin/planos/${id}/excluir`);
    const removed = await agent
      .post(`/admin/planos/${id}/excluir`)
      .type('form')
      .redirects(0)
      .send({ _csrf: csrfOf(removePage.text) });
    assert.equal(removed.status, 302);
    const gone = await request(app).get('/planos');
    assert.equal(gone.text.includes('Plano editado QA'), false);

    const junk = await agent.get('/admin/planos/1%20OR%201%3D1/editar');
    assert.equal(junk.status, 404);
  });

  test('CRUD de modalidades', async () => {
    const agent = request.agent(app);
    await login(agent);

    const form = await agent.get('/admin/modalidades/novo');
    const bad = await agent.post('/admin/modalidades').type('form').send(
      classBody(csrfOf(form.text), {
        name: 'Hidro QA',
        start_time: '19:00',
        end_time: '18:00',
        weekdays: ['1'],
      })
    );
    assert.equal(bad.status, 400);
    assert.match(bad.text, /depois do início/);

    const created = await agent.post('/admin/modalidades').type('form').redirects(0).send(
      classBody(csrfOf(form.text), {
        name: 'Hidro QA',
        description: 'Aula de teste.',
        weekdays: ['2', '4'],
        start_time: '06:30',
        end_time: '07:15',
        active: '1',
        sort_order: '6',
      })
    );
    assert.equal(created.status, 302);

    const list = await agent.get('/admin/modalidades');
    assert.match(list.text, /Hidro QA/);
    assert.match(list.text, /Ter, Qui/);
    const id = idAfter(list.text, 'Hidro QA', '/admin/modalidades');

    const edit = await agent.get(`/admin/modalidades/${id}/editar`);
    const updated = await agent
      .post(`/admin/modalidades/${id}`)
      .type('form')
      .redirects(0)
      .send(
        classBody(csrfOf(edit.text), {
          name: 'Hidro QA',
          description: 'Horário ajustado.',
          weekdays: ['6'],
          start_time: '08:10',
          end_time: '08:40',
          active: '1',
          sort_order: '6',
        })
      );
    assert.equal(updated.status, 302);

    const publicPage = await request(app).get('/modalidades');
    assert.match(publicPage.text, /Hidro QA/);
    assert.match(publicPage.text, /Sáb/);
    assert.match(publicPage.text, /08:10/);

    const removePage = await agent.get(`/admin/modalidades/${id}/excluir`);
    const removed = await agent
      .post(`/admin/modalidades/${id}/excluir`)
      .type('form')
      .redirects(0)
      .send({ _csrf: csrfOf(removePage.text) });
    assert.equal(removed.status, 302);
    const gone = await request(app).get('/modalidades');
    assert.equal(gone.text.includes('Hidro QA'), false);

    const logoutPage = await agent.get('/admin');
    const loggedOut = await agent
      .post('/admin/sair')
      .type('form')
      .redirects(0)
      .send({ _csrf: csrfOf(logoutPage.text) });
    assert.equal(loggedOut.status, 302);
    const guarded = await agent.get('/admin/modalidades').redirects(0);
    assert.equal(guarded.status, 302);
    assert.equal(guarded.headers.location, '/admin');
  });
});

function csrfOf(html) {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  assert.ok(match, 'token CSRF ausente');
  return match[1];
}

function cookieValue(res) {
  const raw = res.headers['set-cookie'];
  const line = Array.isArray(raw) ? raw.find((item) => item.startsWith('freelife.sid=')) : raw;
  if (!line) return '';
  return line.split(';')[0];
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function idAfter(html, name, prefix) {
  const needle = escapeHtml(name);
  const index = html.indexOf(needle);
  assert.ok(index >= 0, `não achei ${name}`);
  const slice = html.slice(index, index + 800);
  const match = slice.match(new RegExp(`${prefix}/(\\d+)/editar`));
  assert.ok(match, `sem link de edição para ${name}`);
  return match[1];
}

function classBody(token, fields) {
  const params = new URLSearchParams();
  params.set('_csrf', token);
  params.set('name', fields.name);
  params.set('description', fields.description || '');
  params.set('start_time', fields.start_time);
  params.set('end_time', fields.end_time);
  params.set('sort_order', fields.sort_order || '0');
  if (fields.active) params.set('active', fields.active);
  for (const day of fields.weekdays || []) params.append('weekdays', day);
  return params.toString();
}

async function login(agent) {
  const page = await agent.get('/admin');
  const res = await agent.post('/admin/entrar').type('form').redirects(0).send({
    _csrf: csrfOf(page.text),
    password: PASSWORD,
  });
  assert.equal(res.status, 302, res.text);
  return agent;
}
