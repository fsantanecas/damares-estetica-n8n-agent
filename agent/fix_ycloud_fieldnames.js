const fs = require('fs');

const FILE = 'Agente_DamaresEstetica_HTTPRequest.json';
const wf = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// ─── 1. Fix filter event type ─────────────────────────────────────────────
// Actual YCloud event type: "whatsapp.inbound_message.received" (not ".inbound_message")
const filterNode = wf.nodes.find(n => n.name === 'Filtra Evento YCloud');
filterNode.parameters.conditions.conditions[0].rightValue = 'whatsapp.inbound_message.received';
console.log('✓ Filter updated to: whatsapp.inbound_message.received');

// ─── 2. Fix Coleta field paths ─────────────────────────────────────────────
// Actual YCloud field: "whatsappInboundMessage" (not "whatsappMessage")
// Actual contact name field: "customerProfile.name" (not "contact.name")
const coleta = wf.nodes.find(n => n.name === 'Coleta');
const a = coleta.parameters.assignments.assignments;

// nome: use customerProfile.name
a.find(x => x.id === 'dm-col-nome').value =
  "={{ $json.body.whatsappInboundMessage.customerProfile && $json.body.whatsappInboundMessage.customerProfile.name ? $json.body.whatsappInboundMessage.customerProfile.name : 'Cliente' }}";

// telefone: strip "+" and append @s.whatsapp.net (backward compatible)
a.find(x => x.id === 'dm-col-tel').value =
  "={{ ($json.body.whatsappInboundMessage.from || '').replace('+', '') + '@s.whatsapp.net' }}";

// tipo: normalize to Evolution API names for downstream Switch compatibility
a.find(x => x.id === 'dm-col-tipo').value =
  "={{ $json.body.whatsappInboundMessage.type === 'text' ? 'conversation' : $json.body.whatsappInboundMessage.type === 'audio' ? 'audioMessage' : $json.body.whatsappInboundMessage.type === 'image' ? 'imageMessage' : $json.body.whatsappInboundMessage.type === 'video' ? 'videoMessage' : ($json.body.whatsappInboundMessage.type || 'unknown') }}";

// mensagem: build from YCloud structure
a.find(x => x.id === 'dm-col-msg').value =
  "={{ $json.body.whatsappInboundMessage.type === 'text' ? $json.body.whatsappInboundMessage.text.body : $json.body.whatsappInboundMessage.type === 'image' ? ('📷 Foto recebida' + ($json.body.whatsappInboundMessage.image && $json.body.whatsappInboundMessage.image.caption ? ': ' + $json.body.whatsappInboundMessage.image.caption : '')) : $json.body.whatsappInboundMessage.type === 'video' ? ('🎬 Vídeo recebido' + ($json.body.whatsappInboundMessage.video && $json.body.whatsappInboundMessage.video.caption ? ': ' + $json.body.whatsappInboundMessage.video.caption : '')) : $json.body.whatsappInboundMessage.type === 'audio' ? '🎵 Áudio recebido' : '[Mensagem recebida]' }}";

console.log('✓ Coleta updated to use whatsappInboundMessage + customerProfile.name');

// ─── Save ─────────────────────────────────────────────────────────────────
fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
console.log('✓ Saved');
