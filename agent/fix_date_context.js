const fs = require('fs');

const FILE = 'Agente_DamaresEstetica_HTTPRequest.json';
const wf = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let fixes = 0;

function replaceIn(node, oldStr, newStr, label) {
  if (!node.parameters.jsCode.includes(oldStr)) {
    console.error('ERROR: anchor not found for:', label);
    console.error('Looking for:', JSON.stringify(oldStr.substring(0, 100)));
    process.exit(1);
  }
  node.parameters.jsCode = node.parameters.jsCode.replace(oldStr, newStr);
  console.log('✓', label);
  fixes++;
}

// ─── Fix 1: Prepara Contexto — label future dates as "Proximo agendamento" ─
const prepCtx = wf.nodes.find(x => x.name === 'Prepara Contexto');

replaceIn(prepCtx,
  "  const dt = crm.ultimo_atendimento\n" +
  "    ? new Date(crm.ultimo_atendimento).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' })\n" +
  "    : 'nenhum';\n" +
  "  const parts = [\n" +
  "    '[CONTEXTO_SISTEMA]',\n" +
  "    'Nome: ' + (crm.nome || ''),\n" +
  "    'Bairro: ' + (crm.bairro || 'não informado'),\n" +
  "    'Total de atendimentos: ' + (crm.total_atendimentos || 0),\n" +
  "    'Ultimo procedimento: ' + (crm.ultimo_procedimento || 'nenhum'),\n" +
  "    'Ultimo atendimento: ' + dt,",

  "  // Compare appointment date against BRT now to label correctly\n" +
  "  const _ctxNow = new Date();\n" +
  "  const _ctxBRT = new Date(_ctxNow.getTime() - 3 * 60 * 60 * 1000);\n" +
  "  const _ctxAppt = crm.ultimo_atendimento ? new Date(crm.ultimo_atendimento) : null;\n" +
  "  const dt = _ctxAppt\n" +
  "    ? _ctxAppt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' })\n" +
  "    : 'nenhum';\n" +
  "  // Future date = pending booking (Proximo agendamento), past = completed (Ultimo atendimento)\n" +
  "  const dtLabel = (_ctxAppt && _ctxAppt > _ctxBRT) ? 'Proximo agendamento' : 'Ultimo atendimento';\n" +
  "  const parts = [\n" +
  "    '[CONTEXTO_SISTEMA]',\n" +
  "    'Nome: ' + (crm.nome || ''),\n" +
  "    'Bairro: ' + (crm.bairro || 'não informado'),\n" +
  "    'Total de atendimentos: ' + (crm.total_atendimentos || 0),\n" +
  "    'Ultimo procedimento: ' + (crm.ultimo_procedimento || 'nenhum'),\n" +
  "    dtLabel + ': ' + dt,",

  'Fix 1: Label future dates as "Proximo agendamento" in CONTEXTO_SISTEMA'
);

// ─── Fix 2: System prompt — strengthen date rules ─────────────────────────
const initNode = wf.nodes.find(x => x.name === 'Inicializa Conversa');

// Fix 2a: Extend the critical date rule to prevent "ontem" hallucination
replaceIn(initNode,
  'REGRA CRÍTICA DE DATAS: A data de HOJE é SOMENTE ${dataHoje}. Se o cliente mencionar "28/05", "29/05" ou qualquer outra data diferente de ${dataHoje}, essa data é FUTURA ou PASSADA — NÃO é hoje. NUNCA diga "o dia XX/YY é hoje" para datas diferentes de ${dataHoje}.',
  'REGRA CRÍTICA DE DATAS: A data de HOJE é SOMENTE ${dataHoje}.\n- NUNCA diga "o dia XX/YY é hoje" para datas diferentes de ${dataHoje}.\n- NUNCA diga "XX/YY foi ontem" ou "XX/YY já passou" baseado em dados do CONTEXTO_SISTEMA — isso é proibido.\n- Para saber se uma data é passada ou futura: data < ${dataHoje} → passada; data > ${dataHoje} → futura; data = ${dataHoje} → hoje. SOMENTE esta comparação é válida.\n- NUNCA use "Ultimo atendimento" ou "Proximo agendamento" do CONTEXTO_SISTEMA para classificar datas como passadas ou futuras.',
  'Fix 2a: Extend critical date rule to block "ontem" hallucination'
);

// Fix 2b: Clarify context date fields meaning
replaceIn(initNode,
  '- Ultimo atendimento < 7 dias → cliente pode estar enviando comprovante ou fazendo follow-up. Responda naturalmente.',
  '- "Ultimo atendimento" DD/MM/YYYY = data de um atendimento JÁ REALIZADO (passado).\n- "Proximo agendamento" DD/MM/YYYY = data de agendamento PENDENTE ou CONFIRMADO (futuro). NUNCA afirme que essa data já passou.\n- Ultimo atendimento < 7 dias (passado) → cliente pode estar enviando comprovante ou fazendo follow-up. Responda naturalmente.',
  'Fix 2b: Clarify meaning of Ultimo atendimento vs Proximo agendamento'
);

// ─── Save ─────────────────────────────────────────────────────────────────
fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
console.log('\n✓ Saved ' + FILE + ' (' + fixes + ' fixes applied)');
