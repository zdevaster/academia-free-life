# Academia Free Life

Site da **Academia Free Life**, no Res. Macedo Teles I, em São José do Rio Preto — SP. As páginas públicas leem planos, modalidades e mensagens de um banco SQLite. O painel em `/admin` altera esses dados sem mexer no código.

Stack: Node.js, Express, templates EJS, SQLite (`better-sqlite3`) e CSS. Não há framework de frontend.

## Rodar

Requisitos: Node.js 18 ou mais novo. Na primeira instalação, `better-sqlite3` compila um módulo nativo (Python 3, `make` e `g++` / build-essential).

```bash
npm install
npm start
```

Abra [http://127.0.0.1:47231](http://127.0.0.1:47231).

O arquivo `data/freelife.sqlite` é criado sozinho na primeira execução, já com planos e horários **de exemplo**. Reiniciar o servidor não apaga o que foi editado no painel.

## Configurar

As variáveis são opcionais. Sem `.env`, em desenvolvimento o site usa a porta `47231` e a senha `freelife-admin`.

```bash
cp .env.example .env
```

| Variável | Função |
| --- | --- |
| `PORT` | Porta HTTP. Padrão: `47231`. |
| `HOST` | Interface. Padrão: `0.0.0.0`. |
| `ADMIN_PASSWORD` | Senha do `/admin`. Em desenvolvimento, vazio vira `freelife-admin`. Em produção, vazio gera uma senha aleatória (impressa no log) e **não** usa a senha pública. |
| `SESSION_SECRET` | Chave do cookie de sessão. Troque por um texto longo e aleatório. Em produção, vazio gera uma chave só daquele processo. |
| `COOKIE_SECURE` | Use `1` só com HTTPS. Em HTTP local, deixe vazio. Em produção sem isso, o servidor avisa no log. |
| `TRUST_PROXY` | Use `1` só atrás de um proxy reverso de confiança. Sem isso, `X-Forwarded-For` é ignorado no limite de tentativas de login. |
| `PHONE` | Telefone com DDD. Se preenchido, **tem prioridade** sobre o painel e o botão Ligar usa este número. |
| `WHATSAPP` | Celular com DDD (o `55` é opcional). Se preenchido, tem prioridade sobre o painel. |
| `DB_PATH` | Caminho do SQLite. Padrão: `data/freelife.sqlite`. |
| `NODE_ENV` | `production` em produção. |

Telefone e WhatsApp também podem ser salvos em **Painel → Telefone**, desde que a variável correspondente esteja vazia.

Não cadastre número inventado. Vazio é o certo enquanto a academia não informar o contato: o site esconde Ligar e WhatsApp e deixa o formulário.

## O que é dado real e o que é exemplo

A fonte deste site é a ficha do Google da academia. Só isto está tratado como fato:

- Nome: Academia Free Life
- Nota 4,8 em 276 avaliações no Google (número da ficha, não uma consulta ao vivo e sem depoimentos)
- Endereço: Av. Dr. Ernani Pires Domingues, 5070 - Res. Macedo Teles I, São José do Rio Preto - SP, 15040-548
- Descrição da ficha: academia na Região Administrativa de São José do Rio Preto

Preço, grade, telefone e WhatsApp **não** estavam nessa ficha. O banco nasce com planos e aulas marcados como exemplo (nome com “(exemplo)”, valor “A definir”, aviso âmbar no site e no painel). Isso existe para o site abrir já editável. Não publique esses horários como se fossem a grade oficial.

Não há depoimentos de alunos.

## Painel

1. Acesse `/admin`.
2. Entre com `ADMIN_PASSWORD` (padrão `freelife-admin` se você não mudou).
3. **Mensagens**: o que o formulário de contato gravou.
4. **Planos**: criar, editar e excluir. Desmarque “Marcar como exemplo” quando o texto for o da academia.
5. **Modalidades**: o mesmo para aulas e horários. A grade da semana é montada pelos dias marcados.
6. **Telefone**: números reais. Em branco, o botão some.

A sessão fica na memória do processo. Reiniciar o servidor pede a senha de novo. Várias instâncias ao mesmo tempo não compartilham o login. O cookie é `httpOnly` e `SameSite=Lax`. No login bem-sucedido a sessão é recriada (não reaproveita o identificador anterior).

Há um limite de 8 senhas erradas por IP, com espera de cerca de 10 minutos. O formulário público também tem um limite por IP. Todos os formulários exigem o token CSRF da página.

Se `NODE_ENV=production` e `ADMIN_PASSWORD` estiver vazio, o processo **não** abre com `freelife-admin`. Ele gera uma senha aleatória, grita no log e mostra um aviso no painel. Essa senha muda quando o processo reinicia. Defina `ADMIN_PASSWORD` e `SESSION_SECRET` de verdade.

## Páginas

- `/` início
- `/planos`
- `/modalidades`
- `/contato` (mapa, Como chegar e formulário)
- `/admin`

O formulário exige nome, telefone com DDD, motivo e mensagem (mínimo de 10 caracteres). E-mail, plano e modalidade são opcionais. A validação é no servidor. Mensagem aceita aparece em `/admin/mensagens`.

## Testes

```bash
npm test
```

A suíte usa `node:test` e `supertest`. Ela sobe o app num SQLite temporário (não mexe em `data/freelife.sqlite`) e cobre páginas, validação e gravação do formulário, login do painel, CSRF, cabeçalhos e o CRUD de planos e modalidades.

## Publicar

Um VPS com Node 18+ basta. O arquivo SQLite precisa de disco persistente.

```bash
npm install
export NODE_ENV=production
export PORT=47231
export ADMIN_PASSWORD="uma-senha-longa"
export SESSION_SECRET="outra-chave-longa-e-aleatoria"
export COOKIE_SECURE=1
export TRUST_PROXY=1
export PHONE=""
export WHATSAPP=""
npm start
```

`TRUST_PROXY=1` só quando o Node está atrás do proxy. Se o processo estiver exposto direto na internet, deixe vazio: um cliente não deve conseguir forjar `X-Forwarded-For` e furar o limite de senha.

Exemplo de serviço systemd (`/etc/systemd/system/freelife.service`):

```ini
[Service]
WorkingDirectory=/var/www/freelife
ExecStart=/usr/bin/node server.js
Environment=NODE_ENV=production
Environment=PORT=47231
Environment=ADMIN_PASSWORD=troque
Environment=SESSION_SECRET=troque-por-uma-chave-longa
Environment=COOKIE_SECURE=1
Environment=TRUST_PROXY=1
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

Na frente, um proxy com HTTPS. Exemplo de Caddy:

```caddy
academia.example.com {
  reverse_proxy 127.0.0.1:47231
}
```

O cookie seguro depende de `COOKIE_SECURE=1` e do proxy enviar `X-Forwarded-Proto: https` (o Caddy faz isso). Sem HTTPS, deixe `COOKIE_SECURE` vazio. Com o Caddy na frente, use também `TRUST_PROXY=1`.

Backup: copie `data/freelife.sqlite` com o processo parado, ou use o comando `.backup` do `sqlite3`. Apagar esse arquivo e subir de novo **recria os exemplos e apaga mensagens, planos e números salvos**.

Antes de divulgar:

- trocar `ADMIN_PASSWORD` e `SESSION_SECRET`
- cadastrar telefone e WhatsApp reais, ou deixar em branco
- editar ou apagar planos e modalidades de exemplo
- conferir o endereço, que já veio da ficha do Google

## Licenças das fontes

Outfit e Barlow Condensed estão em `public/fonts/`, sob a SIL Open Font License. Os textos estão em `OFL-Outfit.txt` e `OFL-BarlowCondensed.txt`.
