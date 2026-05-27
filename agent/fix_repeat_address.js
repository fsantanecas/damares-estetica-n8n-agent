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

function replaceQuery(node, oldStr, newStr, label) {
  if (!node.parameters.query.includes(oldStr)) {
    console.error('ERROR: anchor not found for:', label);
    process.exit(1);
  }
  node.parameters.query = node.parameters.query.replace(oldStr, newStr);
  console.log('✓', label);
  fixes++;
}

const initNode = wf.nodes.find(x => x.name === 'Inicializa Conversa');
const prepCtx  = wf.nodes.find(x => x.name === 'Prepara Contexto');
const crmSave  = wf.nodes.find(x => x.name === 'CRM — Salva Agendamento');
const criaTabela = wf.nodes.find(x => x.name === 'Cria Tabela dm_crm');

// ─── Fix 1: Section 7.2 — add explicit "avulsa/plano = proceed to 7.3" rule ─
replaceIn(initNode,
  '⚠️ Consulte SOMENTE esta tabela acima — NÃO calcule de memória.\n\nExemplo (para cliente na Mooca — Grupo A):',
  '⚠️ Consulte SOMENTE esta tabela acima — NÃO calcule de memória.\n\n⚠️ REGRA DE ESTADO — Resposta ao "Qual opção você prefere?":\nApós apresentar a tabela de preços e perguntar "Qual opção você prefere?", a PRÓXIMA mensagem do cliente É a escolha do tipo de sessão. Qualquer resposta que contenha "avulsa", "avulso", "plano", "plano 5", "pacote", "1", "2" ou variações:\n→ Registrar a escolha (avulsa ou plano)\n→ Confirmar em 1 mensagem: "Ótimo! Então é [serviço] — [sessão avulsa / plano 5 sessões] 🌿" e prosseguir IMEDIATAMENTE para 7.3\n→ NUNCA re-exibir a tabela de preços\n→ NUNCA perguntar "Qual opção você prefere?" novamente\n\nExemplo (para cliente na Mooca — Grupo A):',
  'Fix 1: Add state rule for price choice in 7.2'
);

// ─── Fix 2: Section 7.3 — use CRM address if already known ──────────────
replaceIn(initNode,
  'Caso ainda não informado, solicitar:\n- Nome completo (obrigatório: nome E sobrenome — ex: "Maria Silva", nunca só "Maria")\n- Telefone com DDD: use o número de WhatsApp do cliente (número de origem da conversa). Confirme com ele antes de criar o agendamento: "Vou usar o seu WhatsApp como contato, está correto?" — somente substitua se o cliente informar outro número explicitamente\n- Bairro ou região\n- Endereço completo (rua, número, complemento, cidade)\n- Data desejada (DD/MM/YYYY ou DD/MM)\n- Período desejado (manhã, tarde, noite ou qualquer horário)',
  'Caso ainda não informado, solicitar:\n- Nome completo (obrigatório: nome E sobrenome — ex: "Maria Silva", nunca só "Maria")\n- Telefone com DDD: use o número de WhatsApp do cliente (número de origem da conversa). Confirme com ele antes de criar o agendamento: "Vou usar o seu WhatsApp como contato, está correto?" — somente substitua se o cliente informar outro número explicitamente\n- Bairro ou região\n- Endereço completo (rua, número, complemento, bairro, cidade) — ex: "Rua Itália, 45, apto 12, Jardim Europa, São Paulo"\n  ⚠️ Se o CONTEXTO_SISTEMA mostrar "Endereço: [valor]", usar esse endereço. Confirmar: "Utilizarei o endereço cadastrado: [endereço]. Está correto? 😊" — só substituir se o cliente fornecer um diferente explicitamente.\n  ⚠️ NUNCA pedir o endereço se já estiver no CONTEXTO_SISTEMA.\n- Data desejada (DD/MM/YYYY ou DD/MM)\n- Período desejado (manhã, tarde, noite ou qualquer horário)',
  'Fix 2: Use CRM address if available in 7.3'
);

// ─── Fix 3: Section 7.5 — show CRM address in summary ───────────────────
replaceIn(initNode,
  '• Endereço: [endereço completo]',
  '• Endereço: [endereço completo incluindo bairro — usar o endereço confirmado nesta conversa ou o do CONTEXTO_SISTEMA]',
  'Fix 3: Summary shows confirmed/CRM address'
);

// ─── Fix 4: Prepara Contexto — inject address into CONTEXTO_SISTEMA ──────
replaceIn(prepCtx,
  "    'Bairro: ' + (crm.bairro || 'não informado'),",
  "    'Bairro: ' + (crm.bairro || 'não informado'),\n    'Endereço: ' + (crm.address || 'não informado'),",
  'Fix 4: Inject address into CONTEXTO_SISTEMA'
);

// ─── Fix 5: Cria Tabela dm_crm — add address column ─────────────────────
replaceQuery(criaTabela,
  '  atualizado_em TIMESTAMP DEFAULT NOW()\n);',
  '  address VARCHAR(300),\n  atualizado_em TIMESTAMP DEFAULT NOW()\n);',
  'Fix 5: Add address column to dm_crm CREATE TABLE'
);

// ─── Fix 6: CRM — Salva Agendamento — save address ───────────────────────
// The INSERT uses Formata Confirmação Agendamento.address (which comes from Prepara Dados do Evento)
// We need to add address to INSERT and ON CONFLICT UPDATE
replaceQuery(crmSave,
  "INSERT INTO dm_crm (nome, bairro, telefone, ultimo_procedimento, ultimo_atendimento, avaliacao_pendente, avaliacao_confirmada, lembretes_avaliacao, total_atendimentos, proximo_followup, status, atualizado_em)",
  "INSERT INTO dm_crm (nome, bairro, telefone, ultimo_procedimento, ultimo_atendimento, avaliacao_pendente, avaliacao_confirmada, lembretes_avaliacao, total_atendimentos, proximo_followup, status, address, atualizado_em)",
  'Fix 6a: Add address to INSERT column list'
);

replaceQuery(crmSave,
  "  'ativo',\n  NOW()\n)\nON CONFLICT (telefone) DO UPDATE SET",
  "  'ativo',\n  '{{ ($('Prepara Dados do Evento').first().json.address || '').replace(/'/g, \"''\") }}',\n  NOW()\n)\nON CONFLICT (telefone) DO UPDATE SET",
  'Fix 6b: Add address value to INSERT'
);

replaceQuery(crmSave,
  '  total_atendimentos = dm_crm.total_atendimentos + 1,\n  atualizado_em = NOW();',
  '  total_atendimentos = dm_crm.total_atendimentos + 1,\n  address = CASE WHEN EXCLUDED.address <> \'\' THEN EXCLUDED.address ELSE dm_crm.address END,\n  atualizado_em = NOW();',
  'Fix 6c: Update address in ON CONFLICT (only if new address provided)'
);

// ─── Fix 7: Add ALTER TABLE node to migrate existing databases ────────────
// Find Cria Tabela dm_crm node position
const criaPos = criaTabela.position;

const alterNode = {
  id: 'dm-crm-add-address',
  name: 'Adiciona Coluna address — EXECUTAR UMA VEZ',
  type: 'n8n-nodes-base.postgres',
  typeVersion: 2.6,
  position: [criaPos[0], criaPos[1] + 220],
  credentials: {
    postgres: {
      id: 'LQ6Uqet7mGbpcLOH',
      name: 'postgres_cloudfy'
    }
  },
  parameters: {
    operation: 'executeQuery',
    query: `ALTER TABLE dm_crm ADD COLUMN IF NOT EXISTS address VARCHAR(300);`,
    options: {}
  }
};

const manualTriggerAlter = {
  id: 'dm-crm-alter-trigger',
  name: 'Migra dm_crm — EXECUTAR UMA VEZ',
  type: 'n8n-nodes-base.manualTrigger',
  typeVersion: 1,
  position: [criaPos[0] - 240, criaPos[1] + 220],
  parameters: {}
};

wf.nodes.push(manualTriggerAlter, alterNode);
wf.connections['Migra dm_crm — EXECUTAR UMA VEZ'] = {
  main: [[{ node: 'Adiciona Coluna address — EXECUTAR UMA VEZ', type: 'main', index: 0 }]]
};

console.log('✓ Fix 7: Added ALTER TABLE node for existing databases');
fixes++;

// ─── Save ─────────────────────────────────────────────────────────────────
fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
console.log(`\n✓ Saved ${FILE} (${fixes} fixes applied)`);
