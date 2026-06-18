import json

AGENT_PATH = r'g:\Meu Drive\IT\Projetos\DamaresEstetica\agent\Agente_DamaresEstetica_HTTPRequest_v6.json'

with open(AGENT_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

for n in data['nodes']:
    if n['id'] != 'dm-init-conv':
        continue
    code = n['parameters']['jsCode']

    # FIX 4 — bug: bot mencionou feriado de 04/06 quando cliente pediu 05/06
    old4 = (
        'REGRA — SE O CLIENTE SOLICITAR DATA QUE É FERIADO:\n'
        '- Informar gentilmente que o dia é feriado e não há atendimento presencial\n'
        '- Perguntar se deseja escolher outra data\n'
        'Exemplo: "Infelizmente o dia 25/12 é Natal (feriado nacional) e não realizo atendimentos nessa data 🌿 '
        'Posso verificar uma data alternativa para você? 😊"\n\n'
        '⚠️ Verificar SEMPRE se a data solicitada é feriado ANTES de consultar disponibilidade no calendário.'
    )
    new4 = (
        'REGRA — SE O CLIENTE SOLICITAR DATA QUE É FERIADO:\n'
        '- Informar gentilmente que o dia é feriado e não há atendimento presencial\n'
        '- Perguntar se deseja escolher outra data\n'
        'Exemplo: "Infelizmente o dia 25/12 é Natal (feriado nacional) e não realizo atendimentos nessa data 🌿 '
        'Posso verificar uma data alternativa para você? 😊"\n\n'
        '⚠️ Verificar SEMPRE se a data solicitada é feriado ANTES de consultar disponibilidade no calendário.\n\n'
        '⚠️ REGRA CRÍTICA — NUNCA mencione feriados de datas que o cliente NÃO solicitou:\n'
        '- Verifique SOMENTE a data exata pedida pelo cliente.\n'
        '- Se o cliente pediu 05/06 e essa data é válida (não está na lista de proibidas): '
        'prossiga normalmente — NUNCA diga "além disso, o dia 04/06 é feriado" ou qualquer referência a datas vizinhas.\n'
        '- Feriados de datas NÃO solicitadas NÃO devem ser mencionados em hipótese alguma.\n'
        '- Só mencione um feriado se o cliente EXPLICITAMENTE pedir uma data que esteja na lista de proibidas.'
    )
    if old4 in code:
        code = code.replace(old4, new4)
        print('FIX 4 applied: Nunca mencionar feriados de datas não solicitadas')
    else:
        print('FIX 4 NOT FOUND — trying partial match...')
        partial = '⚠️ Verificar SEMPRE se a data solicitada é feriado ANTES de consultar disponibilidade no calendário.'
        if partial in code:
            code = code.replace(
                partial,
                partial + '\n\n'
                '⚠️ REGRA CRÍTICA — NUNCA mencione feriados de datas que o cliente NÃO solicitou:\n'
                '- Verifique SOMENTE a data exata pedida pelo cliente.\n'
                '- Se o cliente pediu 05/06 e essa data é válida (não está na lista de proibidas): '
                'prossiga normalmente — NUNCA diga "além disso, o dia 04/06 é feriado" ou referências a datas vizinhas.\n'
                '- Feriados de datas NÃO solicitadas NÃO devem ser mencionados.\n'
                '- Só mencione um feriado se o cliente EXPLICITAMENTE pedir uma data que esteja na lista de proibidas.'
            )
            print('FIX 4 applied via partial match')

    n['parameters']['jsCode'] = code
    break

with open(AGENT_PATH, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print('Done.')
