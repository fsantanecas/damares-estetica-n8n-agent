/**
 * build_instagram_facebook_agente.js
 *
 * Gera Instagram_Facebook_Agente.json — fluxo n8n para atendimento
 * via Instagram DM e Facebook Messenger usando Meta Graph API.
 *
 * ─── Pré-requisitos ──────────────────────────────────────────────────────────
 *
 * 1. Meta Developer App com permissões:
 *    • instagram_manage_messages  (Instagram DMs)
 *    • pages_messaging            (Facebook Messenger)
 *    • Webhook subscriptions: messages, messaging_postbacks
 *
 * 2. No n8n, crie uma credencial "Header Auth":
 *    Name:   Meta Graph API Token
 *    Header: Authorization
 *    Value:  Bearer SEU_PAGE_ACCESS_TOKEN_AQUI
 *    Depois copie o ID gerado e atualize META_CRED_ID abaixo.
 *
 * 3. No Meta Developer Console, configure o Webhook:
 *    Callback URL: https://SEU_N8N/webhook/damares-meta
 *    Verify Token: damares_meta_verify_2026
 *    Subscription: messages
 *
 * 4. Após importar, conecte as credenciais postgres e Anthropic
 *    nos nós que exigirem (mesmas do fluxo WhatsApp).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');

// ─── Credenciais (atualizar após importar no n8n) ─────────────────────────────
const PG_CRED        = { id: 'LQ6Uqet7mGbpcLOH',              name: 'postgres_cloudfy' };
const ANTHROPIC_CRED = { id: 'INSERIR_CREDENTIAL_HEADER_AUTH', name: 'Anthropic Header Auth' };
const META_CRED      = { id: 'INSERIR_META_CRED_ID',           name: 'Meta Graph API Token' };

const META_VERIFY_TOKEN = 'damares_meta_verify_2026';
const WEBHOOK_PATH      = 'damares-meta';

// ─── Carrega workflow base para reutilizar nós de ferramentas ─────────────────
const base = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'Agente_DamaresEstetica_HTTPRequest.json'), 'utf8')
);
const B    = name => base.nodes.find(n => n.name === name);
const copyB = (name, overrides) => ({ ...JSON.parse(JSON.stringify(B(name))), ...overrides });

// ─── Estrutura do workflow ────────────────────────────────────────────────────
const nodes       = [];
const connections = {};

function add(n) { nodes.push(n); }

function conn(from, to, outputIndex = 0) {
  if (!connections[from]) connections[from] = { main: [] };
  while (connections[from].main.length <= outputIndex) connections[from].main.push([]);
  connections[from].main[outputIndex].push({ node: to, type: 'main', index: 0 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// A — VERIFICAÇÃO DE WEBHOOK (GET)
// ═══════════════════════════════════════════════════════════════════════════════
add({
  id: 'ig-get-wh', name: 'Verificação Meta (GET)',
  type: 'n8n-nodes-base.webhook', typeVersion: 2,
  position: [200, -300],
  parameters: { httpMethod: 'GET', path: WEBHOOK_PATH, responseMode: 'responseNode', options: {} }
});

add({
  id: 'ig-challenge', name: 'Extrai Challenge',
  type: 'n8n-nodes-base.code', typeVersion: 2,
  position: [440, -300],
  parameters: {
    jsCode: [
      "const q = $input.first().json.query || {};",
      "const challenge = q['hub.challenge'] || '';",
      "const token     = q['hub.verify_token'] || '';",
      "const mode      = q['hub.mode'] || '';",
      `const ok = mode === 'subscribe' && token === '${META_VERIFY_TOKEN}';`,
      "return [{ json: { challenge: ok ? String(challenge) : '0' } }];"
    ].join('\n')
  }
});

add({
  id: 'ig-respond-challenge', name: 'Responde Verificação Meta',
  type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1,
  position: [680, -300],
  parameters: { respondWith: 'text', responseBody: '={{ $json.challenge }}', options: { responseCode: 200 } }
});

conn('Verificação Meta (GET)', 'Extrai Challenge');
conn('Extrai Challenge',        'Responde Verificação Meta');

// ═══════════════════════════════════════════════════════════════════════════════
// B — RECEBE MENSAGEM (POST)
// ═══════════════════════════════════════════════════════════════════════════════
add({
  id: 'ig-post-wh', name: 'Recebe Mensagem Meta',
  type: 'n8n-nodes-base.webhook', typeVersion: 2,
  position: [200, 100],
  parameters: {
    httpMethod: 'POST', path: WEBHOOK_PATH,
    responseMode: 'onReceived', responseCode: 200,
    options: {}
  }
});

// Filtra: só prossegue se houver messaging com texto ou anexo
add({
  id: 'ig-filter', name: 'Filtra Evento Meta',
  type: 'n8n-nodes-base.if', typeVersion: 2.2,
  position: [440, 100],
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{
        id: 'chk-messaging',
        leftValue: "={{ ($json.body.entry?.[0]?.messaging?.length ?? 0) > 0 }}",
        rightValue: true,
        operator: { type: 'boolean', operation: 'equal' }
      }],
      combinator: 'and'
    },
    looseTypeValidation: true,
    options: {}
  }
});

// Extrai dados da mensagem Meta
add({
  id: 'ig-extract', name: 'Extrai Mensagem Meta',
  type: 'n8n-nodes-base.code', typeVersion: 2,
  position: [680, 100],
  parameters: {
    jsCode: [
      "const body      = $input.first().json.body;",
      "const object    = body.object || '';",
      "const entry     = body.entry?.[0] || {};",
      "const messaging = entry.messaging?.[0] || {};",
      "const senderId  = messaging.sender?.id || '';",
      "const recipId   = messaging.recipient?.id || '';",
      "const message   = messaging.message || {};",
      "const isEcho    = message.is_echo === true;",
      "if (!senderId || (!message.text && !message.attachments)) return [];",
      "const msgText   = message.text || '📎 Arquivo recebido';",
      "const channel   = object === 'instagram' ? 'instagram' : 'facebook';",
      "const platId    = channel + '_' + senderId;",
      "return [{ json: { channel, senderId, recipientId: recipId, platformId: platId,",
      "                  messageText: msgText, isEcho } }];"
    ].join('\n')
  }
});

// Coleta — interface idêntica ao nó Coleta do fluxo WhatsApp
add({
  id: 'ig-coleta', name: 'Coleta',
  type: 'n8n-nodes-base.set', typeVersion: 3.4,
  position: [920, 100],
  parameters: {
    assignments: {
      assignments: [
        { id: 'col-nome',    name: 'nome',        value: 'Cliente',                                    type: 'string'  },
        // Mantém sufixo @s.whatsapp.net para compatibilidade com nós downstream
        { id: 'col-tel',     name: 'telefone',    value: '={{ $json.platformId + "@s.whatsapp.net" }}', type: 'string'  },
        { id: 'col-msg',     name: 'mensagem',    value: '={{ $json.messageText }}',                    type: 'string'  },
        { id: 'col-tipo',    name: 'tipo',        value: 'conversation',                                type: 'string'  },
        { id: 'col-from',    name: 'fromMe',      value: '={{ $json.isEcho }}',                         type: 'boolean' },
        { id: 'col-channel', name: 'channel',     value: '={{ $json.channel }}',                        type: 'string'  },
        { id: 'col-sender',  name: 'senderId',    value: '={{ $json.senderId }}',                       type: 'string'  },
        { id: 'col-recip',   name: 'recipientId', value: '={{ $json.recipientId }}',                    type: 'string'  }
      ]
    },
    options: {}
  }
});

// Ignora Echo/Bot — mesma lógica do fluxo WhatsApp
add(copyB('Ignora Bot', { id: 'ig-ignora-bot', position: [1160, 100] }));

conn('Recebe Mensagem Meta', 'Filtra Evento Meta');
conn('Filtra Evento Meta',   'Extrai Mensagem Meta', 0);  // true
conn('Extrai Mensagem Meta', 'Coleta');
conn('Coleta',               'Ignora Bot');

// ═══════════════════════════════════════════════════════════════════════════════
// C — DEBOUNCE (aguarda 7s para agregar mensagens rápidas)
// ═══════════════════════════════════════════════════════════════════════════════
add(copyB('REGISTRA MENSAGEM',          { id: 'ig-registra',    position: [1400, 100] }));
add(copyB('PAUSA DE 7 SEGUNDOS',        { id: 'ig-pausa',       position: [1640, 100] }));
add(copyB('BUSCA MENSAGENS DO USUÁRIO', { id: 'ig-busca-msgs',  position: [1880, 100] }));
add(copyB('AGRUPA MENSAGENS',           { id: 'ig-agrupa',      position: [2120, 100] }));
add(copyB('DELETA MENSAGENS',           { id: 'ig-deleta',      position: [2360, 100] }));

// Ignora Bot saída false (índice 1) → não é echo → registra
conn('Ignora Bot',                'REGISTRA MENSAGEM', 1);
conn('REGISTRA MENSAGEM',         'PAUSA DE 7 SEGUNDOS');
conn('PAUSA DE 7 SEGUNDOS',       'BUSCA MENSAGENS DO USUÁRIO');
conn('BUSCA MENSAGENS DO USUÁRIO','AGRUPA MENSAGENS');
conn('AGRUPA MENSAGENS',          'DELETA MENSAGENS');

// ═══════════════════════════════════════════════════════════════════════════════
// D — CONTEXTO CRM + HISTÓRICO
// ═══════════════════════════════════════════════════════════════════════════════
add(copyB('Busca Contexto CRM',          { id: 'ig-busca-crm',  position: [2600, 100] }));

// Prepara Contexto adaptado: adiciona indicador de canal
add({
  id: 'ig-prepara-ctx', name: 'Prepara Contexto',
  type: 'n8n-nodes-base.code', typeVersion: 2,
  position: [2840, 100],
  parameters: {
    jsCode: [
      "const agrupado = $('AGRUPA MENSAGENS').first().json.concatenated_content || '';",
      "const tel = $('Coleta').first().json.telefone || '';",
      "const crm = $input.first().json;",
      "let ctx = '';",
      "if (crm && crm.telefone) {",
      "  const _ctxNow = new Date();",
      "  const _ctxBRT = new Date(_ctxNow.getTime() - 3 * 60 * 60 * 1000);",
      "  const _ctxAppt = crm.ultimo_atendimento ? new Date(crm.ultimo_atendimento) : null;",
      "  const dt = _ctxAppt ? _ctxAppt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' }) : 'nenhum';",
      "  const dtLabel = (_ctxAppt && _ctxAppt > _ctxBRT) ? 'Proximo agendamento' : 'Ultimo atendimento';",
      "  ctx = ['[CONTEXTO_SISTEMA]',",
      "    'Nome: ' + (crm.nome || ''),",
      "    'Bairro: ' + (crm.bairro || 'não informado'),",
      "    'Endereço: ' + (crm.address || 'não informado'),",
      "    'Total de atendimentos: ' + (crm.total_atendimentos || 0),",
      "    'Ultimo procedimento: ' + (crm.ultimo_procedimento || 'nenhum'),",
      "    dtLabel + ': ' + dt,",
      "    'Avaliacao confirmada: ' + (crm.avaliacao_confirmada ? 'SIM' : 'NAO'),",
      "    'Status: ' + (crm.status || 'ativo'),",
      "    '[/CONTEXTO_SISTEMA]', ''",
      "  ].join('\\n') + '\\n';",
      "}",
      "const channel = $('Coleta').first().json.channel || 'instagram';",
      "const canalLabel = channel === 'instagram' ? 'Instagram DM' : 'Facebook Messenger';",
      "const canalNote = '[Canal: ' + canalLabel + ' — se precisar criar agendamento e o cliente não informou telefone, solicite o número com DDD antes de chamar realizar_agendamento]\\n';",
      "return [{ json: { enriched_text: canalNote + ctx + agrupado, telefone: tel } }];"
    ].join('\n')
  }
});

add(copyB('Busca Histórico da Conversa', { id: 'ig-busca-hist', position: [3080, 100] }));

conn('DELETA MENSAGENS',           'Busca Contexto CRM');
conn('Busca Contexto CRM',         'Prepara Contexto');
conn('Prepara Contexto',           'Busca Histórico da Conversa');

// ═══════════════════════════════════════════════════════════════════════════════
// E — INICIALIZA CONVERSA (mesmo system prompt do WhatsApp)
// ═══════════════════════════════════════════════════════════════════════════════
add(copyB('Inicializa Conversa', { id: 'ig-inicializa', position: [3320, 100] }));
conn('Busca Histórico da Conversa', 'Inicializa Conversa');

// ═══════════════════════════════════════════════════════════════════════════════
// F — PIPELINE ANTHROPIC (3 iterações, igual ao WhatsApp)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Iteração 1 ─────────────────────────────────────────────────────────────────
add(copyB('Chama Anthropic 1',      { id: 'ig-ant-1',      position: [3560,  100] }));
add(copyB('É Tool Use? (1)',        { id: 'ig-tool-chk-1', position: [3800,  100] }));
add(copyB('Extrai Resposta 1',      { id: 'ig-resp-1',     position: [4040,  300] }));
add(copyB('Extrai Tool Call 1',     { id: 'ig-tool-1',     position: [4040, -100] }));
add(copyB('Qual Ferramenta? (1)',   { id: 'ig-ferr-1',     position: [4280, -100] }));
add(copyB('Prepara Disp 1',         { id: 'ig-prep-d1',    position: [4520, -300] }));
add(copyB('Prepara Agend 1',        { id: 'ig-prep-a1',    position: [4520, -100] }));
add(copyB('Prepara Cancel 1',       { id: 'ig-prep-c1',    position: [4520,  100] }));
add(copyB('Executa Disponibilidade 1', { id: 'ig-exec-d1', position: [4760, -300] }));
add(copyB('Executa Agendamento 1',     { id: 'ig-exec-a1', position: [4760, -100] }));
add(copyB('Executa Cancelamento 1',    { id: 'ig-exec-c1', position: [4760,  100] }));
add(copyB('Adiciona Tool Result 1', { id: 'ig-tresult-1',  position: [5000, -100] }));

conn('Inicializa Conversa',       'Chama Anthropic 1');
conn('Chama Anthropic 1',         'É Tool Use? (1)');
conn('É Tool Use? (1)',           'Extrai Tool Call 1', 0);  // tool_use
conn('É Tool Use? (1)',           'Extrai Resposta 1',  1);  // text (end)
conn('Extrai Tool Call 1',        'Qual Ferramenta? (1)');
conn('Qual Ferramenta? (1)',       'Prepara Disp 1',   0);
conn('Qual Ferramenta? (1)',       'Prepara Agend 1',  1);
conn('Qual Ferramenta? (1)',       'Prepara Cancel 1', 2);
conn('Prepara Disp 1',            'Executa Disponibilidade 1');
conn('Prepara Agend 1',           'Executa Agendamento 1');
conn('Prepara Cancel 1',          'Executa Cancelamento 1');
conn('Executa Disponibilidade 1', 'Adiciona Tool Result 1');
conn('Executa Agendamento 1',     'Adiciona Tool Result 1');
conn('Executa Cancelamento 1',    'Adiciona Tool Result 1');

// ── Iteração 2 ─────────────────────────────────────────────────────────────────
add(copyB('Chama Anthropic 2',      { id: 'ig-ant-2',      position: [5240,  -100] }));
add(copyB('É Tool Use? (2)',        { id: 'ig-tool-chk-2', position: [5480,  -100] }));
add(copyB('Extrai Resposta 2',      { id: 'ig-resp-2',     position: [5720,   100] }));
add(copyB('Extrai Tool Call 2',     { id: 'ig-tool-2',     position: [5720,  -300] }));
add(copyB('Qual Ferramenta? (2)',   { id: 'ig-ferr-2',     position: [5960,  -300] }));
add(copyB('Prepara Disp 2',         { id: 'ig-prep-d2',    position: [6200,  -500] }));
add(copyB('Prepara Agend 2',        { id: 'ig-prep-a2',    position: [6200,  -300] }));
add(copyB('Prepara Cancel 2',       { id: 'ig-prep-c2',    position: [6200,  -100] }));
add(copyB('Executa Disponibilidade 2', { id: 'ig-exec-d2', position: [6440,  -500] }));
add(copyB('Executa Agendamento 2',     { id: 'ig-exec-a2', position: [6440,  -300] }));
add(copyB('Executa Cancelamento 2',    { id: 'ig-exec-c2', position: [6440,  -100] }));
add(copyB('Adiciona Tool Result 2', { id: 'ig-tresult-2',  position: [6680,  -300] }));

conn('Adiciona Tool Result 1',    'Chama Anthropic 2');
conn('Chama Anthropic 2',         'É Tool Use? (2)');
conn('É Tool Use? (2)',           'Extrai Tool Call 2', 0);
conn('É Tool Use? (2)',           'Extrai Resposta 2',  1);
conn('Extrai Tool Call 2',        'Qual Ferramenta? (2)');
conn('Qual Ferramenta? (2)',       'Prepara Disp 2',   0);
conn('Qual Ferramenta? (2)',       'Prepara Agend 2',  1);
conn('Qual Ferramenta? (2)',       'Prepara Cancel 2', 2);
conn('Prepara Disp 2',            'Executa Disponibilidade 2');
conn('Prepara Agend 2',           'Executa Agendamento 2');
conn('Prepara Cancel 2',          'Executa Cancelamento 2');
conn('Executa Disponibilidade 2', 'Adiciona Tool Result 2');
conn('Executa Agendamento 2',     'Adiciona Tool Result 2');
conn('Executa Cancelamento 2',    'Adiciona Tool Result 2');

// ── Iteração 3 (sem tool use) ──────────────────────────────────────────────────
add(copyB('Chama Anthropic 3', { id: 'ig-ant-3',  position: [6920, -300] }));
add(copyB('Extrai Resposta 3', { id: 'ig-resp-3', position: [7160, -300] }));

conn('Adiciona Tool Result 2', 'Chama Anthropic 3');
conn('Chama Anthropic 3',      'Extrai Resposta 3');

// ═══════════════════════════════════════════════════════════════════════════════
// G — SALVA HISTÓRICO + ENVIO DE MENSAGENS
// ═══════════════════════════════════════════════════════════════════════════════
add(copyB('Salva Histórico da Conversa', { id: 'ig-salva-hist', position: [7400, -300] }));
add(copyB('output mensagem',             { id: 'ig-output',     position: [7640, -300] }));
add(copyB('SEPARA MENSAGENS',            { id: 'ig-separa',     position: [7880, -300] }));
add(copyB('Loop Over Items',             { id: 'ig-loop',       position: [8120, -300] }));

// Envia via Meta Graph API — código adaptado
add({
  id: 'ig-envia-code', name: 'Envia Mensagem Meta',
  type: 'n8n-nodes-base.code', typeVersion: 2,
  position: [8360, -300],
  parameters: {
    mode: 'runOnceForAllItems',
    jsCode: [
      "const coleta    = $('Coleta').first().json;",
      "const channel   = coleta.channel || 'facebook';",
      "const senderId  = coleta.senderId;",
      "const recipId   = coleta.recipientId;",
      "const items     = $input.all();",
      "return items.map(item => {",
      "  const text = item.json.item;",
      "  let url, bodyObj;",
      "  if (channel === 'instagram') {",
      "    url     = 'https://graph.facebook.com/v22.0/' + recipId + '/messages';",
      "    bodyObj = { recipient: { id: senderId }, message: { text } };",
      "  } else {",
      "    url     = 'https://graph.facebook.com/v22.0/me/messages';",
      "    bodyObj = { recipient: { id: senderId }, message: { text }, messaging_type: 'RESPONSE' };",
      "  }",
      "  return { json: { url, body: JSON.stringify(bodyObj), message: text } };",
      "});"
    ].join('\n')
  }
});

// HTTP Request para Meta Graph API
add({
  id: 'ig-envia-http', name: 'Envia Mensagem Meta HTTP',
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
  position: [8600, -300],
  parameters: {
    method: 'POST',
    url: '={{ $json.url }}',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'httpHeaderAuth',
    sendHeaders: false,
    sendBody: true,
    contentType: 'raw',
    rawContentType: 'application/json',
    body: '={{ $json.body }}',
    options: {}
  },
  credentials: {
    httpHeaderAuth: META_CRED
  }
});

add(copyB('DELAY 1 SEGUNDO', { id: 'ig-delay', position: [8840, -300] }));

// Conecta extrai-resp 1 e 2 direto ao salva-hist (caminhos alternativos que não usam tools)
conn('Extrai Resposta 1',        'Salva Histórico da Conversa');
conn('Extrai Resposta 2',        'Salva Histórico da Conversa');
conn('Extrai Resposta 3',        'Salva Histórico da Conversa');
conn('Salva Histórico da Conversa', 'output mensagem');
conn('output mensagem',          'SEPARA MENSAGENS');
conn('SEPARA MENSAGENS',         'Loop Over Items');
conn('Loop Over Items',          'Envia Mensagem Meta',    0);  // has items
conn('Envia Mensagem Meta',      'Envia Mensagem Meta HTTP');
conn('Envia Mensagem Meta HTTP', 'DELAY 1 SEGUNDO');
conn('DELAY 1 SEGUNDO',          'Loop Over Items');          // volta ao loop

// ═══════════════════════════════════════════════════════════════════════════════
// H — SUB-WORKFLOW DE FERRAMENTAS (copiado do fluxo WhatsApp)
//     Entrada Tools → Disponibilidade | Agendamento | Cancelamento
// ═══════════════════════════════════════════════════════════════════════════════
const TOOL_NODES = [
  'Entrada Tools',
  'Roteador Disponibilidade',
  'Busca Eventos Calendar',
  'Formata Resposta Disponibilidade',
  'Normaliza Input Agendamento',
  'Verifica Duplicidade',
  'Checa Duplicidade',
  'Duplicidade?',
  'Retorna Duplicado',
  'Prepara Dados do Evento',
  'Cria Evento no Calendário',
  'Formata Confirmação Agendamento',
  'Notifica Damares',
  'Notifica Damares HTTP',
  'CRM — Salva Agendamento',
  'Retorna Confirmação Agendamento',
  'Roteador Cancelamento',
  'Normaliza Cancelamento',
  'Busca Evento Cancelamento',
  'Encontra Evento',
  'Evento Encontrado?',
  'Deleta Evento Calendario',
  'Formata Confirmação Cancelamento',
  'Notifica Damares Cancelamento',
  'Notifica Damares Cancelamento HTTP',
  'CRM — Marca Cancelamento',
  'Retorna Confirmação Cancelamento',
  'Evento Nao Encontrado'
];

const Y_OFFSET = 700;
TOOL_NODES.forEach(name => {
  const baseNode = B(name);
  if (!baseNode) { console.warn('AVISO: nó não encontrado:', name); return; }
  const n = JSON.parse(JSON.stringify(baseNode));
  n.position = [n.position[0], n.position[1] + Y_OFFSET];
  nodes.push(n);
});

// Copia conexões dos nós de ferramentas do workflow base
const BASE_CONN = base.connections;
TOOL_NODES.forEach(name => {
  if (BASE_CONN[name]) {
    connections[name] = JSON.parse(JSON.stringify(BASE_CONN[name]));
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// I — NOTAS EXPLICATIVAS (Sticky Notes)
// ═══════════════════════════════════════════════════════════════════════════════
add({
  id: 'note-setup', name: 'Como Configurar',
  type: 'n8n-nodes-base.stickyNote', typeVersion: 1,
  position: [200, -700],
  parameters: {
    content: [
      '## DamaresEstética — Instagram + Facebook DM',
      '',
      '### Pré-requisitos',
      '1. **Meta Developer App** com permissões:',
      '   - `instagram_manage_messages`',
      '   - `pages_messaging`',
      '',
      '2. **Credencial n8n** (Header Auth):',
      '   - Name: `Meta Graph API Token`',
      '   - Header: `Authorization`',
      '   - Value: `Bearer SEU_PAGE_ACCESS_TOKEN`',
      '   - Atualizar `META_CRED_ID` no script após criação',
      '',
      '3. **Meta Webhook**:',
      '   - Callback URL: `https://SEU_N8N/webhook/damares-meta`',
      '   - Verify Token: `damares_meta_verify_2026`',
      '   - Subscriptions: `messages`',
      '',
      '4. Após importar: conectar credenciais postgres e Anthropic',
      '   nos nós marcados com ⚠️',
      '',
      '### Fluxo de dados',
      '`Meta → Webhook → Extrai → Debounce → Claude AI → Graph API`'
    ].join('\n'),
    height: 350,
    width: 500,
    color: 3
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SAÍDA
// ═══════════════════════════════════════════════════════════════════════════════
const workflow = {
  name: 'DamaresEstética — Instagram + Facebook DM (Meta Graph API)',
  nodes,
  connections,
  active: false,
  settings: { executionOrder: 'v1' },
  meta: { instanceId: 'damares-instagram-facebook' }
};

const OUT = path.join(__dirname, 'Instagram_Facebook_Agente.json');
fs.writeFileSync(OUT, JSON.stringify(workflow, null, 2));
console.log('✓ Gerado:', path.basename(OUT), '| Nós:', nodes.length);
console.log('');
console.log('📋 Próximos passos:');
console.log('  1. Importar Instagram_Facebook_Agente.json no n8n');
console.log('  2. Criar credencial "Meta Graph API Token" com Bearer token da página');
console.log('  3. Reconectar credenciais: postgres (postgres_cloudfy) e Anthropic Header Auth');
console.log('  4. Configurar webhook no Meta Developer Console:');
console.log('     Callback URL: https://SEU_N8N/webhook/damares-meta');
console.log('     Verify Token: damares_meta_verify_2026');
console.log('  5. Ativar o workflow no n8n');
