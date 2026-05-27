const fs = require('fs');

const FILE = 'Agente_DamaresEstetica_HTTPRequest.json';
const wf = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const n = wf.nodes.find(x => x.name === 'Inicializa Conversa');
let code = n.parameters.jsCode;
let fixes = 0;

function replace(oldStr, newStr, label) {
  if (!code.includes(oldStr)) {
    console.error('ERROR: anchor not found for:', label);
    console.error('Looking for:', JSON.stringify(oldStr.substring(0, 100)));
    process.exit(1);
  }
  code = code.replace(oldStr, newStr);
  console.log('✓', label);
  fixes++;
}

// ─── Fix 1: Regra de data atual — evitar confusão entre "hoje" e datas mencionadas ──
replace(
  `DATA DE HOJE: \${dataHoje}
TELEFONE WHATSAPP DO CLIENTE: \${telCliente}`,
  `DATA DE HOJE: \${dataHoje}
TELEFONE WHATSAPP DO CLIENTE: \${telCliente}

⚠️ REGRA CRÍTICA DE DATAS: A data de HOJE é SOMENTE \${dataHoje}. Se o cliente mencionar "28/05", "29/05" ou qualquer outra data diferente de \${dataHoje}, essa data é FUTURA ou PASSADA — NÃO é hoje. NUNCA diga "o dia XX/YY é hoje" para datas diferentes de \${dataHoje}.`,
  'Fix 1: Add critical date rule at top of system prompt'
);

// ─── Fix 2: Section 3 NUNCA DEVE — atualiza horários quinta ──────────────
replace(
  `- Oferecer em Quinta-feira horários fora de 10:00–11:30 ou 14:30–15:30`,
  `- Oferecer em Quinta-feira horários fora de 10:30–12:00 ou 14:00–15:30`,
  'Fix 2: Section 3 NUNCA DEVE — Thursday hours'
);

// ─── Fix 3: Section 3 HORÁRIOS — QUINTA-FEIRA block + rejection message ──
replace(
  `  • Somente 10:00–11:30 ou 14:30–15:30
  • Nunca oferecer outros horários às quintas
  • ⚠️ MESMO QUANDO O CLIENTE PROPÕE UM HORÁRIO ÀS QUINTAS: se o horário proposto estiver fora desses intervalos (ex: "08:00", "09:00", "16:00", "19:00"), RECUSAR IMEDIATAMENTE antes de verificar disponibilidade. Nunca confirmar "tenho disponibilidade" para horário inválido em quinta-feira.
  • Resposta ao recusar horário inválido em quinta: "Nas quintas-feiras meus horários são restritos 🌿 Tenho disponibilidade somente entre 10:00–11:30 ou 14:30–15:30. Algum desses horários funciona para você? 😊"`,
  `  • Somente 10:30–12:00 ou 14:00–15:30
  • Nunca oferecer outros horários às quintas — inclusive 08:00, 09:00, 10:00, 13:00, 16:00, 17:00, 18:00, 19:00 são inválidos em quinta
  • ⚠️ MESMO QUANDO O CLIENTE PROPÕE UM HORÁRIO ÀS QUINTAS: se o horário proposto estiver fora desses intervalos (ex: "08:00", "09:00", "10:00", "13:00", "16:00", "19:00"), RECUSAR IMEDIATAMENTE antes de verificar disponibilidade. Nunca confirmar "tenho disponibilidade" para horário inválido em quinta-feira.
  • Resposta ao recusar horário inválido em quinta: "Nas quintas-feiras meus horários são restritos 🌿 Tenho disponibilidade somente entre 10:30–12:00 ou das 14:00–15:30. Algum desses horários funciona para você? 😊"`,
  'Fix 3: Section 3 HORÁRIOS — Thursday block + rejection message'
);

// ─── Fix 4: Section 7.3b PASSO 3 — atualiza horários quinta ─────────────
replace(
  `- Se a data for uma quinta-feira: verificar IMEDIATAMENTE se o horário pretendido (proposto pelo cliente ou ainda não definido) está dentro de 10:00–11:30 ou 14:30–15:30.`,
  `- Se a data for uma quinta-feira: verificar IMEDIATAMENTE se o horário pretendido (proposto pelo cliente ou ainda não definido) está dentro de 10:30–12:00 ou 14:00–15:30.`,
  'Fix 4: Section 7.3b PASSO 3 — Thursday hours'
);

// ─── Fix 5: Section 7.4 Thursday verificar_disponibilidade timeMin/timeMax ─
replace(
  `- Quinta-feira → verificar somente com timeMin/timeMax dentro de 10:00–11:30 ou 14:30–15:30`,
  `- Quinta-feira → verificar SOMENTE com timeMin/timeMax dentro dos intervalos válidos:
  • Período manhã restrita: T10:30:00-03:00 até T12:00:00-03:00
  • Período tarde restrita: T14:00:00-03:00 até T15:30:00-03:00
  • NUNCA usar T08:00:00 ou T09:00:00 ou T10:00:00 como timeMin em quintas-feiras`,
  'Fix 5: Section 7.4 — Thursday timeMin/timeMax with correct values'
);

// ─── Fix 6: Section 14 RESTRIÇÕES — atualiza horários quinta ─────────────
replace(
  `- Nunca oferecer em Quinta-feira horários fora de 10:00–11:30 ou 14:30–15:30`,
  `- Nunca oferecer em Quinta-feira horários fora de 10:30–12:00 ou 14:00–15:30`,
  'Fix 6: Section 14 RESTRIÇÕES — Thursday hours'
);

// ─── Fix 7: Forçar verificação de quinta ANTES de chamar a ferramenta ────
// Add explicit rule that Thursday check must prevent wrong slots from being offered
replace(
  `⚠️ NUNCA chamar verificar_disponibilidade antes de concluir os 3 passos acima.
⚠️ NUNCA aceitar data de fim de semana ou feriado mesmo que o cliente insista.`,
  `⚠️ NUNCA chamar verificar_disponibilidade antes de concluir os 3 passos acima.
⚠️ NUNCA aceitar data de fim de semana ou feriado mesmo que o cliente insista.
⚠️ EM QUINTA-FEIRA: chamar verificar_disponibilidade SOMENTE com os intervalos válidos (T10:30–T12:00 ou T14:00–T15:30). NUNCA chamar com T08:00 ou T09:00 — isso retornaria slots inválidos que não devem ser mostrados ao cliente.`,
  'Fix 7: Prevent verificar_disponibilidade from returning invalid Thursday slots'
);

// ─── Save ─────────────────────────────────────────────────────────────────
n.parameters.jsCode = code;
fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
console.log(`\n✓ Saved ${FILE} (${fixes} fixes applied)`);
