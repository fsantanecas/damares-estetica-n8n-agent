const fs = require('fs');

const FILE = 'Agente_DamaresEstetica_HTTPRequest.json';
const wf = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let fixes = 0;

function replace(node, oldStr, newStr, label) {
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

// ─── Fix 1: NUNCA DEVE — section 3 ───────────────────────────────────────
replace(n,
  '- Oferecer em Quinta-feira horários fora de 10:30–12:00 ou 14:00–15:30',
  '- Oferecer em Quinta-feira qualquer horário fora das 14:00 (único horário disponível às quintas)',
  'Fix 1: NUNCA DEVE — Thursday single slot'
);

// ─── Fix 2: Section 3 HORÁRIOS — QUINTA-FEIRA block ──────────────────────
replace(n,
  `  • Somente 10:30–12:00 ou 14:00–15:30
  • Nunca oferecer outros horários às quintas — inclusive 08:00, 09:00, 10:00, 13:00, 16:00, 17:00, 18:00, 19:00 são inválidos em quinta
  • ⚠️ MESMO QUANDO O CLIENTE PROPÕE UM HORÁRIO ÀS QUINTAS: se o horário proposto estiver fora desses intervalos (ex: "08:00", "09:00", "10:00", "13:00", "16:00", "19:00"), RECUSAR IMEDIATAMENTE antes de verificar disponibilidade. Nunca confirmar "tenho disponibilidade" para horário inválido em quinta-feira.
  • Resposta ao recusar horário inválido em quinta: "Nas quintas-feiras meus horários são restritos 🌿 Tenho disponibilidade somente entre 10:30–12:00 ou das 14:00–15:30. Algum desses horários funciona para você? 😊"`,
  `  • Somente 14:00 (único slot disponível às quintas — janela da manhã está bloqueada)
  • Nunca oferecer outros horários às quintas — 08:00, 09:00, 10:00, 10:30, 11:00, 12:00, 13:00, 15:00, 16:00, 17:00, 18:00, 19:00 são inválidos
  • ⚠️ MESMO QUANDO O CLIENTE PROPÕE UM HORÁRIO ÀS QUINTAS: se o horário proposto for diferente de 14:00, RECUSAR IMEDIATAMENTE antes de verificar disponibilidade. Nunca confirmar "tenho disponibilidade" para horário inválido em quinta-feira.
  • Resposta ao recusar horário inválido em quinta: "Nas quintas-feiras tenho disponibilidade somente às 14:00 🌿 Esse horário funciona para você? 😊"`,
  'Fix 2: Section 3 HORÁRIOS — Thursday single slot'
);

// ─── Fix 3: Section 7.3b PASSO 3 ─────────────────────────────────────────
replace(n,
  '- Se a data for uma quinta-feira: verificar IMEDIATAMENTE se o horário pretendido (proposto pelo cliente ou ainda não definido) está dentro de 10:30–12:00 ou 14:00–15:30.',
  '- Se a data for uma quinta-feira: verificar IMEDIATAMENTE se o horário pretendido é 14:00 (único slot válido). Se for qualquer outro horário, recusar antes de chamar verificar_disponibilidade.',
  'Fix 3: Section 7.3b PASSO 3 — Thursday single slot'
);

// ─── Fix 4: Section 7.4 — timeMin/timeMax quinta ─────────────────────────
replace(n,
  `- Quinta-feira → verificar SOMENTE com timeMin/timeMax dentro dos intervalos válidos:
  • Período manhã restrita: T10:30:00-03:00 até T12:00:00-03:00
  • Período tarde restrita: T14:00:00-03:00 até T15:30:00-03:00
  • NUNCA usar T08:00:00 ou T09:00:00 ou T10:00:00 como timeMin em quintas-feiras`,
  `- Quinta-feira → verificar SOMENTE com timeMin=T14:00:00-03:00 e timeMax=T15:30:00-03:00 (único slot válido)
  • NUNCA usar T08:00:00, T09:00:00, T10:00:00, T10:30:00, T11:00:00 ou T12:00:00 como timeMin em quintas-feiras`,
  'Fix 4: Section 7.4 — Thursday timeMin/timeMax single slot'
);

// ─── Fix 5: Section 14 RESTRIÇÕES ────────────────────────────────────────
replace(n,
  '- Nunca oferecer em Quinta-feira horários fora de 10:30–12:00 ou 14:00–15:30',
  '- Nunca oferecer em Quinta-feira horários fora das 14:00 (único slot disponível)',
  'Fix 5: Section 14 RESTRIÇÕES — Thursday single slot'
);

// ─── Fix 6: Section 7.3b — prevent verificar_disponibilidade on bad Thursday slot ─
replace(n,
  '⚠️ EM QUINTA-FEIRA: chamar verificar_disponibilidade SOMENTE com os intervalos válidos (T10:30–T12:00 ou T14:00–T15:30). NUNCA chamar com T08:00 ou T09:00 — isso retornaria slots inválidos que não devem ser mostrados ao cliente.',
  '⚠️ EM QUINTA-FEIRA: chamar verificar_disponibilidade SOMENTE com timeMin=T14:00:00-03:00. NUNCA chamar com T08:00, T09:00, T10:00 ou T10:30 — isso retornaria slots inválidos que não devem ser mostrados ao cliente.',
  'Fix 6: verificar_disponibilidade Thursday guard — single slot'
);

// ─── Fix 7: Add "Insere Leads — EXECUTAR UMA VEZ" manual trigger + postgres node ─
const newTrigger = {
  id: 'dm-leads-seed-trigger',
  name: 'Insere Leads — EXECUTAR UMA VEZ',
  type: 'n8n-nodes-base.manualTrigger',
  typeVersion: 1,
  position: [3200, 1820],
  parameters: {}
};

const newInsert = {
  id: 'dm-leads-seed-sql',
  name: 'Insere Leads Iniciais',
  type: 'n8n-nodes-base.postgres',
  typeVersion: 2.6,
  position: [3440, 1820],
  credentials: {
    postgres: {
      id: 'LQ6Uqet7mGbpcLOH',
      name: 'postgres_cloudfy'
    }
  },
  parameters: {
    operation: 'executeQuery',
    query: `INSERT INTO dm_leads (nome, telefone) VALUES
('Mirella Gualandro', '5511983830603'),
('Daniele', '5511987191814'),
('Danielle Hersz Admoni', '5511996334163'),
('Dra Danielle', '5511983077945'),
('Marília', '5512991276226'),
('Maria Teresa', '5511991710563')
ON CONFLICT (telefone) DO NOTHING;`,
    options: {}
  }
};

wf.nodes.push(newTrigger, newInsert);

// Connect trigger → postgres
if (!wf.connections['Insere Leads — EXECUTAR UMA VEZ']) {
  wf.connections['Insere Leads — EXECUTAR UMA VEZ'] = {
    main: [[{ node: 'Insere Leads Iniciais', type: 'main', index: 0 }]]
  };
}

console.log('✓ Fix 7: Added Insere Leads — EXECUTAR UMA VEZ + Insere Leads Iniciais nodes');
fixes++;

// ─── Save ─────────────────────────────────────────────────────────────────
fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
console.log(`\n✓ Saved ${FILE} (${fixes} fixes applied)`);
