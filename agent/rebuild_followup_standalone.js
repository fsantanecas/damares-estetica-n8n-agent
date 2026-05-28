// Rebuilds Followup_Manual_Standalone.json without the loop/wait node
// Architecture: Trigger -> INSERT -> SELECT -> Code (per item) -> HTTP -> UPDATE
// No splitInBatches, no wait node — simpler and more reliable for 6 clients

const fs = require('fs');
const path = require('path');

const pg = { id: 'LQ6Uqet7mGbpcLOH', name: 'postgres_cloudfy' };

const jsCode = [
  'const cliente = $input.item.json;',
  "const nome = cliente.nome ? cliente.nome.split(' ')[0] : 'querida';",
  "const toPhone = '+' + String(cliente.telefone).replace(/\\D/g, '');",
  'const message =',
  "  'Olá ' + nome + '! 🌿\\n\\n' +",
  "  'Sou a Damys, assistente da Damares Estética. Faz um tempinho que não nos vemos! ✨\\n\\n' +",
  "  'A Damares está com agenda aberta e adoraria te receber para uma sessão de massagem ou tratamento estético a domicílio 💆🏻\\u200d♀️🏡\\n\\n' +",
  "  'Quer agendar? É só me chamar por aqui 😊🌿';",
  "const body = JSON.stringify({ from: '+5511994265257', to: toPhone, type: 'text', text: { body: message } });",
  'return { json: { toPhone, message, body, id: cliente.id } };'
].join('\n');

const wf = {
  name: 'DamaresEstetica — Follow-up Manual Clientes Anteriores',
  nodes: [
    {
      id: 'followup-manual-trigger',
      name: 'Follow-up Manual — EXECUTAR UMA VEZ',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [200, 300],
      parameters: {}
    },
    {
      id: 'followup-manual-insert',
      name: 'Insere Clientes no CRM',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [440, 300],
      credentials: { postgres: pg },
      parameters: {
        operation: 'executeQuery',
        query: [
          'INSERT INTO dm_crm (nome, telefone, bairro, ultimo_atendimento, atualizado_em, status, avaliacao_pendente, avaliacao_confirmada, lembretes_avaliacao, total_atendimentos, criado_em)',
          'VALUES',
          "  ('Mirella Gualandro', '5511983830603', '', NOW() - INTERVAL '60 days', NOW(), 'ativo', false, false, 0, 0, NOW()),",
          "  ('Daniele',            '5511987191814', '', NOW() - INTERVAL '60 days', NOW(), 'ativo', false, false, 0, 0, NOW()),",
          "  ('Danielle Hersz Admoni','5511996334163','', NOW() - INTERVAL '60 days', NOW(), 'ativo', false, false, 0, 0, NOW()),",
          "  ('Dra Danielle',       '5511983077945', '', NOW() - INTERVAL '60 days', NOW(), 'ativo', false, false, 0, 0, NOW()),",
          "  ('Marília',            '5512991276226', '', NOW() - INTERVAL '60 days', NOW(), 'ativo', false, false, 0, 0, NOW()),",
          "  ('Maria Teresa',       '5511991710563', '', NOW() - INTERVAL '60 days', NOW(), 'ativo', false, false, 0, 0, NOW())",
          'ON CONFLICT (telefone) DO UPDATE SET',
          '  nome = EXCLUDED.nome,',
          '  atualizado_em = NOW()',
          'RETURNING id, nome, telefone;'
        ].join('\n'),
        options: {}
      }
    },
    {
      id: 'followup-manual-select',
      name: 'Busca Clientes Follow-up Manual',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [680, 300],
      credentials: { postgres: pg },
      parameters: {
        operation: 'executeQuery',
        query: [
          'SELECT id, nome, telefone',
          'FROM dm_crm',
          "WHERE telefone IN ('5511983830603','5511987191814','5511996334163','5511983077945','5512991276226','5511991710563')",
          'ORDER BY nome;'
        ].join('\n'),
        options: {}
      }
    },
    {
      id: 'followup-manual-msg',
      name: 'Monta Mensagem Follow-up Manual',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [920, 300],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode
      }
    },
    {
      id: 'followup-manual-http',
      name: 'Envia Follow-up Manual HTTP',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1160, 300],
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
    {
      id: 'followup-manual-update',
      name: 'Atualiza Follow-up Manual',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [1400, 300],
      credentials: { postgres: pg },
      parameters: {
        operation: 'executeQuery',
        query: "=UPDATE dm_crm SET\n  proximo_followup = NOW() + INTERVAL '30 days',\n  atualizado_em = NOW()\nWHERE id = {{ $('Monta Mensagem Follow-up Manual').item.json.id }};",
        options: {}
      }
    }
  ],
  connections: {
    'Follow-up Manual — EXECUTAR UMA VEZ': {
      main: [[{ node: 'Insere Clientes no CRM', type: 'main', index: 0 }]]
    },
    'Insere Clientes no CRM': {
      main: [[{ node: 'Busca Clientes Follow-up Manual', type: 'main', index: 0 }]]
    },
    'Busca Clientes Follow-up Manual': {
      main: [[{ node: 'Monta Mensagem Follow-up Manual', type: 'main', index: 0 }]]
    },
    'Monta Mensagem Follow-up Manual': {
      main: [[{ node: 'Envia Follow-up Manual HTTP', type: 'main', index: 0 }]]
    },
    'Envia Follow-up Manual HTTP': {
      main: [[{ node: 'Atualiza Follow-up Manual', type: 'main', index: 0 }]]
    }
  },
  active: false,
  settings: { executionOrder: 'v1' },
  meta: { instanceId: 'standalone-followup-manual' }
};

const FILE = path.join(__dirname, 'Followup_Manual_Standalone.json');
fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
console.log('✓ Rewrote Followup_Manual_Standalone.json (no loop, no wait, runOnceForEachItem)');
console.log('  Nodes: Trigger → INSERT → SELECT → Code (per item) → HTTP → UPDATE');
