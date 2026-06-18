import json

AGENT_PATH = r'g:\Meu Drive\IT\Projetos\DamaresEstetica\agent\Agente_DamaresEstetica_HTTPRequest_v6.json'

with open(AGENT_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

for n in data['nodes']:
    if n['id'] != 'dm-init-conv':
        continue
    code = n['parameters']['jsCode']

    # ── FIX 1: Cliente recorrente — confirmar endereço antes de usar ──────────
    old1 = (
        'Para clientes RECORRENTES (Total de atendimentos > 0 no CONTEXTO_SISTEMA): '
        'se o campo Bairro constar no contexto, use-o diretamente sem perguntar. '
        'Se não constar, pergunte APENAS "Pode me informar seu bairro ou região? 😊" '
        '— uma pergunta simples, SEM repetir o menu de opções'
    )
    new1 = (
        'Para clientes RECORRENTES (Total de atendimentos > 0 no CONTEXTO_SISTEMA):\n'
        '- Se o campo Bairro ou Endereço constar no contexto: SEMPRE confirme antes de usar — '
        'pergunte: "Seu endereço cadastrado é [bairro/endereço]. Ainda é o mesmo? 😊" — '
        'NUNCA assuma o endereço/bairro diretamente sem confirmação. '
        'Somente após confirmação explícita prossiga com esse endereço.\n'
        '- Se o cliente confirmar mudança de endereço: pergunte o novo bairro/região antes de qualquer outra ação.\n'
        '- Se o campo Bairro NÃO constar no contexto: pergunte APENAS "Pode me informar seu bairro ou região? 😊" '
        '— uma pergunta simples, SEM repetir o menu de opções'
    )
    if old1 in code:
        code = code.replace(old1, new1)
        print('FIX 1 applied: Confirmação de endereço para clientes recorrentes')
    else:
        print('FIX 1 NOT FOUND')

    # ── FIX 2: Opção inválida no menu ─────────────────────────────────────────
    # Insert after the SELEÇÃO DE OPÇÃO block
    old2 = (
        'NÃO repita o menu. NÃO peça confirmação. Avance imediatamente para o fluxo correto.'
    )
    new2 = (
        'NÃO repita o menu. NÃO peça confirmação. Avance imediatamente para o fluxo correto.\n\n'
        '⚠️ OPÇÃO INVÁLIDA: Se o cliente enviar um número que NÃO existe nas opções apresentadas '
        '(ex: "4" quando o menu tem apenas 3 opções, ou "5", "6", etc.):\n'
        '→ Responda: "Hmm, não encontrei essa opção 😊 Por favor, escolha uma das opções disponíveis:" '
        'e reexiba a lista.\n'
        '→ NUNCA prossiga para o próximo passo com uma opção inexistente.\n'
        '→ NUNCA interprete um número fora do range como se fosse uma opção válida.'
    )
    if old2 in code:
        code = code.replace(old2, new2)
        print('FIX 2 applied: Opção inválida no menu')
    else:
        print('FIX 2 NOT FOUND')

    # ── FIX 3: Endereço sem bairro/cidade — validação obrigatória ─────────────
    old3 = (
        '- Se o cliente já disse o ENDEREÇO parcial (ex: "Rua Italia, 45"): '
        'NÃO pedir o endereço completo novamente. Completar apenas com o que faltar (complemento, se necessário).'
    )
    new3 = (
        '- Se o cliente já disse o ENDEREÇO parcial (ex: "Rua Italia, 45"): '
        'verificar se o bairro e cidade estão claros. '
        'Se o endereço contiver apenas rua e número SEM bairro e SEM cidade reconhecível, '
        'perguntar OBRIGATORIAMENTE: "Esse endereço fica em qual cidade e bairro? 😊" — '
        'NUNCA assumir cidade ou bairro a partir de uma rua sozinha. '
        'Somente após ter bairro E cidade confirmados, verificar se está na área de cobertura.'
    )
    if old3 in code:
        code = code.replace(old3, new3)
        print('FIX 3 applied: Validação de endereço sem bairro/cidade')
    else:
        print('FIX 3 NOT FOUND')

    # ── FIX 3b: Add address city rule in section 6 (geographic rules) ─────────
    old3b = (
        '⚠️ APÓS qualquer dessas mensagens: ENCERRAR a conversa — não oferecer menu, não continuar atendimento.'
    )
    new3b = (
        '⚠️ APÓS qualquer dessas mensagens: ENCERRAR a conversa — não oferecer menu, não continuar atendimento.\n\n'
        '⚠️ ENDEREÇO SEM CIDADE EXPLÍCITA: Se o cliente fornecer apenas rua e número (ex: "Rua Rodrigo Holtz, 949") '
        'sem mencionar bairro ou cidade:\n'
        '→ NUNCA assuma que é em São Paulo ou em qualquer outra cidade.\n'
        '→ Pergunte imediatamente: "Esse endereço fica em qual cidade e bairro? 😊"\n'
        '→ Somente após confirmar a cidade/bairro, aplicar as regras de cobertura (CASO A ou CASO B acima).'
    )
    if old3b in code:
        code = code.replace(old3b, new3b)
        print('FIX 3b applied: Regra de endereço sem cidade na seção 6')
    else:
        print('FIX 3b NOT FOUND')

    n['parameters']['jsCode'] = code
    break

with open(AGENT_PATH, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print('Done.')
