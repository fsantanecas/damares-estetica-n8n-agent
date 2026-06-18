const fs = require('fs');
const { randomUUID } = require('crypto');

const FILE = 'Agente_DamaresEstetica_HTTPRequest.json';
const wf = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// ─── 1. Add event-type filter node before Coleta ───────────────────────────
// YCloud sends TWO types of webhooks to the same endpoint:
//   - "whatsapp.inbound_message"  → customer message (process)
//   - "whatsapp.message.updated"  → delivery status callback (ignore)
// Without this filter the workflow processes every delivery status as a new
// message, creating an infinite loop.

const recebeMsg = wf.nodes.find(n => n.name === 'Recebe mensagem');
const coletaNode = wf.nodes.find(n => n.name === 'Coleta');

const filterNode = {
  id: randomUUID(),
  name: 'Filtra Evento YCloud',
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [recebeMsg.position[0] + 240, recebeMsg.position[1]],
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{
        id: randomUUID(),
        leftValue: '={{ $json.body.type }}',
        rightValue: 'whatsapp.inbound_message',
        operator: { type: 'string', operation: 'equals' }
      }],
      combinator: 'and'
    },
    looseTypeValidation: true,
    options: {}
  }
};
wf.nodes.push(filterNode);

// Shift Coleta a bit to the right to make room visually
coletaNode.position[0] += 240;

// Reconnect: Recebe mensagem → Filtra → [true] Coleta
wf.connections['Recebe mensagem'].main[0] = [{ node: 'Filtra Evento YCloud', type: 'main', index: 0 }];
wf.connections['Filtra Evento YCloud'] = {
  main: [
    [{ node: 'Coleta', type: 'main', index: 0 }], // true → process
    []                                              // false → stop (delivery status)
  ]
};
console.log('✓ Added Filtra Evento YCloud filter node');

// ─── 2. Update Coleta Set node for YCloud webhook format ──────────────────
// YCloud inbound format:
//   body.whatsappMessage.from       → customer phone ("+5511999887766")
//   body.whatsappMessage.type       → "text" | "audio" | "image" | "video"
//   body.whatsappMessage.text.body  → message text
//   body.whatsappMessage.contact.name → display name (may not always be present)
//
// We normalize telefone to Evolution API format ("{phone}@s.whatsapp.net") so
// all downstream code that strips "@s.whatsapp.net" continues to work unchanged.

const coletaAssignments = [
  {
    id: 'dm-col-nome',
    name: 'nome',
    value: '={{ $json.body.whatsappMessage.contact && $json.body.whatsappMessage.contact.name ? $json.body.whatsappMessage.contact.name : ($json.body.whatsappMessage.fromName || \'Cliente\') }}',
    type: 'string'
  },
  {
    id: 'dm-col-tel',
    name: 'telefone',
    // Strip "+" and append "@s.whatsapp.net" to keep downstream code unchanged
    value: '={{ ($json.body.whatsappMessage.from || \'\').replace(\'+\', \'\') + \'@s.whatsapp.net\' }}',
    type: 'string'
  },
  {
    id: 'dm-col-tipo',
    name: 'tipo',
    // Normalize YCloud types to Evolution API names used by downstream routing
    value: '={{ $json.body.whatsappMessage.type === \'text\' ? \'conversation\' : $json.body.whatsappMessage.type === \'audio\' ? \'audioMessage\' : $json.body.whatsappMessage.type === \'image\' ? \'imageMessage\' : $json.body.whatsappMessage.type === \'video\' ? \'videoMessage\' : ($json.body.whatsappMessage.type || \'unknown\') }}',
    type: 'string'
  },
  {
    id: 'dm-col-msg',
    name: 'mensagem',
    value: '={{ $json.body.whatsappMessage.type === \'text\' ? $json.body.whatsappMessage.text.body : $json.body.whatsappMessage.type === \'image\' ? (\'📷 Foto recebida\' + ($json.body.whatsappMessage.image && $json.body.whatsappMessage.image.caption ? \': \' + $json.body.whatsappMessage.image.caption : \'\')) : $json.body.whatsappMessage.type === \'video\' ? (\'🎬 Vídeo recebido\' + ($json.body.whatsappMessage.video && $json.body.whatsappMessage.video.caption ? \': \' + $json.body.whatsappMessage.video.caption : \'\')) : $json.body.whatsappMessage.type === \'audio\' ? \'🎵 Áudio recebido\' : \'[Mensagem recebida]\' }}',
    type: 'string'
  },
  {
    id: 'dm-col-fromme',
    name: 'fromMe',
    value: false, // YCloud only sends inbound_message webhooks from customers
    type: 'boolean'
  }
];

coletaNode.parameters.assignments.assignments = coletaAssignments;
console.log('✓ Updated Coleta assignments for YCloud format');

// ─── 3. Update Verifica tipo de arquivo Switch ─────────────────────────────
// Since Coleta now normalizes tipo to Evolution API names, we only need to
// update the field path from the raw webhook to $('Coleta').first().json.tipo.

const sw = wf.nodes.find(n => n.name === 'Verifica tipo de arquivo');
const swStr = JSON.stringify(sw.parameters);
const fixed = swStr.replace(
  /\$\('Recebe mensagem'\)\.item\.json\.body\.data\.messageType/g,
  "$('Coleta').first().json.tipo"
);
sw.parameters = JSON.parse(fixed);
console.log('✓ Updated Verifica tipo de arquivo to use Coleta.tipo');

// ─── 4. É Damares? comparison stays the same ──────────────────────────────
// Coleta.telefone is now "5511999950549@s.whatsapp.net" (normalized),
// so the existing comparison value "5511999950549@s.whatsapp.net" still works.
const eDamares = wf.nodes.find(n => n.name === 'É Damares?');
const damaresCond = eDamares.parameters.conditions.conditions[0];
console.log('✓ É Damares? check unchanged:', damaresCond.rightValue);

// ─── Save ─────────────────────────────────────────────────────────────────
fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
console.log('\n✓ Saved', FILE);
console.log('Total nodes:', wf.nodes.length);
