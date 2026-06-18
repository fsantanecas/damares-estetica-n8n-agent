"""
Aplica fixes de qualidade de conversa ao v8 → gera v9.
Fix A: após confirmação de endereço → prosseguir direto ao resumo (nunca re-exibir horários)
Fix B: HH:MM enviado pelo cliente = SEMPRE seleção de horário (nunca procedimento/sessão)
"""
import json

INPUT  = r'g:\Meu Drive\IT\Projetos\DamaresEstetica\agent\Agente_DamaresEstetica_HTTPRequest_v8.json'
OUTPUT = r'g:\Meu Drive\IT\Projetos\DamaresEstetica\agent\Agente_DamaresEstetica_HTTPRequest_v9.json'

with open(INPUT, 'r', encoding='utf-8') as f:
    data = json.load(f)

for n in data['nodes']:
    if n['id'] != 'dm-init-conv':
        continue
    code = n['parameters']['jsCode']

    # ── FIX A ─────────────────────────────────────────────────────────────────
    # Após confirmação do endereço → ir direto ao resumo, NUNCA re-exibir horários
    old_a = (
        'Somente após confirmação explícita prossiga com esse endereço.\n'
        '- Se o cliente confirmar mudança de endereço: pergunte o novo bairro/região antes de qualquer outra ação.'
    )
    new_a = (
        'Somente após confirmação explícita prossiga com esse endereço.\n'
        '\n'
        '⚠️ REGRA DE ESTADO — Após confirmação do endereço ("Ainda é o mesmo?"):\n'
        'Quando o cliente confirmar que o endereço está correto ("sim", "está correto", "correto", "é o mesmo", '
        '"permanece", "não mudou", "tá certo"):\n'
        '→ Verificar se todos os dados obrigatórios já foram coletados nesta conversa (procedimento, data, horário).\n'
        '→ Se SIM: prosseguir IMEDIATAMENTE para 7.4 (resumo do agendamento) — apresentar o resumo e perguntar "Posso prosseguir com a confirmação? 😊"\n'
        '→ ❌ PROIBIDO re-exibir a lista de horários disponíveis\n'
        '→ ❌ PROIBIDO re-chamar verificar_disponibilidade\n'
        '→ ❌ PROIBIDO re-perguntar procedimento, data ou horário que já foram confirmados nesta conversa\n'
        '→ O horário e demais dados já confirmados devem ser usados exatamente como foram acordados\n'
        '\n'
        '- Se o cliente confirmar mudança de endereço: pergunte o novo bairro/região antes de qualquer outra ação.'
    )
    if old_a in code:
        code = code.replace(old_a, new_a)
        print('FIX A aplicado: após confirmação de endereço → prosseguir ao resumo')
    else:
        print('FIX A NÃO ENCONTRADO — verificar âncora')

    # ── FIX B ─────────────────────────────────────────────────────────────────
    # HH:MM do cliente = SEMPRE seleção de horário, nunca procedimento/sessão
    old_b = (
        'REGRA DE ESTADO — Resposta ao "Qual funciona melhor para você?":\n'
        'Após apresentar a lista de horários, a PRÓXIMA mensagem do cliente É a escolha do horário. '
        'Qualquer número, horário ou resposta afirmativa:\n'
        '→ Confirmar em 1 mensagem: "Perfeito! Então é [HH:MM]. ✅" e prosseguir PARA 7.5 (resumo) ou par'
    )
    new_b = (
        '⚠️ REGRA GLOBAL — Mensagem com formato HH:MM é SEMPRE seleção de horário:\n'
        'Se o cliente enviar uma mensagem no formato HH:MM (ex: "8:00", "08:00", "9:00", "10:30", "15:00"):\n'
        '→ Interpretar SEMPRE como escolha de horário — independente do contexto da conversa\n'
        '→ ❌ PROIBIDO tratar HH:MM como número de opção de procedimento ou tipo de sessão\n'
        '→ ❌ PROIBIDO ignorar o horário e re-perguntar procedimento, data ou sessão\n'
        '→ Se estiver aguardando escolha de horário: confirmar "Perfeito! Então é [HH:MM]. ✅" e prosseguir\n'
        '→ Se o horário não estava sendo perguntado neste momento: confirmar educadamente que entendeu o horário e '
        'retomar o passo correto\n'
        '\n'
        'REGRA DE ESTADO — Resposta ao "Qual funciona melhor para você?":\n'
        'Após apresentar a lista de horários, a PRÓXIMA mensagem do cliente É a escolha do horário. '
        'Qualquer número, horário ou resposta afirmativa:\n'
        '→ Confirmar em 1 mensagem: "Perfeito! Então é [HH:MM]. ✅" e prosseguir PARA 7.5 (resumo) ou par'
    )
    if old_b in code:
        code = code.replace(old_b, new_b)
        print('FIX B aplicado: HH:MM = sempre seleção de horário')
    else:
        print('FIX B NÃO ENCONTRADO — verificar âncora')

    n['parameters']['jsCode'] = code
    break

with open(OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f'Salvo em {OUTPUT}')
