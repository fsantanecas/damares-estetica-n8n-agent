"""
Restaura BUSCA, DELETA e SEPARA para o formato v5 (estado funcional).
Mantém: Envia mensagem com $('Coleta'), nó Tem Mensagens?, fixes de prompt.
"""
import json

AGENT_PATH = r'g:\Meu Drive\IT\Projetos\DamaresEstetica\agent\Agente_DamaresEstetica_HTTPRequest_v6.json'
V5_PATH    = r'g:\Meu Drive\IT\Projetos\DamaresEstetica\agent\Agente_DamaresEstetica_HTTPRequest_v5.json'

with open(AGENT_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

with open(V5_PATH, 'r', encoding='utf-8') as f:
    v5 = json.load(f)

# Indexa nós do v5 por id
v5_nodes = {n['id']: n for n in v5['nodes']}

for n in data['nodes']:

    # Restaura BUSCA para operation:select com $execution.id (formato v5)
    if n['id'] == 'dm-busca':
        v5_busca = v5_nodes['dm-busca']['parameters']
        n['parameters'] = v5_busca
        print('Restaurado: BUSCA → operation:select com $execution.id')

    # Restaura DELETA para operation:deleteTable com $execution.id (formato v5)
    if n['id'] == 'dm-deleta':
        v5_deleta = v5_nodes['dm-deleta']['parameters']
        n['parameters'] = v5_deleta
        print('Restaurado: DELETA → operation:deleteTable com $execution.id')

    # Restaura SEPARA para versão v5 (mais simples, sem Set)
    if n['id'] == 'dm-separa':
        v5_separa = v5_nodes['dm-separa']['parameters']
        n['parameters'] = v5_separa
        print('Restaurado: SEPARA → versão v5')

with open(AGENT_PATH, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print('Done.')
