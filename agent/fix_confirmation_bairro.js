const fs = require('fs');

const FILE = 'Agente_DamaresEstetica_HTTPRequest.json';
const wf = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let fixes = 0;

function replaceIn(node, oldStr, newStr, label) {
  if (!node.parameters.jsCode.includes(oldStr)) {
    console.error('ERROR: anchor not found for:', label);
    console.error('Looking for:', JSON.stringify(oldStr.substring(0, 120)));
    process.exit(1);
  }
  node.parameters.jsCode = node.parameters.jsCode.replace(oldStr, newStr);
  console.log('✓', label);
  fixes++;
}

const n = wf.nodes.find(x => x.name === 'Inicializa Conversa');

// ─── Fix 1: Section 7.1 — remove \\ from duration templates ─────────────
// These are different from the section 5 ones (different surrounding context).
// The section 5 ones were already fixed; section 7.1 still has \\\\
replaceIn(n,
  'Se escolher Massagem Relaxante, perguntar em 1 bolha:\n"Qual duração você prefere?\\\\1️⃣ 1 hora\\\\2️⃣ 1 hora e meia"',
  'Se escolher Massagem Relaxante, perguntar em 1 bolha:\n"Qual duração você prefere?\\n1️⃣ 1 hora\\n2️⃣ 1 hora e meia"',
  'Fix 1a: Section 7.1 Massagem duration template — remove \\\\ separators'
);

replaceIn(n,
  'Se escolher Drenagem Linfática, perguntar em 1 bolha:\n"Qual modalidade você prefere?\\\\1️⃣ Corporal (1h)\\\\2️⃣ Corporal + Facial (1h20)\\\\3️⃣ Corporal para Gestantes (1h)\\\\4️⃣ Corporal para Gestantes (1h20)"',
  'Se escolher Drenagem Linfática, perguntar em 1 bolha:\n"Qual modalidade você prefere?\\n1️⃣ Corporal (1h)\\n2️⃣ Corporal + Facial (1h20)\\n3️⃣ Corporal para Gestantes (1h)\\n4️⃣ Corporal para Gestantes (1h20)"',
  'Fix 1b: Section 7.1 Drenagem modality template — remove \\\\ separators'
);

// ─── Fix 2: Remove duplicate REGRA OBRIGATÓRIA from section 5 ────────────
// These rules duplicate the flow of section 7.1 and cause the agent to send
// the confirmation message twice (once from each rule trigger).
// The section 5 REGRA OBRIGATÓRIA blocks are ONLY relevant for pricing inquiries
// (when client asks about prices WITHOUT booking). Section 7.1 already handles
// the booking flow comprehensively.
replaceIn(n,
  '⚠️ REGRA OBRIGATÓRIA — Drenagem Linfática:\nSe o cliente escolher Drenagem Linfática, SEMPRE perguntar (em 1 bolha):\n"Você prefere:\\\\1️⃣ Corporal (1h)\\\\2️⃣ Corporal + Facial (1h20)\\\\3️⃣ Corporal para Gestantes (1h)\\\\4️⃣ Corporal para Gestantes (1h20)"\n\n⚠️ REGRA OBRIGATÓRIA — Massagem Relaxante:\nSe o cliente escolher Massagem Relaxante, SEMPRE perguntar (em 1 bolha):\n"Qual duração você prefere?\\n1️⃣ 1 hora\\n2️⃣ 1 hora e meia"',
  '⚠️ REGRA OBRIGATÓRIA — Para informar valores, confirmar o tipo de sessão:\n- Drenagem Linfática: confirmar modalidade (Corporal 1h / Corporal+Facial 1h20 / Gestantes) para informar o valor correto.\n- Massagem Relaxante: confirmar duração (1h ou 1h30) para informar o valor correto.\nEssas perguntas são feitas no fluxo de agendamento (seção 7.1) e NÃO devem ser repetidas fora desse fluxo.',
  'Fix 2: Replace duplicate REGRA OBRIGATÓRIA in section 5 with non-flow-triggering note'
);

// ─── Fix 3: Add "one time only" rule for confirmation message in 7.1 ─────
replaceIn(n,
  'Somente prossiga após o cliente confirmar.\n⚠️ QUANDO o cliente responder "sim", "ok", "pode", "correto", "isso", "certo", "sim pode", "pode ser" ou qualquer afirmativo após a mensagem "Perfeito! Então é Massagem Relaxante [1h ou 1h30], certo? 😊": prosseguir IMEDIATAMENTE para o passo 7.2 — NUNCA repetir a pergunta de duração. NUNCA pedir para o cliente escolher novamente. A confirmação com "sim" encerra definitivamente esta etapa.',
  'Somente prossiga após o cliente confirmar.\n⚠️ Esta mensagem de confirmação deve ser enviada EXATAMENTE UMA VEZ — nunca repetir.\n⚠️ QUANDO o cliente responder "sim", "ok", "pode", "correto", "isso", "certo", "sim pode", "pode ser" ou qualquer afirmativo após a mensagem "Perfeito! Então é Massagem Relaxante [1h ou 1h30], certo? 😊": prosseguir IMEDIATAMENTE para o passo 7.2 — NUNCA repetir a pergunta de duração. NUNCA pedir para o cliente escolher novamente. A confirmação com "sim" encerra definitivamente esta etapa.',
  'Fix 3a: Add "send once" rule for Massagem confirmation'
);

replaceIn(n,
  'Somente prossiga após o cliente confirmar.\n⚠️ QUANDO o cliente responder "sim", "ok", "pode", "correto", "isso", "certo", ou qualquer afirmativo: prosseguir IMEDIATAMENTE para o passo 7.2 — NUNCA repetir a pergunta de modalidade. A confirmação com "sim" encerra definitivamente esta etapa.',
  'Somente prossiga após o cliente confirmar.\n⚠️ Esta mensagem de confirmação deve ser enviada EXATAMENTE UMA VEZ — nunca repetir.\n⚠️ QUANDO o cliente responder "sim", "ok", "pode", "correto", "isso", "certo", ou qualquer afirmativo: prosseguir IMEDIATAMENTE para o passo 7.2 — NUNCA repetir a pergunta de modalidade. A confirmação com "sim" encerra definitivamente esta etapa.',
  'Fix 3b: Add "send once" rule for Drenagem confirmation'
);

// ─── Fix 4: Require bairro before showing prices ──────────────────────────
// If the bairro is unknown, the agent defaults to Grupo B — wrong prices.
// Must ask for bairro BEFORE showing any value.
replaceIn(n,
  '📋 TABELA DE PREÇOS — USE ESTA TABELA PARA TODOS OS CÁLCULOS DE VALOR E SINAL:',
  '⚠️ OBRIGATÓRIO: Confirmar o bairro ou região do cliente ANTES de informar qualquer valor. Se o CONTEXTO_SISTEMA mostrar "Bairro: não informado" ou um nome que pareça rua (ex: começa com "Rua", "Av.", "Avenida", "Alameda") → perguntar: "Qual é o seu bairro ou região? Preciso disso para informar o valor correto 😊". Somente após ter o bairro confirmado, consultar a tabela abaixo.\n\n📋 TABELA DE PREÇOS — USE ESTA TABELA PARA TODOS OS CÁLCULOS DE VALOR E SINAL:',
  'Fix 4: Require bairro before showing prices'
);

// ─── Fix 5: Address field must include bairro ─────────────────────────────
replaceIn(n,
  '- address: endereço completo (rua, número, complemento, bairro, cidade)',
  '- address: endereço completo com bairro EXPLÍCITO — formato: "Rua Itália, 45, Jardim Europa, São Paulo". Se o bairro não constar no endereço informado pelo cliente, perguntar ANTES de criar o agendamento: "Para finalizar, pode confirmar seu bairro? Assim consigo garantir o valor correto 😊"',
  'Fix 5: Address field must explicitly include bairro'
);

// ─── Save ─────────────────────────────────────────────────────────────────
fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
console.log('\n✓ Saved ' + FILE + ' (' + fixes + ' fixes applied)');
