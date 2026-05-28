const fs = require('fs');

const FILE = 'Agente_DamaresEstetica_HTTPRequest.json';
const wf = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let fixes = 0;

// ─── Fix 1: Update WhatsApp link in system prompt ─────────────────────────
const initNode = wf.nodes.find(x => x.name === 'Inicializa Conversa');
if (!initNode.parameters.jsCode.includes('https://shre.ink/WhatsappDamares')) {
  console.error('ERROR: WhatsApp link not found');
  process.exit(1);
}
initNode.parameters.jsCode = initNode.parameters.jsCode.replace(
  'https://shre.ink/WhatsappDamares',
  'https://bit.ly/4tXlbne'
);
console.log('✓ Fix 1: WhatsApp link updated → https://bit.ly/4tXlbne');
fixes++;

// ─── Fix 2: Add "Follow-up Manual — EXECUTAR UMA VEZ" flow ───────────────
// These are 6 past clients (NOT leads). They go into dm_crm directly.
// Flow: ManualTrigger → INSERT into dm_crm → query only these 6 → Loop → Send message → Update followup
// Position: below the regular Follow-up flow (y=1560)

const CLIENTES = [
  { nome: 'Mirella Gualandro', telefone: '5511983830603' },
  { nome: 'Daniele',            telefone: '5511987191814' },
  { nome: 'Danielle Hersz Admoni', telefone: '5511996334163' },
  { nome: 'Dra Danielle',       telefone: '5511983077945' },
  { nome: 'Marília',            telefone: '5512991276226' },
  { nome: 'Maria Teresa',       telefone: '5511991710563' },
];

// Build INSERT values
const insertValues = CLIENTES.map(c =>
  `('${c.nome}', '${c.telefone}', NOW() - INTERVAL '60 days', NOW())`
).join(',\n  ');

// Phones for the SELECT
const phones = CLIENTES.map(c => `'${c.telefone}'`).join(', ');

const pg = { id: 'LQ6Uqet7mGbpcLOH', name: 'postgres_cloudfy' };

const newNodes = [
  // Sticky note
  {
    id: 'sticky-followup-manual',
    name: 'Doc Follow-up Manual',
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position: [6500, 1520],
    parameters: {
      content: '## 📲 Follow-up Manual — Clientes Anteriores\n\n**Executar UMA vez para enviar follow-up imediato às 6 clientes passadas.**\n\nEssas clientes entram no `dm_crm` (não no `dm_leads`).\nApós execução, o follow-up agendado (quintas 18h) cuidará dos reenvios futuros.',
      height: 160, width: 440, color: 4
    }
  },
  // 1. Manual trigger
  {
    id: 'followup-manual-trigger',
    name: 'Follow-up Manual — EXECUTAR UMA VEZ',
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1,
    position: [6500, 1700],
    parameters: {}
  },
  // 2. INSERT clientes into dm_crm
  {
    id: 'followup-manual-insert',
    name: 'Insere Clientes no CRM',
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.6,
    position: [6740, 1700],
    credentials: { postgres: pg },
    parameters: {
      operation: 'executeQuery',
      query: `INSERT INTO dm_crm (nome, telefone, ultimo_atendimento, atualizado_em)\nVALUES\n  ${insertValues}\nON CONFLICT (telefone) DO NOTHING;`,
      options: {}
    }
  },
  // 3. Query only these 6 from dm_crm
  {
    id: 'followup-manual-select',
    name: 'Busca Clientes Follow-up Manual',
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.6,
    position: [6980, 1700],
    credentials: { postgres: pg },
    parameters: {
      operation: 'executeQuery',
      query: `SELECT * FROM dm_crm WHERE telefone IN (${phones}) ORDER BY nome;`,
      options: {}
    }
  },
  // 4. Loop
  {
    id: 'followup-manual-loop',
    name: 'Loop Follow-up Manual',
    type: 'n8n-nodes-base.splitInBatches',
    typeVersion: 3,
    position: [7220, 1700],
    parameters: { batchSize: 1, options: {} }
  },
  // 5. Build message (same logic as Envia Mensagem Follow-up)
  {
    id: 'followup-manual-msg',
    name: 'Monta Mensagem Follow-up Manual',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [7460, 1700],
    parameters: {
      jsCode: `const item = $input.first().json;
const toPhone = '+' + item.telefone.replace(/\\D/g,'');
const message = 'Olá ' + (item.nome || 'querida') + ' 🌿\\n\\nFaz um tempinho que não nos vemos! Tenho saudades de cuidar do seu bem-estar ✨\\n\\nEstou com agenda aberta e adoraria te receber para uma nova sessão' +
  (item.ultimo_procedimento ? ' de *' + item.ultimo_procedimento + '*' : '') +
  '.\\n\\nQuer agendar? É só me chamar por aqui 😊🌿';
const body = JSON.stringify({ from: '+5511994265257', to: toPhone, type: 'text', text: { body: message } });
return [{ json: { toPhone, message, body, id: item.id } }];`
    }
  },
  // 6. HTTP send via YCloud
  {
    id: 'followup-manual-http',
    name: 'Envia Follow-up Manual HTTP',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [7700, 1700],
    parameters: {
      method: 'POST',
      url: 'https://api.ycloud.com/v2/whatsapp/messages/sendDirectly',
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: 'X-API-Key', value: 'ea53799239658212b3a8be3befbffff9' }]
      },
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'application/json',
      body: '={{ $json.body }}'
    }
  },
  // 7. Delay between sends
  {
    id: 'followup-manual-delay',
    name: 'Delay Follow-up Manual',
    type: 'n8n-nodes-base.wait',
    typeVersion: 1.1,
    position: [7940, 1700],
    parameters: { unit: 'seconds', amount: 3 }
  },
  // 8. Update proximo_followup
  {
    id: 'followup-manual-update',
    name: 'Atualiza Follow-up Manual',
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.6,
    position: [8180, 1700],
    credentials: { postgres: pg },
    parameters: {
      operation: 'executeQuery',
      query: `=UPDATE dm_crm SET\n  proximo_followup = NOW() + INTERVAL '30 days',\n  atualizado_em = NOW()\nWHERE id = {{ $('Monta Mensagem Follow-up Manual').first().json.id }};`,
      options: {}
    }
  }
];

newNodes.forEach(n => wf.nodes.push(n));

// Connections
const C = wf.connections;
C['Follow-up Manual — EXECUTAR UMA VEZ'] = { main: [[{ node: 'Insere Clientes no CRM', type: 'main', index: 0 }]] };
C['Insere Clientes no CRM']  = { main: [[{ node: 'Busca Clientes Follow-up Manual', type: 'main', index: 0 }]] };
C['Busca Clientes Follow-up Manual'] = { main: [[{ node: 'Loop Follow-up Manual', type: 'main', index: 0 }]] };
C['Loop Follow-up Manual']   = { main: [[{ node: 'Monta Mensagem Follow-up Manual', type: 'main', index: 0 }], []] };
C['Monta Mensagem Follow-up Manual'] = { main: [[{ node: 'Envia Follow-up Manual HTTP', type: 'main', index: 0 }]] };
C['Envia Follow-up Manual HTTP'] = { main: [[{ node: 'Delay Follow-up Manual', type: 'main', index: 0 }]] };
C['Delay Follow-up Manual']  = { main: [[{ node: 'Atualiza Follow-up Manual', type: 'main', index: 0 }]] };
C['Atualiza Follow-up Manual'] = { main: [[{ node: 'Loop Follow-up Manual', type: 'main', index: 0 }]] };

console.log('✓ Fix 2: Follow-up Manual flow added (8 nodes + connections)');
fixes++;

// ─── Save ─────────────────────────────────────────────────────────────────
fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
console.log(`\n✓ Saved ${FILE} (${fixes} fixes applied)`);
