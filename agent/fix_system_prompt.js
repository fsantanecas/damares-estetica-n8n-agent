const fs = require('fs');

const FILE = 'Agente_DamaresEstetica_HTTPRequest.json';
const wf = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const n = wf.nodes.find(x => x.name === 'Inicializa Conversa');
let code = n.parameters.jsCode;

// ─── Fix 1: Section 4-B — URL in greeting ─────────────────────────────────
// Add explicit restriction: URL must ONLY be sent when client explicitly requests
// to speak with Damares. Never in greetings or menu responses.
const old4B = `Quando, em qualquer ponto da conversa (especialmente dentro de Outros — 4️⃣), o cliente solicitar falar diretamente com a Damares, pedir o contato pessoal ou o número dela:`;
const new4B = `⚠️ ESTA SEÇÃO SOMENTE SE APLICA quando o cliente EXPLICITAMENTE pedir para falar com a Damares, pedir o contato pessoal dela ou o número dela. NUNCA enviar o link abaixo em saudações, respostas ao menu, boas-vindas ou qualquer outra situação que não seja um pedido explícito de contato com a Damares.

Quando, em qualquer ponto da conversa (especialmente dentro de Outros — 4️⃣), o cliente solicitar falar diretamente com a Damares, pedir o contato pessoal ou o número dela:`;

if (!code.includes(old4B)) {
  console.error('ERROR: 4-B anchor not found');
  process.exit(1);
}
code = code.replace(old4B, new4B);
console.log('✓ Fix 1: Section 4-B URL rule added');

// ─── Fix 2a: Remove \\ from Massagem Relaxante duration template ───────────
// "em 1 bolha" instruction contradicts \\ separators — remove \\
const oldDurTemplate = `"Qual duração você prefere?\\\\1️⃣ 1 hora\\\\2️⃣ 1 hora e meia"`;
const newDurTemplate = `"Qual duração você prefere?\\n1️⃣ 1 hora\\n2️⃣ 1 hora e meia"`;

// Try with actual escaping as it would appear in JSON-parsed jsCode
const oldDurInCode = '"Qual duração você prefere?\\\\1️⃣ 1 hora\\\\2️⃣ 1 hora e meia"';
const newDurInCode = '"Qual duração você prefere?\\n1️⃣ 1 hora\\n2️⃣ 1 hora e meia"';

if (code.includes(oldDurInCode)) {
  code = code.replace(oldDurInCode, newDurInCode);
  console.log('✓ Fix 2a: Duration template \\\\ → \\n (double-escaped)');
} else {
  // Try other escaping variant
  const alt1 = '"Qual duração você prefere?\\1️⃣ 1 hora\\2️⃣ 1 hora e meia"';
  const alt2 = '"Qual duração você prefere?\\n1️⃣ 1 hora\\n2️⃣ 1 hora e meia"';
  if (code.includes(alt1)) {
    code = code.replace(alt1, alt2);
    console.log('✓ Fix 2a: Duration template \\ → \\n (single-escaped)');
  } else {
    // Print context to debug
    const idx = code.indexOf('Qual duração você prefere?');
    console.log('DEBUG: Duration template context:');
    console.log(JSON.stringify(code.substring(idx - 5, idx + 80)));
    console.error('ERROR: Duration template anchor not found with any variant');
    process.exit(1);
  }
}

// ─── Fix 2b: After Massagem Relaxante confirmation, add explicit sim-rule ─
const oldMassConf = `Somente prossiga após o cliente confirmar.

Se escolher Drenagem Linfática`;
const newMassConf = `Somente prossiga após o cliente confirmar.
⚠️ QUANDO o cliente responder "sim", "ok", "pode", "correto", "isso", "certo", "sim pode", "pode ser" ou qualquer afirmativo após a mensagem "Perfeito! Então é Massagem Relaxante [1h ou 1h30], certo? 😊": prosseguir IMEDIATAMENTE para o passo 7.2 — NUNCA repetir a pergunta de duração. NUNCA pedir para o cliente escolher novamente. A confirmação com "sim" encerra definitivamente esta etapa.

Se escolher Drenagem Linfática`;

if (!code.includes(oldMassConf)) {
  console.error('ERROR: Massagem confirmation anchor not found');
  process.exit(1);
}
code = code.replace(oldMassConf, newMassConf);
console.log('✓ Fix 2b: Massagem Relaxante sim-rule added');

// ─── Fix 2c: After Drenagem confirmation, add same explicit sim-rule ──────
const oldDrenConf = `Após a resposta, CONFIRMAR em 1 bolha antes de continuar:
"Perfeito! Então é Drenagem Linfática [modalidade escolhida], certo? 😊"
Somente prossiga após o cliente confirmar.`;
const newDrenConf = `Após a resposta, CONFIRMAR em 1 bolha antes de continuar:
"Perfeito! Então é Drenagem Linfática [modalidade escolhida], certo? 😊"
Somente prossiga após o cliente confirmar.
⚠️ QUANDO o cliente responder "sim", "ok", "pode", "correto", "isso", "certo", ou qualquer afirmativo: prosseguir IMEDIATAMENTE para o passo 7.2 — NUNCA repetir a pergunta de modalidade. A confirmação com "sim" encerra definitivamente esta etapa.`;

if (!code.includes(oldDrenConf)) {
  console.error('ERROR: Drenagem confirmation anchor not found');
  process.exit(1);
}
code = code.replace(oldDrenConf, newDrenConf);
console.log('✓ Fix 2c: Drenagem Linfática sim-rule added');

// ─── Save ──────────────────────────────────────────────────────────────────
n.parameters.jsCode = code;
fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
console.log('✓ Saved', FILE);
