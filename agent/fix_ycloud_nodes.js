const fs = require('fs');
const { randomUUID } = require('crypto');

const FILE = 'Agente_DamaresEstetica_HTTPRequest.json';
const wf = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const FROM = '+5511994265257';
const DAMARES = '+5511999950549';
const YCLOUD_URL = 'https://api.ycloud.com/v2/whatsapp/messages/sendDirectly';
const API_KEY = 'ea53799239658212b3a8be3befbffff9';

// Helper: build HTTP Request node for YCloud
function makeHttpNode(name, pos) {
  return {
    id: randomUUID(),
    name: name + ' HTTP',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [pos[0] + 240, pos[1]],
    parameters: {
      method: 'POST',
      url: YCLOUD_URL,
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: 'X-API-Key', value: API_KEY }]
      },
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'application/json',
      body: '={{ $json.body }}'
    }
  };
}

// Helper: wrap connections array
function conn(nodeName) {
  return [{ node: nodeName, type: 'main', index: 0 }];
}

// Definitions for each node: id, new jsCode, and optional downstream target
const nodes = [
  {
    id: 'dm-envia-alerta',
    code: `const message = $input.first().json.alertText;
const toPhone = '${DAMARES}';
const body = JSON.stringify({ from: '${FROM}', to: toPhone, type: 'text', text: { body: message } });
return [{ json: { toPhone, message, body } }];`,
    downstream: 'Resposta para Mídia'
  },
  {
    id: 'dm-resp-midia',
    code: `const telefone = $('Coleta').first().json.telefone;
const toPhone = '+' + telefone.replace('@s.whatsapp.net', '').replace('+', '');
const message = 'Recebi sua mensagem de voz! 🎵\\nPor aqui funciono melhor com texto 😊\\nPode me escrever o que precisa? Será um prazer ajudar! 🌿';
const body = JSON.stringify({ from: '${FROM}', to: toPhone, type: 'text', text: { body: message } });
return [{ json: { toPhone, message, body } }];`,
    downstream: null
  },
  {
    id: 'dm-agend-notifica',
    code: `const message = $input.first().json.notificacao;
const toPhone = '${DAMARES}';
const body = JSON.stringify({ from: '${FROM}', to: toPhone, type: 'text', text: { body: message } });
return [{ json: { toPhone, message, body } }];`,
    downstream: 'CRM — Salva Agendamento'
  },
  {
    id: 'dm-leads-envia',
    code: `const item = $input.first().json;
const toPhone = '+' + item.telefoneWpp.replace('@s.whatsapp.net', '').replace('+', '');
const message = item.mensagem;
const body = JSON.stringify({ from: '${FROM}', to: toPhone, type: 'text', text: { body: message } });
return [{ json: { toPhone, message, body } }];`,
    downstream: 'Delay entre Leads'
  },
  {
    // Notifica Damares Cancelamento
    name: 'Notifica Damares Cancelamento',
    code: `const message = $input.first().json.notificacao;
const toPhone = '${DAMARES}';
const body = JSON.stringify({ from: '${FROM}', to: toPhone, type: 'text', text: { body: message } });
return [{ json: { toPhone, message, body } }];`,
    downstream: 'CRM — Marca Cancelamento'
  },
  {
    // Envia Avaliação ao Cliente
    name: 'Envia Avaliação ao Cliente',
    code: `const phone = $input.first().json.phone;
const toPhone = '+' + phone.replace('@s.whatsapp.net', '').replace('+', '');
const message = 'Foi um prazer cuidar de você hoje 🌿✨\\nEspero que sua experiência tenha sido relaxante e especial 😊\\nQuando puder, não esqueça de deixar sua avaliação no Google. Sua opinião é muito importante para mim 💚\\nLink para avaliação:\\nhttps://g.page/r/CfOSAyIQuDfGEBM/review';
const body = JSON.stringify({ from: '${FROM}', to: toPhone, type: 'text', text: { body: message } });
return [{ json: { toPhone, message, body } }];`,
    downstream: 'Confirma Damares'
  },
  {
    // Confirma Damares
    name: 'Confirma Damares',
    code: `const phoneDisplay = $('Processa Comando Avaliação').first().json.phoneDisplay;
const message = '✅ Mensagem de avaliação enviada para +' + phoneDisplay + ' com sucesso! 🌿';
const toPhone = '${DAMARES}';
const body = JSON.stringify({ from: '${FROM}', to: toPhone, type: 'text', text: { body: message } });
return [{ json: { toPhone, message, body } }];`,
    downstream: null
  },
  {
    // Avisa Erro Número
    name: 'Avisa Erro Número',
    code: `const erro = $input.first().json.erro;
const message = '❌ ' + erro + '\\nExemplo: AVALIAÇÃO 11999887766';
const toPhone = '${DAMARES}';
const body = JSON.stringify({ from: '${FROM}', to: toPhone, type: 'text', text: { body: message } });
return [{ json: { toPhone, message, body } }];`,
    downstream: null
  },
  {
    id: 'dm-aval-envia',
    code: `const item = $input.first().json;
const toPhone = '+' + item.telefone.replace('@s.whatsapp.net', '').replace('+', '');
const message = 'Olá ' + item.nome + ' 🌿\\n\\nEspero que sua sessão de *' + item.ultimo_procedimento + '* tenha sido maravilhosa! ✨\\n\\nSua avaliação no Google me ajuda muito a continuar levando bem-estar a mais pessoas 💚\\n\\n👉 https://g.page/r/CfOSAyIQuDfGEBM/review\\n\\nObrigada de coração! 🌿';
const body = JSON.stringify({ from: '${FROM}', to: toPhone, type: 'text', text: { body: message } });
return [{ json: { toPhone, message, body } }];`,
    downstream: 'Atualiza Lembrete Avaliação'
  },
  {
    id: 'dm-followup-envia',
    code: `const item = $input.first().json;
const toPhone = '+' + item.telefone.replace('@s.whatsapp.net', '').replace('+', '');
const message = 'Olá ' + item.nome + ' 🌿\\n\\nFaz um tempinho que não nos vemos! Tenho saudades de cuidar do seu bem-estar ✨\\n\\nEstou com agenda aberta e adoraria te receber para uma nova sessão de *' + (item.ultimo_procedimento || 'massagem') + '*.\\n\\nQuer agendar? É só me chamar por aqui 😊🌿';
const body = JSON.stringify({ from: '${FROM}', to: toPhone, type: 'text', text: { body: message } });
return [{ json: { toPhone, message, body } }];`,
    downstream: 'Atualiza Próximo Follow-up'
  },
  {
    id: 'dm-envia-wpp',
    code: `const telefone = $('Coleta').first().json.telefone;
const toPhone = '+' + telefone.split('@')[0];
const items = $input.all();
return items.map(item => {
  const message = item.json.item;
  const body = JSON.stringify({ from: '${FROM}', to: toPhone, type: 'text', text: { body: message } });
  return { json: { toPhone, message, body } };
});`,
    downstream: 'DELAY 1 SEGUNDO'
  }
];

// Resolve node objects by id or name
for (const def of nodes) {
  const n = def.id
    ? wf.nodes.find(x => x.id === def.id)
    : wf.nodes.find(x => x.name === def.name);
  if (!n) { console.error('NODE NOT FOUND:', def.id || def.name); process.exit(1); }
  def.node = n;
  def.nodeName = n.name;
}

// Step 1: Update jsCode of each compute node
for (const def of nodes) {
  def.node.parameters.jsCode = def.code;
  // Remove any lingering HTTP parameters that don't belong
  delete def.node.parameters.method;
  delete def.node.parameters.url;
  delete def.node.parameters.sendHeaders;
  delete def.node.parameters.headerParameters;
  delete def.node.parameters.sendBody;
  delete def.node.parameters.contentType;
  delete def.node.parameters.rawContentType;
  delete def.node.parameters.body;
}
console.log('✓ Updated jsCode for all 11 compute nodes');

// Step 2: Create HTTP Request nodes and register them
const newHttpNodes = [];
for (const def of nodes) {
  const httpNode = makeHttpNode(def.nodeName, def.node.position);
  def.httpNode = httpNode;
  newHttpNodes.push(httpNode);
}
wf.nodes.push(...newHttpNodes);
console.log('✓ Added', newHttpNodes.length, 'HTTP Request nodes');

// Step 3: Update connections
// For each node:
//   - Remove original: nodeName → downstream (if any)
//   - Add: nodeName → httpNodeName
//   - Add: httpNodeName → downstream (if any)
const c = wf.connections;

for (const def of nodes) {
  const { nodeName, httpNode, downstream } = def;
  const httpName = httpNode.name;

  // Add compute → HTTP connection
  c[nodeName] = { main: [[{ node: httpName, type: 'main', index: 0 }]] };

  // Add HTTP → downstream connection (if any)
  if (downstream) {
    c[httpName] = { main: [[{ node: downstream, type: 'main', index: 0 }]] };
  }
  // If no downstream, don't add an entry (HTTP node is terminal)
}
console.log('✓ Updated all connections');

// Write output
fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
console.log('✓ Saved', FILE);
console.log('\nSummary of new HTTP nodes:');
newHttpNodes.forEach(n => console.log(' -', n.name, 'at', n.position));
