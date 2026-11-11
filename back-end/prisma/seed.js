import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { loadConfig } from "../src/config.js";
import { createVault } from "../src/vault.js";

// Contas fictícias só para demonstração local. Rode de novo à vontade: é idempotente.
export const DEMO_PASSWORD = "demo12345";
const accounts = [
  { name: "Ana Demo", email: "ana@demo.dev" },
  { name: "Bruno Demo", email: "bruno@demo.dev" },
];
const conversation = [
  [0, "Oi, Bruno! Esse chat está rodando em tempo real."],
  [1, "Oi, Ana! Recebi na hora. As mensagens ficam cifradas no banco, né?"],
  [0, "Isso, AES-256-GCM. Abra o SQLite e veja: só texto cifrado 🔒"],
];

const { secret } = loadConfig();
const vault = createVault(secret);
const prisma = new PrismaClient();

try {
  const password = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = [];
  for (const account of accounts) {
    users.push(await prisma.user.upsert({
      where: { email: account.email },
      update: {},
      create: { ...account, password },
    }));
  }

  const [a, b] = users;
  const existing = await prisma.message.count({
    where: { OR: [{ senderId: a.id, receiverId: b.id }, { senderId: b.id, receiverId: a.id }] },
  });
  if (!existing) {
    // Histórico antigo (3 dias, ~70 mensagens) para demonstrar a paginação ao rolar para cima.
    const phrases = [
      "Bom dia! Conseguiu ver o PR de ontem?", "Vi sim, deixei dois comentários.", "Perfeito, ajusto agora.",
      "O deploy de hoje passou sem problemas.", "Ótimo! Os testes de integração ajudaram.", "Alguém revisou o schema do banco?",
      "Revisei, só faltou um índice.", "Adicionei, pode olhar de novo.", "Aprovado ✅", "Vamos fechar a sprint amanhã?",
      "Fechado. Quem apresenta a demo?", "Eu apresento, já deixei o roteiro pronto.", "Ficou ótimo o tema escuro, aliás.",
      "Obrigada! Testei no celular também.", "E a rolagem do histórico, ficou fluida?", "Bem fluida, carrega por páginas.",
      "Sem repetir mensagem quando a internet cai?", "Isso, o reenvio usa um identificador único.", "Boa, evita duplicar.",
      "Já rodou o linter no front?", "Rodei, zero avisos.", "E o audit de dependências?", "Limpo nas de produção.",
      "Quando sobe a versão nova?", "Hoje à tarde, depois do almoço.", "Posso revisar antes?", "Claro, te mando o link do PR.",
      "Recebi. Dei uma olhada rápida.", "Alguma observação?", "Só um nome de variável, o resto está claro.",
      "Troco agora mesmo.", "Já subi a correção.", "Perfeito, aprovado.", "Falando em segurança, revisou o rate limit?",
      "Revisei: 20 tentativas por minuto no login.", "Está bom para uma demo.", "Concordo. Em produção usaria Redis.",
      "Por causa das várias instâncias, certo?", "Exato, o contador precisa ser compartilhado.", "Faz sentido.",
      "Anotei isso na documentação.", "Ótimo, ajuda quem for avaliar o projeto.", "Falta alguma tela para o print?",
      "Talvez a do celular com a lista de contatos.", "Tiro hoje à noite.", "Combinado!", "Conseguiu rodar o Docker aí?",
      "Rodou de primeira com o compose.", "Que bom! Era a ideia.", "As portas não conflitaram com nada?",
      "Escolhi 3090 e 3091 para não bater com os outros projetos.", "Boa, cuidadoso.", "Vou subir o seed também.",
      "Já crio as duas contas de demonstração.", "Assim quem abrir vê conversa pronta.", "Exatamente isso.",
      "O recibo de leitura já está funcionando?", "Está sim, o visto fica verde quando o outro abre.",
      "Muito bom para a demo ao vivo.", "Vou testar com duas janelas lado a lado.", "Manda um print depois!",
      "Mando. Também vou gravar um vídeo curto.", "Ótimo, isso vende bem o projeto.", "Concordo totalmente.",
      "Fechamos por hoje?", "Fechamos. Bom descanso!", "Até amanhã!", "Até! 👋",
    ];
    const total = phrases.length;
    const start = Date.now() - 3 * 24 * 3600_000;
    for (let i = 0; i < total; i++) {
      const [sender, receiver] = i % 2 === 0 ? [a, b] : [b, a];
      await prisma.message.create({ data: {
        senderId: sender.id, receiverId: receiver.id, ...vault.encode(`${phrases[i % phrases.length]}`),
        timestamp: new Date(start + i * (3 * 24 * 3600_000 - 3600_000) / total), readAt: new Date(start + i * 1000 + 60_000),
      } });
    }
    for (const [from, text] of conversation) {
      const [sender, receiver] = from === 0 ? [a, b] : [b, a];
      await prisma.message.create({ data: { senderId: sender.id, receiverId: receiver.id, ...vault.encode(text) } });
    }
  }

  console.log("Seed pronto. Contas de demonstração (senha para ambas: %s):", DEMO_PASSWORD);
  for (const account of accounts) console.log(`  ${account.email}`);
} finally {
  await prisma.$disconnect();
}
