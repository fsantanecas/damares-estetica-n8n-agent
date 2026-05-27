const fs = require('fs');

const FILE = 'Agente_DamaresEstetica_HTTPRequest.json';
const wf = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const n = wf.nodes.find(x => x.name === 'Inicializa Conversa');
let code = n.parameters.jsCode;

let fixes = 0;

function replace(oldStr, newStr, label) {
  if (!code.includes(oldStr)) {
    console.error('ERROR: anchor not found for:', label);
    console.error('Looking for:', JSON.stringify(oldStr.substring(0, 80)));
    process.exit(1);
  }
  code = code.replace(oldStr, newStr);
  console.log('✓', label);
  fixes++;
}

// ─── Fix 1: Re-asking for data already provided in 7.3 ────────────────────
replace(
  `--------------------------------------------------
7.3 — Coletar Dados Obrigatórios
--------------------------------------------------

Caso ainda não informado, solicitar:`,
  `--------------------------------------------------
7.3 — Coletar Dados Obrigatórios
--------------------------------------------------

⚠️ VERIFICAR ANTES DE SOLICITAR: Antes de pedir qualquer dado abaixo, verificar se o cliente já o forneceu nesta conversa. NÃO repetir perguntas para informações já mencionadas.
- Se o cliente já disse a DATA (ex: "amanhã", "sexta", "dia 30/05"): NÃO perguntar a data novamente. Usar a data informada.
- Se o cliente já disse o HORÁRIO (ex: "às 08:00", "de manhã cedo"): NÃO perguntar o horário novamente.
- Se o cliente já disse o ENDEREÇO parcial (ex: "Rua Italia, 45"): NÃO pedir o endereço completo novamente. Completar apenas com o que faltar (complemento, se necessário).
- Se o cliente já informou o BAIRRO anteriormente: NÃO perguntar o bairro.

Caso ainda não informado, solicitar:`,
  'Fix 1: Add "don\'t re-ask" rule in 7.3'
);

// ─── Fix 2: Thursday restriction when client proposes a time ──────────────
replace(
  `- QUINTA-FEIRA — horários reduzidos (exceção fixa):
  • Somente 10:00–11:30 ou 14:30–15:30
  • Nunca oferecer outros horários às quintas`,
  `- QUINTA-FEIRA — horários reduzidos (exceção fixa):
  • Somente 10:00–11:30 ou 14:30–15:30
  • Nunca oferecer outros horários às quintas
  • ⚠️ MESMO QUANDO O CLIENTE PROPÕE UM HORÁRIO ÀS QUINTAS: se o horário proposto estiver fora desses intervalos (ex: "08:00", "09:00", "16:00", "19:00"), RECUSAR IMEDIATAMENTE antes de verificar disponibilidade. Nunca confirmar "tenho disponibilidade" para horário inválido em quinta-feira.
  • Resposta ao recusar horário inválido em quinta: "Nas quintas-feiras meus horários são restritos 🌿 Tenho disponibilidade somente entre 10:00–11:30 ou 14:30–15:30. Algum desses horários funciona para você? 😊"`,
  'Fix 2a: Thursday restriction also applies to client-proposed times'
);

replace(
  `PASSO 3 — QUINTA-FEIRA:
- Se a data for uma quinta-feira: informar ANTES de verificar disponibilidade que os horários na quinta são restritos: apenas 10:00–11:00 ou 14:30–15:30.
- Perguntar se esses horários funcionam antes de prosseguir.`,
  `PASSO 3 — QUINTA-FEIRA:
- Se a data for uma quinta-feira: verificar IMEDIATAMENTE se o horário pretendido (proposto pelo cliente ou ainda não definido) está dentro de 10:00–11:30 ou 14:30–15:30.
- Se o horário PROPOSTO PELO CLIENTE for inválido (fora desses intervalos): RECUSAR o horário e informar a restrição ANTES de qualquer outra ação.
- Se o horário ainda não foi definido: informar a restrição e perguntar qual horário funciona.
- NUNCA chamar verificar_disponibilidade com um horário inválido em quinta-feira.`,
  'Fix 2b: Strengthen Thursday rule in 7.3b'
);

// ─── Fix 3: Prevent premature section 9 content and duplicate payment ask ─
replace(
  `⚠️ NÃO enviar antes da confirmação de pagamento — o agendamento é PENDENTE até este momento.
⚠️ Somente após esta confirmação o agendamento está CONCLUÍDO.
⚠️ Se o cliente digitar "1" ou pedir para voltar ao menu após a confirmação, exibir o menu inicial — neste caso específico é permitido pois é uma solicitação explícita do cliente.`,
  `⚠️ NÃO enviar antes da confirmação de pagamento — o agendamento é PENDENTE até este momento.
⚠️ Somente após esta confirmação o agendamento está CONCLUÍDO.
⚠️ Se o cliente digitar "1" ou pedir para voltar ao menu após a confirmação, exibir o menu inicial — neste caso específico é permitido pois é uma solicitação explícita do cliente.
⚠️ NUNCA enviar estas mensagens da seção 9 junto com ou imediatamente após realizar_agendamento. Elas só devem ser enviadas quando o cliente EXPLICITAMENTE confirmar o pagamento (ex: "paguei", "fiz o pix", "já transferi", "sim, realizado", "enviei").
⚠️ Quando o cliente responder "ok", "tá", "entendi", "certo" às mensagens desta seção 9 (após o pagamento já ter sido confirmado), responder naturalmente (ex: "🌿 Qualquer dúvida é só me chamar!") SEM re-perguntar sobre pagamento nem repetir o resumo do agendamento.`,
  'Fix 3: Prevent premature section 9 and duplicate payment question'
);

// ─── Fix 4: Cancellation must actually call the tool ──────────────────────
replace(
  `Fluxo de cancelamento:
- Solicitar ao cliente: nome completo com sobrenome, data e horário do agendamento a cancelar
- Confirmar com o cliente os dados antes de cancelar
- Após confirmação, usar a ferramenta cancelar_agendamento com: client_name, cancel_date (DD/MM/YYYY), cancel_time (HH:MM)
- Após o cancelamento, confirmar ao cliente e orientar sobre reembolso conforme política`,
  `Fluxo de cancelamento:
- Solicitar ao cliente: nome completo com sobrenome, data e horário do agendamento a cancelar
- Confirmar com o cliente os dados antes de cancelar (ex: "Vou cancelar o agendamento de [Nome] em [DD/MM/YYYY] às [HH:MM]. Confirma? 😊")
- ⚠️ AÇÃO OBRIGATÓRIA: Assim que o cliente confirmar (ex: "sim", "pode cancelar", "confirmo", "isso mesmo"), IMEDIATAMENTE chamar cancelar_agendamento. NÃO confirmar verbalmente sem chamar a ferramenta — a ferramenta DEVE ser chamada.
- Se cancelar_agendamento retornar sucesso: confirmar ao cliente com os dados do cancelamento e orientar sobre reembolso conforme política.
- Se cancelar_agendamento retornar erro (agendamento não encontrado): informar gentilmente "Não encontrei esse agendamento na agenda 🌿 Pode verificar o nome completo, a data (DD/MM/YYYY) e o horário exato?" e tentar novamente com os dados corrigidos.`,
  'Fix 4: Cancellation must call the tool, with explicit trigger and error handling'
);

n.parameters.jsCode = code;
fs.writeFileSync(FILE, JSON.stringify(wf, null, 2));
console.log(`\n✓ Saved ${FILE} (${fixes} fixes applied)`);
