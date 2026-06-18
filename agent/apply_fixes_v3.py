import json

# ─────────────────────────────────────────────────────────────────────────────
# FIX A — Buffer: BUSCA e DELETA por telefone+janela de tempo em vez de execution.id
#          + deduplicação de conteúdo no AGRUPA
# ─────────────────────────────────────────────────────────────────────────────
AGENT_PATH = r'g:\Meu Drive\IT\Projetos\DamaresEstetica\agent\Agente_DamaresEstetica_HTTPRequest_v6.json'
SYNC_PATH  = r'g:\Meu Drive\IT\Projetos\DamaresEstetica\agent\Sync_MinhaAgenda_GoogleCalendar.json'

with open(AGENT_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

nodes = data['nodes']
conns = data['connections']

for n in nodes:

    # ── Fix A1: BUSCA MENSAGENS → por telefone + janela 9 segundos ──────────
    if n['id'] == 'dm-busca':
        n['parameters'] = {
            'operation': 'executeQuery',
            'query': (
                "SELECT content FROM messages "
                "WHERE source_id = REPLACE('{{ $('Coleta').first().json.telefone }}', '@s.whatsapp.net', '') "
                "AND created_at > NOW() - INTERVAL '9 seconds' "
                "ORDER BY created_at ASC"
            ),
            'options': {}
        }
        print('Fix A1 applied: BUSCA por telefone+janela')

    # ── Fix A2: DELETA MENSAGENS → por telefone + janela 9 segundos ─────────
    if n['id'] == 'dm-deleta':
        n['parameters'] = {
            'operation': 'executeQuery',
            'query': (
                "DELETE FROM messages "
                "WHERE source_id = REPLACE('{{ $('Coleta').first().json.telefone }}', '@s.whatsapp.net', '') "
                "AND created_at > NOW() - INTERVAL '9 seconds'"
            ),
            'options': {}
        }
        print('Fix A2 applied: DELETA por telefone+janela')

    # ── Fix A3: SEPARA MENSAGENS → deduplica linhas (evita "1\n1") ──────────
    if n['id'] == 'dm-separa':
        old_code = n['parameters']['jsCode']
        new_code = r"""const texto = ($input.first().json.output || "").trim();
const separador = "\\";
const partes = texto.includes(separador)
  ? texto.split(separador)
  : [texto];
// Deduplica partes idênticas (evita bolhas duplicadas por webhook duplo)
const vistas = new Set();
const unicas = [];
for (const p of partes) {
  const k = p.trim();
  if (k && !vistas.has(k)) { vistas.add(k); unicas.push(k); }
}
return unicas.length > 0
  ? unicas.map(p => ({ json: { item: p } }))
  : [{ json: { item: texto } }];"""
        n['parameters']['jsCode'] = new_code
        print('Fix A3 applied: SEPARA deduplica bolhas idênticas')

# ── Fix A4: adicionar IF após BUSCA para parar se não há mensagens ──────────
# Verifica se já existe o nó dm-has-msgs
has_node = any(nd['id'] == 'dm-has-msgs' for nd in nodes)
if not has_node:
    # Descobrir posição do dm-busca para posicionar o IF logo após
    busca_pos = next((nd['position'] for nd in nodes if nd['id'] == 'dm-busca'), [480, 0])
    # Inserir nó IF entre BUSCA e AGRUPA
    if_node = {
        'id': 'dm-has-msgs',
        'name': 'Tem Mensagens?',
        'type': 'n8n-nodes-base.if',
        'typeVersion': 2,
        'position': [busca_pos[0] + 220, busca_pos[1]],
        'parameters': {
            'conditions': {
                'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'loose', 'version': 2},
                'conditions': [{
                    'id': 'chk-has-msgs',
                    'leftValue': '={{ $input.all().length }}',
                    'rightValue': 0,
                    'operator': {'type': 'number', 'operation': 'gt'}
                }],
                'combinator': 'and'
            },
            'options': {}
        }
    }
    nodes.append(if_node)

    # Redirecionar: BUSCA → Tem Mensagens? → AGRUPA (true) | stop (false)
    busca_targets = conns.get('BUSCA MENSAGENS DO USUÁRIO', {}).get('main', [[]])
    original_next = busca_targets[0][0]['node'] if busca_targets and busca_targets[0] else 'AGRUPA MENSAGENS'
    conns['BUSCA MENSAGENS DO USUÁRIO'] = {
        'main': [[{'node': 'Tem Mensagens?', 'type': 'main', 'index': 0}]]
    }
    conns['Tem Mensagens?'] = {
        'main': [
            [{'node': original_next, 'type': 'main', 'index': 0}],  # true → AGRUPA
            []  # false → stop
        ]
    }
    print('Fix A4 applied: IF "Tem Mensagens?" adicionado entre BUSCA e AGRUPA')
else:
    print('Fix A4 already present: dm-has-msgs exists')

with open(AGENT_PATH, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print()

# ─────────────────────────────────────────────────────────────────────────────
# FIX B — Sync workflow: atualiza credential dos nós de Drive
# ─────────────────────────────────────────────────────────────────────────────
DRIVE_NODES = ['Lista Arquivos Drive', 'Download XLSX', 'Move para Processados']
DRIVE_CRED  = {'googleDriveOAuth2Api': {'id': 'SUBSTITUIR_ID', 'name': 'google-drive-damares'}}

with open(SYNC_PATH, 'r', encoding='utf-8') as f:
    sync = json.load(f)

for n in sync['nodes']:
    if n['name'] in DRIVE_NODES:
        n['credentials'] = DRIVE_CRED
        n['parameters']['nodeCredentialType'] = 'googleDriveOAuth2Api'
        print(f'Fix B applied: {n["name"]} → googleDriveOAuth2Api')

with open(SYNC_PATH, 'w', encoding='utf-8') as f:
    json.dump(sync, f, ensure_ascii=False, indent=2)

print()
print('Todos os fixes aplicados.')
