import json

AGENT_PATH = r'g:\Meu Drive\IT\Projetos\DamaresEstetica\agent\Agente_DamaresEstetica_HTTPRequest_v6.json'

with open(AGENT_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

for n in data['nodes']:

    # Fix 1: BUSCA — retorna source_id além de content
    if n['id'] == 'dm-busca':
        n['parameters']['query'] = "={{ 'SELECT content, source_id FROM messages WHERE id = ' + $execution.id }}"
        print('Fix 1: BUSCA retorna content + source_id')

    # Fix 2: SEPARA — embeds telefone em cada item para o loop body poder usar
    if n['id'] == 'dm-separa':
        n['parameters']['jsCode'] = (
            "const texto = ($input.first().json.output || '').trim();\n"
            "const telefone = ($('Coleta').first().json.telefone || '');\n"
            "const separador = '\\\\';\n"
            "const partes = texto.includes(separador)\n"
            "  ? texto.split(separador)\n"
            "  : [texto];\n"
            "const vistas = new Set();\n"
            "const unicas = [];\n"
            "for (const p of partes) {\n"
            "  const k = p.trim();\n"
            "  if (k && !vistas.has(k)) { vistas.add(k); unicas.push(k); }\n"
            "}\n"
            "return unicas.length > 0\n"
            "  ? unicas.map(p => ({ json: { item: p, telefone } }))\n"
            "  : [{ json: { item: texto, telefone } }];"
        )
        print('Fix 2: SEPARA embeds telefone em cada item')

    # Fix 3: Envia mensagem — usa telefone do $input (sem referencia a Coleta)
    if n['id'] == 'dm-envia-wpp':
        n['parameters']['jsCode'] = (
            "const telefone = $input.first().json.telefone || '';\n"
            "const toPhone = '+' + telefone.replace('@s.whatsapp.net', '');\n"
            "const items = $input.all();\n"
            "return items.map(item => {\n"
            "  const message = item.json.item;\n"
            "  const body = JSON.stringify({ from: '+5511994265257', to: toPhone, type: 'text', text: { body: message } });\n"
            "  return { json: { toPhone, message, body } };\n"
            "});"
        )
        print('Fix 3: Envia mensagem usa $input.first().json.telefone (sem Coleta)')

with open(AGENT_PATH, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print('Done.')
