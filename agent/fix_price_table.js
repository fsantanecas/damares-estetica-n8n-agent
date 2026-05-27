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

const initNode = wf.nodes.find(x => x.name === 'Inicializa Conversa');

// ─── Fix 1: Add compact price reference table to section 7.2 ─────────────
// The dispersed section-5 layout causes the model to pick the wrong group/type.
// A single compact table at point-of-use (7.2) eliminates that error.
replaceIn(initNode,
  '7.2 — Informar Valores\n--------------------------------------------------\n\n⚠️ Os valores dependem da região — confirme o bairro do cliente antes de informar.\nConsulte a tabela da seção 5 para o grupo correto (A, B ou C).',
  '7.2 — Informar Valores\n--------------------------------------------------\n\n⚠️ Os valores dependem da região — confirme o bairro do cliente antes de informar.\n\n📋 TABELA DE PREÇOS — USE ESTA TABELA PARA TODOS OS CÁLCULOS DE VALOR E SINAL:\n\nMASSAGEM RELAXANTE\n                        Grupo A           Grupo B           Grupo C\n  1h   — avulsa:        R$ 220            R$ 250            R$ 350\n  1h   — plano 5 sess:  R$ 1.045          R$ 1.190          R$ 1.665\n  1h30 — avulsa:        R$ 300            R$ 320            R$ 430\n  1h30 — plano 5 sess:  R$ 1.425          R$ 1.520          R$ 2.045\n\nDRENAGEM LINFÁTICA\n                        Grupo A/B         Grupo C\n  1h   — avulsa:        R$ 250            R$ 300\n  1h   — plano 5 sess:  R$ 1.190          R$ 1.425\n  1h20 — avulsa:        R$ 300            R$ 380\n  1h20 — plano 5 sess:  R$ 1.425          R$ 1.805\n\nPÓS-OPERATÓRIO (todos os grupos)\n  1h30 — avulsa:        R$ 400\n  1h30 — plano 5 sess:  R$ 1.900\n\nBairros por grupo:\n  Grupo A: Mooca, Tatuapé, Anália Franco\n  Grupo B: São Caetano do Sul, Ipiranga, Vila Mariana, Aclimação, Mirandópolis, Vila Clementino, Bosque da Saúde, Vila da Saúde, Chácara Inglesa\n  Grupo C: Jardins, Itaim, Jardim Europa, Vila Nova Conceição, Higienópolis\n\n⚠️ Consulte SOMENTE esta tabela acima — NÃO calcule de memória.',
  'Fix 1: Add compact price reference table to section 7.2'
);

// ─── Fix 2: Section 7.5 — require cross-check against compact table ───────
replaceIn(initNode,
  '"Resumo do seu atendimento 🌿\n• Procedimento: [serviço EXATO com duração — ex: Massagem Relaxante 1h30 ou Drenagem Linfática Corporal (1h)]\n• Endereço: [endereço completo]\n• Data: [DD/MM/YYYY]\n• Horário: [HH:MM]\n• Valor do serviço: R$ [valor conforme região]\n• Taxa de deslocamento: R$ [valor ou isento]\nPosso prosseguir com a confirmação? 😊"',
  '"Resumo do seu atendimento 🌿\n• Procedimento: [serviço EXATO com duração — ex: Massagem Relaxante 1h30 ou Drenagem Linfática Corporal (1h)]\n• Endereço: [endereço completo]\n• Data: [DD/MM/YYYY]\n• Horário: [HH:MM]\n• Valor do serviço: R$ [valor exato da TABELA DE PREÇOS acima — confirmar bairro→grupo→duração→plano/avulsa]\n• Taxa de deslocamento: R$ [valor ou isento]\nPosso prosseguir com a confirmação? 😊"\n\n⚠️ ANTES de preencher "Valor do serviço": consultar a TABELA DE PREÇOS na seção 7.2 com bairro→grupo→duração→plano ou avulsa. NUNCA escrever um valor de memória.',
  'Fix 2: Require table lookup in 7.5 summary'
);

// ─── Save ─────────────────────────────────────────────────────────────────
fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
console.log('\n✓ Saved ' + FILE + ' (' + fixes + ' fixes applied)');
