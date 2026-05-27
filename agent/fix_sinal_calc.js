const fs = require('fs');

const FILE = 'Agente_DamaresEstetica_HTTPRequest.json';
const wf = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let fixes = 0;

function replace(node, oldStr, newStr, label) {
  if (!node.parameters.jsCode.includes(oldStr)) {
    console.error('ERROR: anchor not found for:', label);
    console.error('Looking for:', JSON.stringify(oldStr.substring(0, 100)));
    process.exit(1);
  }
  node.parameters.jsCode = node.parameters.jsCode.replace(oldStr, newStr);
  console.log('✓', label);
  fixes++;
}

// ─── Fix 1: Workflow node — Prepara Dados do Evento ───────────────────────
const prepNode = wf.nodes.find(x => x.name === 'Prepara Dados do Evento');

// 1a: getGrupo — also check notes field for bairro
replace(prepNode,
  `function getGrupo(addr) {
  if (!addr) return 'B';
  const a = (addr).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
  if (/mooca|tatuape|analia/.test(a)) return 'A';
  if (/itaim|jardim europa|jardins|vila nova conceicao|higienopolis/.test(a)) return 'C';
  return 'B';
}`,
  `function getGrupo(addr, notes) {
  const combined = ((addr || '') + ' ' + (notes || '')).toLowerCase()
    .normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
  if (/mooca|tatuape|analia/.test(combined)) return 'A';
  if (/itaim|jardim europa|jardins|vila nova conceicao|higienopolis/.test(combined)) return 'C';
  return 'B';
}`,
  'Fix 1a: getGrupo also checks notes field'
);

// 1b: getSinal — more robust isPlano detection (avulsa/avulso keyword = NOT plano)
replace(prepNode,
  `  const isPlano = texto.includes('plano') || texto.includes('5 sess') || texto.includes('pacote') || texto.includes(' 5x') || texto.includes('5 ses');`,
  `  const hasAvulso = texto.includes('avulsa') || texto.includes('avulso');
  const isPlano = !hasAvulso && (texto.includes('plano') || texto.includes('5 sess') || texto.includes('pacote') || texto.includes(' 5x') || texto.includes('5 ses'));`,
  'Fix 1b: isPlano is false when service says avulsa/avulso even if plano also appears'
);

// 1c: pass d.notes to getGrupo
replace(prepNode,
  `const grupo = getGrupo(d.address);`,
  `const grupo = getGrupo(d.address, d.notes);`,
  'Fix 1c: pass notes to getGrupo'
);

// ─── Fix 2: System prompt — strengthen service field rules ────────────────
const initNode = wf.nodes.find(x => x.name === 'Inicializa Conversa');

// 2a: Strengthen service field instructions in 7.6
replace(initNode,
  `- service: nome EXATO do procedimento INCLUINDO o tipo de sessão escolhido — formato: "[Procedimento (duração)] — [tipo]"
  Exemplos:
  • "Drenagem Linfática Corporal + Facial (1h20) — plano 5 sessões"
  • "Massagem Relaxante — sessão avulsa"
  • "Pós-operatório — plano 5 sessões"
  ⚠️ OBRIGATÓRIO: inclua sempre "plano 5 sessões" OU "sessão avulsa" — o sistema usa esse texto para calcular o sinal correto`,
  `- service: nome EXATO do procedimento INCLUINDO a duração E o tipo de sessão — formato: "[Procedimento] [duração] — [tipo]"
  Exemplos CORRETOS:
  • "Massagem Relaxante 1h30 — plano 5 sessões"
  • "Massagem Relaxante 1h — sessão avulsa"
  • "Drenagem Linfática Corporal + Facial (1h20) — plano 5 sessões"
  • "Pós-operatório — plano 5 sessões"
  ⚠️ OBRIGATÓRIO: inclua sempre "plano 5 sessões" OU "sessão avulsa" — o sistema usa esse texto para calcular o sinal correto
  ⚠️ OBRIGATÓRIO: inclua a DURAÇÃO EXATA no campo service (ex: "1h", "1h30", "1h20") — o sistema usa isso para calcular a duração do evento no calendário
  ⚠️ NUNCA escrever "sessão avulsa" quando o cliente escolheu o plano. NUNCA omitir "plano 5 sessões" quando o cliente escolheu o plano.`,
  'Fix 2a: Strengthen service field format rules'
);

// 2b: Add rule to carry duration consistently from 7.1 through 7.6
replace(initNode,
  `⚠️ O campo Procedimento DEVE ser idêntico ao que foi escolhido e confirmado no passo 7.1.
⚠️ NUNCA trocar o serviço neste resumo — se foi Massagem Relaxante, confirmar Massagem Relaxante (nunca Drenagem).`,
  `⚠️ O campo Procedimento DEVE ser idêntico ao que foi escolhido e confirmado no passo 7.1.
⚠️ NUNCA trocar o serviço neste resumo — se foi Massagem Relaxante, confirmar Massagem Relaxante (nunca Drenagem).
⚠️ NUNCA alterar a duração após confirmação — se o cliente confirmou "1h30", usar "1h30" no resumo e no campo service. NUNCA mudar para "1h" depois.
⚠️ NUNCA alterar o tipo (plano/avulso) após confirmação — se o cliente escolheu "plano", o campo service DEVE conter "plano 5 sessões".`,
  'Fix 2b: Add rule to maintain duration and session type consistently'
);

// ─── Save ─────────────────────────────────────────────────────────────────
fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
console.log(`\n✓ Saved ${FILE} (${fixes} fixes applied)`);
