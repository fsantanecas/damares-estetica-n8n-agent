import json

AGENT_PATH = r'g:\Meu Drive\IT\Projetos\DamaresEstetica\agent\Agente_DamaresEstetica_HTTPRequest_v6.json'

with open(AGENT_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

for n in data['nodes']:

    # Reverte SEPARA para estado sem telefone (como estava antes de apply_fixes_v5)
    if n['id'] == 'dm-separa':
        n['parameters']['jsCode'] = (
            'const texto = ($input.first().json.output || "").trim();\n'
            'const separador = "\\\\";\n'
            'const partes = texto.includes(separador)\n'
            '  ? texto.split(separador)\n'
            '  : [texto];\n'
            'const vistas = new Set();\n'
            'const unicas = [];\n'
            'for (const p of partes) {\n'
            '  const k = p.trim();\n'
            '  if (k && !vistas.has(k)) { vistas.add(k); unicas.push(k); }\n'
            '}\n'
            'return unicas.length > 0\n'
            '  ? unicas.map(p => ({ json: { item: p } }))\n'
            '  : [{ json: { item: texto } }];'
        )
        print('Revertido: SEPARA sem telefone (estado original)')

    # Reverte Envia mensagem para usar $("Coleta") como no original que funcionava
    if n['id'] == 'dm-envia-wpp':
        n['parameters']['jsCode'] = (
            'const telefone = $("Coleta").first().json.telefone;\n'
            'const toPhone = "+" + telefone.split("@")[0];\n'
            'const items = $input.all();\n'
            'return items.map(item => {\n'
            '  const message = item.json.item;\n'
            '  const body = JSON.stringify({ from: "+5511994265257", to: toPhone, type: "text", text: { body: message } });\n'
            '  return { json: { toPhone, message, body } };\n'
            '});'
        )
        print('Revertido: Envia mensagem usa $("Coleta") como original')

with open(AGENT_PATH, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print('Done.')
