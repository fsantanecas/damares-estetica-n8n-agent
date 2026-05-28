const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'Followup_Manual_Standalone.json');
const wf = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const node = wf.nodes.find(n => n.name === 'Monta Mensagem Follow-up Manual');
if (!node) { console.error('ERROR: node not found'); process.exit(1); }

node.parameters.jsCode = [
  'const item = $input.first().json;',
  "const nome = item.nome ? item.nome.split(' ')[0] : 'querida';",
  "const toPhone = '+' + String(item.telefone).replace(/\\D/g, '');",
  'const message =',
  "  'Olá ' + nome + '! 🌿\\n\\n' +",
  "  'Sou a Damys, assistente da Damares Estética. Faz um tempinho que não nos vemos! ✨\\n\\n' +",
  "  'A Damares está com agenda aberta e adoraria te receber para uma sessão de massagem ou tratamento estético a domicílio 💆🏻‍♀️🏡\\n\\n' +",
  "  'Quer agendar? É só me chamar por aqui 😊🌿';",
  "const body = JSON.stringify({ from: '+5511994265257', to: toPhone, type: 'text', text: { body: message } });",
  'return [{ json: { toPhone, message, body, id: item.id } }];'
].join('\n');

fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
console.log('✓ Fixed jsCode in Monta Mensagem Follow-up Manual');
