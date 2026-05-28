/**
 * fix_templates.js
 *
 * Converts outbound campaign/follow-up message nodes from free-form text
 * to WhatsApp Template format (required for messages to users who haven't
 * interacted in the past 24 h — Meta error 131047).
 *
 * ─── Templates to create in Meta Business Manager ─────────────────────────
 *
 * Template 1 — CAMPANHA LEADS
 *   Name:      campanha_leads_damares        ← update TEMPLATE_CAMPANHA below after approval
 *   Category:  MARKETING
 *   Language:  Portuguese (BR)
 *   Body text:
 *     "Olá {{1}}! 😊 Sou Damares, terapeuta esteticista especializada em
 *      massagens e procedimentos estéticos a domicílio. Levo conforto,
 *      cuidado e bem-estar até você, com atendimento personalizado no
 *      conforto da sua casa ✨ Posso te apresentar os serviços disponíveis?
 *      Será um prazer te atender! 💆🏻‍♀️"
 *   Variable {{1}}: primeiro nome do lead
 *
 * Template 2 — FOLLOW-UP RETORNO  (used by weekly scheduler AND manual flow)
 *   Name:      followup_retorno_damares      ← update TEMPLATE_FOLLOWUP below after approval
 *   Category:  MARKETING
 *   Language:  Portuguese (BR)
 *   Body text:
 *     "Olá {{1}}! 🌿 Faz um tempinho que não nos vemos! Tenho saudades de
 *      cuidar do seu bem-estar ✨ Estou com agenda aberta e adoraria te
 *      receber para uma nova sessão. Quer agendar? É só me chamar por
 *      aqui 😊🌿"
 *   Variable {{1}}: primeiro nome da cliente
 *
 * ──────────────────────────────────────────────────────────────────────────
 * UPDATE THESE TWO CONSTANTS AFTER META APPROVES THE TEMPLATES:
 */
const TEMPLATE_CAMPANHA = 'campanha_leads_damares';
const TEMPLATE_FOLLOWUP = 'followup_retorno_damares';
// ──────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const MAIN = path.join(__dirname, 'Agente_DamaresEstetica_HTTPRequest.json');
const STANDALONE = path.join(__dirname, 'Followup_Manual_Standalone.json');

function buildTemplateBody(templateName, nomePrimeiro, toPhone) {
  return {
    from: '+5511994265257',
    to: toPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'pt_BR' },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: nomePrimeiro }]
        }
      ]
    }
  };
}

// ─── Main workflow ─────────────────────────────────────────────────────────
const mainWf = JSON.parse(fs.readFileSync(MAIN, 'utf8'));

// 1. Envia Mensagem Lead (Campanha Leads)
const leadNode = mainWf.nodes.find(n => n.name === 'Envia Mensagem Lead');
if (!leadNode) { console.error('ERROR: Envia Mensagem Lead not found'); process.exit(1); }
leadNode.parameters.jsCode = [
  'const item = $input.first().json;',
  "const toPhone = '+' + item.telefone.replace(/\\D/g, '');",
  "const nome = item.nome ? item.nome.split(' ')[0] : 'cliente';",
  'const body = JSON.stringify({',
  "  from: '+5511994265257',",
  '  to: toPhone,',
  "  type: 'template',",
  '  template: {',
  `    name: '${TEMPLATE_CAMPANHA}',`,
  "    language: { code: 'pt_BR' },",
  '    components: [',
  "      { type: 'body', parameters: [{ type: 'text', text: nome }] }",
  '    ]',
  '  }',
  '});',
  'return [{ json: { toPhone, body } }];'
].join('\n');
console.log('✓ Envia Mensagem Lead → template:', TEMPLATE_CAMPANHA);

// 2. Envia Mensagem Follow-up (agendador semanal)
const followupNode = mainWf.nodes.find(n => n.name === 'Envia Mensagem Follow-up');
if (!followupNode) { console.error('ERROR: Envia Mensagem Follow-up not found'); process.exit(1); }
followupNode.parameters.jsCode = [
  'const item = $input.first().json;',
  "const toPhone = '+' + item.telefone.replace(/\\D/g, '');",
  "const nome = item.nome ? item.nome.split(' ')[0] : 'querida';",
  'const body = JSON.stringify({',
  "  from: '+5511994265257',",
  '  to: toPhone,',
  "  type: 'template',",
  '  template: {',
  `    name: '${TEMPLATE_FOLLOWUP}',`,
  "    language: { code: 'pt_BR' },",
  '    components: [',
  "      { type: 'body', parameters: [{ type: 'text', text: nome }] }",
  '    ]',
  '  }',
  '});',
  'return [{ json: { toPhone, body, id: item.id } }];'
].join('\n');
console.log('✓ Envia Mensagem Follow-up → template:', TEMPLATE_FOLLOWUP);

fs.writeFileSync(MAIN, JSON.stringify(mainWf, null, 2));
console.log('✓ Saved', path.basename(MAIN));

// ─── Standalone workflow ───────────────────────────────────────────────────
const standalone = JSON.parse(fs.readFileSync(STANDALONE, 'utf8'));

const manualNode = standalone.nodes.find(n => n.name === 'Monta Mensagem Follow-up Manual');
if (!manualNode) { console.error('ERROR: Monta Mensagem Follow-up Manual not found'); process.exit(1); }
manualNode.parameters.jsCode = [
  'const cliente = $input.item.json;',
  "const nome = cliente.nome ? cliente.nome.split(' ')[0] : 'querida';",
  "const toPhone = '+' + String(cliente.telefone).replace(/\\D/g, '');",
  'const body = JSON.stringify({',
  "  from: '+5511994265257',",
  '  to: toPhone,',
  "  type: 'template',",
  '  template: {',
  `    name: '${TEMPLATE_FOLLOWUP}',`,
  "    language: { code: 'pt_BR' },",
  '    components: [',
  "      { type: 'body', parameters: [{ type: 'text', text: nome }] }",
  '    ]',
  '  }',
  '});',
  'return { json: { toPhone, body, id: cliente.id } };'
].join('\n');
console.log('✓ Monta Mensagem Follow-up Manual → template:', TEMPLATE_FOLLOWUP);

fs.writeFileSync(STANDALONE, JSON.stringify(standalone, null, 2));
console.log('✓ Saved', path.basename(STANDALONE));

console.log('\n✅ Done. Both workflows updated to use WhatsApp Templates.');
console.log('   After Meta approves the templates, update TEMPLATE_CAMPANHA and TEMPLATE_FOLLOWUP');
console.log('   at the top of this script and re-run it.');
