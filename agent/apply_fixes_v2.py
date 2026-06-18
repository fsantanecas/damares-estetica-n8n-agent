import json

with open(r'g:\Meu Drive\IT\Projetos\DamaresEstetica\agent\Agente_DamaresEstetica_HTTPRequest_v6.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for n in data['nodes']:

    # ── FIX 1  section 7.1 "Qual procedimento?" ────────────────────────────
    if n['id'] == 'dm-init-conv':
        code = n['parameters']['jsCode']

        # Fix 1a: "Qual procedimento?" single bubble warning
        marker  = 'Perguntar em 1 bolha:\n"Qual procedimento você deseja agendar?'
        end_m   = '\n\nSe escolher Massagem Relaxante'
        idx     = code.find(marker)
        end_idx = code.find(end_m, idx)
        if idx >= 0 and end_idx >= 0:
            new_block = (
                'Perguntar em UMA ÚNICA bolha '
                '(⚠️ PROIBIDO usar separador de bolhas — a lista inteira fica numa SÓ mensagem. '
                'NUNCA repita as opções em segunda bolha):\n'
                '"Qual procedimento você deseja agendar? \U0001f33f\n'
                '1️⃣ Massagem Relaxante\n'
                '2️⃣ Drenagem Linfática\n'
                '3️⃣ Pós-operatório"\n'
                '⚠️ REGRA CRÍTICA: UMA SÓ bolha — não use separador antes nem depois da lista.'
            )
            code = code[:idx] + new_block + code[end_idx:]
            print('FIX 1 applied: Qual procedimento UMA UNICA bolha')
        else:
            print(f'FIX 1 NOT FOUND idx={idx} end_idx={end_idx}')

        # Fix 2: strengthen REGRA DE ESTADO section 7.5
        old_75_start = 'REGRA DE ESTADO — Após "Posso prosseguir com a confirmação?":'
        idx75 = code.find(old_75_start)
        if idx75 >= 0:
            # Find the block end (next \n\n⚠️ or next section separator)
            end75 = code.find('\n→ Executar o agendamento diretamente com os dados do resumo', idx75)
            if end75 >= 0:
                end75 += len('\n→ Executar o agendamento diretamente com os dados do resumo')
                new_75 = (
                    'REGRA DE ESTADO — Após "Posso prosseguir com a confirmação?":\n'
                    'A PRÓXIMA mensagem do cliente É a confirmação do agendamento. '
                    '"sim", "ok", "pode", "correto", "isso", "confirmo", "tá", "sim pode", "pode ser":\n'
                    '→ Chamar IMEDIATAMENTE realizar_agendamento com os dados EXATOS do resumo apresentado\n'
                    '→ ❌ PROIBIDO re-chamar verificar_disponibilidade — horário JÁ consultado, escolhido e confirmado no resumo\n'
                    '→ ❌ PROIBIDO re-exibir lista de horários — horário já está no resumo\n'
                    '→ ❌ PROIBIDO repetir perguntas sobre procedimento, data, horário ou endereço\n'
                    '→ O resumo foi apresentado e confirmado: chamar realizar_agendamento DIRETAMENTE\n'
                    '⚠️ MESMO se houver dúvida sobre o horário: NÃO verificar novamente. '
                    'Usar o horário que está no resumo.'
                )
                code = code[:idx75] + new_75 + code[end75:]
                print('FIX 2 applied: REGRA DE ESTADO 7.5 fortalecida')
            else:
                print('FIX 2: end marker not found')
        else:
            print('FIX 2 NOT FOUND')

        n['parameters']['jsCode'] = code

    # ── FIX 3  history LIMIT 20 → 30 ───────────────────────────────────────
    if n['id'] == 'dm-conv-hist-busca':
        p = n.get('parameters', {})
        q = p.get('query', '')
        if 'LIMIT 20' in q:
            p['query'] = q.replace('LIMIT 20', 'LIMIT 30')
            n['parameters'] = p
            print('FIX 3 applied: history LIMIT 20 -> 30')
        else:
            print('FIX 3 NOT FOUND:', repr(q[:100]))

with open(r'g:\Meu Drive\IT\Projetos\DamaresEstetica\agent\Agente_DamaresEstetica_HTTPRequest_v6.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print('Done.')
