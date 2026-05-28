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

const init  = wf.nodes.find(x => x.name === 'Inicializa Conversa');
const prepD = wf.nodes.find(x => x.name === 'Prepara Disp 1');
const prepD2= wf.nodes.find(x => x.name === 'Prepara Disp 2');
const frdNode = wf.nodes.find(x => x.name === 'Formata Resposta Disponibilidade');

// ─── Fix 1: SERVER-SIDE Thursday guard in Prepara Disp 1 & 2 ─────────────
// If the agent passes a Thursday with timeMin before 14:00, silently correct it.
const prepDispNew = `
const ti = $json.tool_input || {};
const rawMin = ti.timeMin || '';
const rawMax = ti.timeMax || '';

// Detect Thursday (BRT date) and enforce 14:00 floor
function forceThursday14(isoStr) {
  const m = isoStr.match(/^(\\d{4}-\\d{2}-\\d{2})T(\\d{2}):(\\d{2})/);
  if (!m) return isoStr;
  const [, dateStr, hh] = m;
  const dow = new Date(dateStr + 'T12:00:00').getDay(); // 0=Sun … 4=Thu
  if (dow !== 4) return isoStr; // not Thursday
  const hour = parseInt(hh, 10);
  if (hour >= 14) return isoStr; // already afternoon
  // Force to 14:00:00-03:00
  return isoStr.replace(/T\\d{2}:\\d{2}:\\d{2}([+-]\\d{2}:\\d{2})?/, 'T14:00:00-03:00');
}

const timeMin = forceThursday14(rawMin);
// If timeMax is also in the morning on a Thursday, cap to 15:30
function forceThursdayMax(isoStr) {
  const m = isoStr.match(/^(\\d{4}-\\d{2}-\\d{2})T(\\d{2}):(\\d{2})/);
  if (!m) return isoStr;
  const [, dateStr, hh] = m;
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  if (dow !== 4) return isoStr;
  const hour = parseInt(hh, 10);
  if (hour >= 14) return isoStr;
  return isoStr.replace(/T\\d{2}:\\d{2}:\\d{2}([+-]\\d{2}:\\d{2})?/, 'T15:30:00-03:00');
}

const timeMax = forceThursdayMax(rawMax);

return [{ json: { timeMin, timeMax, bairro: ti.bairro || '' } }];
`.trim();

prepD.parameters.jsCode  = prepDispNew;
prepD2.parameters.jsCode = prepDispNew.replace(/Prepara Disp 1/g, 'Prepara Disp 2');
console.log('✓ Fix 1a: Prepara Disp 1 — Thursday 14:00 server-side guard');
console.log('✓ Fix 1b: Prepara Disp 2 — Thursday 14:00 server-side guard');
fixes += 2;

// ─── Fix 2: SERVER-SIDE Thursday label in Formata Resposta Disponibilidade ─
// Appends a note so the agent knows only 14:00 is valid on Thursdays.
replaceIn(frdNode,
  "return [{ json: {\n  eventos,\n  total: eventos.length,\n  grupo_destino: grupoDestino,\n  regra: 'Próximo atendimento só pode iniciar no campo proximo_disponivel de cada evento (considera deslocamento por região)'\n} }];",
  `// Detect Thursday from timeMin
const _tmInput = ($('Prepara Disp 1').first()?.json?.timeMin || $('Prepara Disp 2').first()?.json?.timeMin || '');
const _tmDate  = (_tmInput.match(/^(\\d{4}-\\d{2}-\\d{2})/) || [])[1];
const _isThurs = _tmDate ? new Date(_tmDate + 'T12:00:00').getDay() === 4 : false;

return [{ json: {
  eventos,
  total: eventos.length,
  grupo_destino: grupoDestino,
  regra: 'Próximo atendimento só pode iniciar no campo proximo_disponivel de cada evento (considera deslocamento por região)',
  quinta_restricao: _isThurs ? 'QUINTA-FEIRA: único horário válido é 14:00. Não oferecer nenhum outro horário.' : undefined
} }];`,
  'Fix 2: Add Thursday label to Formata Resposta Disponibilidade'
);

// ─── Fix 3: System prompt — greeting order (section 4) ───────────────────
// The agent inverts greeting and menu. Make the order bullet-proof.
// NOTE: In jsCode string, the \\ separator appears as 2 backslashes (\\\\  in source)
replaceIn(init,
  'Ao receber o primeiro contato, enviar em 2 bolhas:\n\n"Olá! ✨ Eu sou a Damys, assistente virtual da Damares — terapeuta esteticista especializada em massagens e tratamentos estéticos a domicílio 💆‍♀️🏡\nAntes de começarmos, poderia me informar seu nome e bairro ou região? Assim consigo verificar disponibilidade e possíveis taxas de deslocamento 😊\\\\ Como posso ajudar você hoje?\n1️⃣ Agendar uma massagem\n2️⃣ Tirar dúvidas sobre os procedimentos\n3️⃣ Cancelar ou alterar agendamento\n4️⃣ Outros"',
  'Ao receber o primeiro contato, enviar EXATAMENTE 2 bolhas NA SEGUINTE ORDEM OBRIGATÓRIA:\n\n⚠️ BOLHA 1 — SEMPRE PRIMEIRA — Saudação + pedido de nome/bairro:\n"Olá! ✨ Eu sou a Damys, assistente virtual da Damares — terapeuta esteticista especializada em massagens e tratamentos estéticos a domicílio 💆‍♀️🏡\nAntes de começarmos, poderia me informar seu nome e bairro ou região? Assim consigo verificar disponibilidade e possíveis taxas de deslocamento 😊"\n\n⚠️ BOLHA 2 — SEMPRE SEGUNDA, NUNCA ANTES DA SAUDAÇÃO — Menu de opções:\n"Como posso ajudar você hoje?\n1️⃣ Agendar uma massagem\n2️⃣ Tirar dúvidas sobre os procedimentos\n3️⃣ Cancelar ou alterar agendamento\n4️⃣ Outros"\n\n⚠️ Separar BOLHA 1 e BOLHA 2 com \\\\ conforme o padrão. NUNCA inverter a ordem (menu não pode vir antes da saudação).',
  'Fix 3: Greeting order — bolha 1 = saudação, bolha 2 = menu'
);

// ─── Fix 4: Section 6 — double coverage message + Alphaville ─────────────
replaceIn(init,
  'CASO A — Cliente em CIDADE fora de São Paulo Capital (ex: Guarulhos, Osasco, ABC, Santo André, São Bernardo, Mauá, Barueri, Cotia, etc.):',
  '⚠️ REGRA ANTI-DUPLICAÇÃO: Para cada bairro/cidade informado, escolher SOMENTE UM CASO (A ou B) — NUNCA enviar ambas as mensagens.\n\nCASO A — Cliente em CIDADE fora de São Paulo Capital (ex: Guarulhos, Osasco, ABC, Santo André, São Bernardo, Mauá, Barueri, Cotia, Alphaville, Alphavile, Tamboré, etc.):',
  'Fix 4a: Add anti-duplication rule + Alphaville to CASO A'
);

replaceIn(init,
  '⚠️ APÓS qualquer dessas mensagens: ENCERRAR a conversa — não oferecer menu, não continuar atendimento.\n⚠️ NUNCA usar a resposta do CASO A para bairros que são de São Paulo Capital',
  '⚠️ APÓS qualquer dessas mensagens: ENCERRAR a conversa — não oferecer menu, não continuar atendimento.\n⚠️ NUNCA enviar CASO A e CASO B ao mesmo tempo — escolha UM e encerre.\n⚠️ NUNCA usar a resposta do CASO A para bairros que são de São Paulo Capital',
  'Fix 4b: Reinforce single-message rule after coverage check'
);

// ─── Fix 5: Section 7.4 — time confirmation state rule (loop prevention) ─
replaceIn(init,
  'INTERPRETAÇÃO — responder em 1 bolha:\nSe disponível:\n"Tenho os seguintes horários disponíveis 🌿\n• [horário 1]\n• [horário 2]\n• [horário 3]\nQual funciona melhor para você? 😊"',
  'INTERPRETAÇÃO — responder em 1 bolha:\nSe disponível:\n"Tenho os seguintes horários disponíveis 🌿\n• [horário 1]\n• [horário 2]\n• [horário 3]\nQual funciona melhor para você? 😊"\n\n⚠️ REGRA DE ESTADO — Resposta ao "Qual funciona melhor para você?":\nApós apresentar a lista de horários, a PRÓXIMA mensagem do cliente É a escolha do horário. Qualquer número, horário ou resposta afirmativa:\n→ Confirmar em 1 mensagem: "Perfeito! Então é [HH:MM]. ✅" e prosseguir PARA 7.5 (resumo) ou para coletar dados pendentes em 7.3\n→ NUNCA re-chamar verificar_disponibilidade após o cliente escolher\n→ NUNCA re-exibir a lista de horários\n\n⚠️ REGRA DE ESTADO — Confirmação do horário:\nApós perguntar "Perfeito! Então é [HH:MM], certo? 😊" e o cliente responder com "sim", "ok", "isso", "certo" ou qualquer afirmativo:\n→ Prosseguir IMEDIATAMENTE para 7.5 ou para coletar dados pendentes (nome, endereço)\n→ NUNCA re-chamar verificar_disponibilidade\n→ NUNCA re-exibir horários disponíveis',
  'Fix 5: Time choice + time confirmation state rules (prevent availability loop)'
);

// ─── Fix 6: Section 7.5 — use confirmed date, not rejected dates ─────────
replaceIn(init,
  '• Data: [DD/MM/YYYY]',
  '• Data: [DD/MM/YYYY — usar SOMENTE a data confirmada na etapa 7.4, NUNCA uma data que foi recusada (feriado/fim de semana)]',
  'Fix 6: Summary date must be the confirmed date, never a rejected one'
);

// ─── Save ─────────────────────────────────────────────────────────────────
fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
console.log(`\n✓ Saved ${FILE} (${fixes} fixes applied)`);
