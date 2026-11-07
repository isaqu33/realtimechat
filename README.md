# RealTimeChat

Edição de portfólio de um protótipo de chat. Mantém a stack do projeto original e o modelo de usuários e mensagens. A edição revisada reúne uma interface SvelteKit, uma API Express com Prisma e SQLite e comunicação via Socket.IO.

## Rodar localmente

Use Node.js 22 ou 24. Em `back-end`, copie `.env.example` para `.env` e configure uma chave exclusiva e aleatória para `JWT_SECRET` com pelo menos 32 caracteres. Depois rode:

```sh
npm ci
npx prisma generate
node -e "require('node:fs').closeSync(require('node:fs').openSync('prisma/dev.db', 'a'))"
npx prisma migrate deploy
node server.js
```

Em outro terminal, em `front-end`:

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Abra http://127.0.0.1:5173 e crie duas contas fictícias em sessões separadas. Se criar a segunda conta depois de abrir a primeira, use **Atualizar contatos**. Envie uma mensagem e confira o recebimento, a indicação de digitação e o histórico.

## Escopo

A API escuta apenas na interface local. O servidor valida o token no socket e deriva dele o remetente e a sala privada. Mensagens ficam no SQLite com criptografia no servidor, que também as decifra para entrega e histórico. O token fica em memória no navegador. Atualizar a página exige novo login.

A edição é voltada a testes locais. Uma implantação pública precisaria de controles de abuso, observabilidade e revisão de segurança. A demo deixa de fora os experimentos de áudio e IA e começa com banco vazio.
