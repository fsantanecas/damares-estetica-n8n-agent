import json, copy

src  = "g:/Meu Drive/IT/Projetos/DamaresEstetica/agent/Agente_DamaresEstetica_HTTPRequest_v6.json"
dest = "g:/Meu Drive/IT/Projetos/DamaresEstetica/agent/Agente_DamaresEstetica_HTTPRequest_v7.json"

with open(src, 'r', encoding='utf-8') as f:
    data = json.load(f)

nodes = data['nodes']
nodes_by_name = {n['name']: n for n in nodes}
changes = []

# ─────────────────────────────────────────────────────────────────────────────
# 1. Metadata
# ─────────────────────────────────────────────────────────────────────────────
data['_meta']['description'] = ("Agente WhatsApp Damares — BACKUP v7: Evolution API + OpenRouter (OpenAI-compat).")
data['name'] = 'Agente_DamaresEstetica_EvolutionAPI'
changes.append("v Metadata")

# ─────────────────────────────────────────────────────────────────────────────
# 2. Coleta — Evolution API payload
# ─────────────────────────────────────────────────────────────────────────────
col = nodes_by_name['Coleta']
for a in col['parameters']['assignments']['assignments']:
    nm = a['name']
    if nm == 'nome':
        a['value'] = "={{ $json.body.data && $json.body.data.pushName ? $json.body.data.pushName : 'Cliente' }}"
    elif nm == 'telefone':
        a['value'] = "={{ $json.body.data && $json.body.data.key ? $json.body.data.key.remoteJid : '' }}"
    elif nm == 'tipo':
        a['value'] = (
            "={{ ($json.body.data && $json.body.data.messageType === 'conversation') ? 'conversation' :"
            " ($json.body.data && $json.body.data.messageType === 'extendedTextMessage') ? 'extendedTextMessage' :"
            " ($json.body.data && ($json.body.data.messageType === 'audioMessage' || $json.body.data.messageType === 'pttMessage')) ? 'audioMessage' :"
            " ($json.body.data && $json.body.data.messageType === 'imageMessage') ? 'imageMessage' :"
            " ($json.body.data && $json.body.data.messageType === 'videoMessage') ? 'videoMessage' :"
            " ($json.body.data && $json.body.data.messageType ? $json.body.data.messageType : 'unknown') }}"
        )
    elif nm == 'mensagem':
        a['value'] = (
            "={{ ($json.body.data && $json.body.data.messageType === 'conversation') ? $json.body.data.message.conversation :"
            " ($json.body.data && $json.body.data.messageType === 'extendedTextMessage') ? $json.body.data.message.extendedTextMessage.text :"
            " ($json.body.data && $json.body.data.messageType === 'imageMessage') ? ('📷 Foto recebida' + ($json.body.data.message.imageMessage && $json.body.data.message.imageMessage.caption ? ': ' + $json.body.data.message.imageMessage.caption : '')) :"
            " ($json.body.data && ($json.body.data.messageType === 'audioMessage' || $json.body.data.messageType === 'pttMessage')) ? '🎵 Áudio recebido' :"
            " '[Mensagem recebida]' }}"
        )
    elif nm == 'fromMe':
        a['value'] = "={{ $json.body.data && $json.body.data.key ? $json.body.data.key.fromMe : true }}"
        a['type'] = 'boolean'
changes.append("v Coleta -> Evolution API")

# ─────────────────────────────────────────────────────────────────────────────
# 3. Code nodes body — YCloud -> Evolution API
# ─────────────────────────────────────────────────────────────────────────────
body_nodes = [
    'Envia mensagem para o WhatsApp', 'Envia Alerta Técnico', 'Resposta para Mídia',
    'Notifica Damares', 'Notifica Damares Cancelamento', 'Envia Avaliação ao Cliente',
    'Confirma Damares', 'Avisa Erro Número', 'Envia Pedido Avaliação',
]
for nname in body_nodes:
    n = nodes_by_name.get(nname)
    if not n: continue
    c = n['parameters']['jsCode']
    # Normalize toPhone extraction
    c = c.replace(
        "const toPhone = '+' + telefone.split('@')[0];",
        "const toPhone = telefone.replace('@s.whatsapp.net','').replace('+','');"
    )
    c = c.replace(
        "const toPhone = '+' + telefone.replace('@s.whatsapp.net', '').replace('+', '');",
        "const toPhone = telefone.replace('@s.whatsapp.net','').replace('+','');"
    )
    c = c.replace(
        "const toPhone = '+' + item.telefone.replace('@s.whatsapp.net', '').replace('+', '');",
        "const toPhone = item.telefone.replace('@s.whatsapp.net','').replace('+','');"
    )
    # Body format
    c = c.replace(
        "const body = JSON.stringify({ from: '+5511994265257', to: toPhone, type: 'text', text: { body: message } });",
        "const body = JSON.stringify({ number: toPhone, options: { delay: 0 }, textMessage: { text: message } });"
    )
    n['parameters']['jsCode'] = c
changes.append("v Body nodes -> Evolution API")

# ─────────────────────────────────────────────────────────────────────────────
# 4. Template nodes -> plain text Evolution API
# ─────────────────────────────────────────────────────────────────────────────
reeng_code = (
    "const item = $input.first().json;\n"
    "const toPhone = item.telefone.replace('@s.whatsapp.net','').replace('+','').replace(/\\D/g,'');\n"
    "const nome = item.nome ? item.nome.split(' ')[0] : 'querida';\n"
    "const message = 'Ol\\u00e1 ' + nome + '! \\uD83C\\uDF3F\\n\\nSentimos sua falta! Que tal agendar um momento especial de cuidado e bem-estar para voc\\u00ea? \\uD83D\\uDC86\\u200D\\u2640\\uFE0F\\n\\nEstamos prontas para atender voc\\u00ea com toda a aten\\u00e7\\u00e3o que voc\\u00ea merece \\u2728\\n\\n\\uD83D\\uDC49 Ver servi\\u00e7os: https://bit.ly/4tXlbne\\n\\nSer\\u00e1 um prazer te atender! \\uD83D\\uDE0A\\uD83C\\uDF3F';\n"
    "const body = JSON.stringify({ number: toPhone, options: { delay: 0 }, textMessage: { text: message } });\n"
    "return [{ json: { toPhone, body, id: item.id } }];"
)
lead_code = (
    "const item = $input.first().json;\n"
    "const toPhone = item.telefone.replace('@s.whatsapp.net','').replace('+','').replace(/\\D/g,'');\n"
    "const message = 'Ol\\u00e1! \\uD83D\\uDE0A\\nSou Damares, terapeuta esteticista especializada em massagens e procedimentos est\\u00e9ticos a domic\\u00edlio.\\n\\nLevo conforto, cuidado e bem-estar at\\u00e9 voc\\u00ea \\u2728\\n\\n\\uD83D\\uDCF2 Instagram: @damaresestetica\\n\\uD83C\\uDF10 Site: damaresestetica.com\\n\\nPosso te apresentar os servi\\u00e7os e valores dispon\\u00edveis? Ser\\u00e1 um prazer te atender! \\uD83D\\uDC86\\uD83C\\uDFFB\\u200D\\u2640\\uFE0F';\n"
    "const body = JSON.stringify({ number: toPhone, options: { delay: 0 }, textMessage: { text: message } });\n"
    "return [{ json: { toPhone, body } }];"
)
for nname, code in [('Envia Mensagem Follow-up', reeng_code), ('Envia Mensagem Lead', lead_code), ('Monta Mensagem Follow-up Manual', reeng_code)]:
    n = nodes_by_name.get(nname)
    if n: n['parameters']['jsCode'] = code
changes.append("v Templates -> plain text")

# ─────────────────────────────────────────────────────────────────────────────
# 5. HTTP nodes -> Evolution API
# ─────────────────────────────────────────────────────────────────────────────
EVO_URL  = "https://EVOLUTION_API_URL/message/sendText/EVOLUTION_INSTANCE"
EVO_CRED = {"httpHeaderAuth": {"id": "INSERIR_EVOLUTION_API_KEY", "name": "Evolution API Header Auth"}}
http_nodes = [
    'Envia Alerta Técnico HTTP', 'Resposta para Mídia HTTP', 'Notifica Damares HTTP',
    'Envia Mensagem Lead HTTP', 'Notifica Damares Cancelamento HTTP',
    'Envia Avaliação ao Cliente HTTP', 'Confirma Damares HTTP', 'Avisa Erro Número HTTP',
    'Envia Pedido Avaliação HTTP', 'Envia Mensagem Follow-up HTTP',
    'Envia mensagem para o WhatsApp HTTP', 'Envia Follow-up Manual HTTP',
]
for nname in http_nodes:
    n = nodes_by_name.get(nname)
    if not n: continue
    p = n['parameters']
    p['url'] = EVO_URL
    p['method'] = 'POST'
    p['authentication'] = 'genericCredentialType'
    p['genericAuthType'] = 'httpHeaderAuth'
    p.pop('nodeCredentialType', None)
    n['credentials'] = EVO_CRED
changes.append("v HTTP nodes -> Evolution API")

# ─────────────────────────────────────────────────────────────────────────────
# 6. Inicializa Conversa — OpenRouter format
# ─────────────────────────────────────────────────────────────────────────────
ic   = nodes_by_name['Inicializa Conversa']
code = ic['parameters']['jsCode']

code = code.replace("model: 'claude-sonnet-4-6'", "model: 'anthropic/claude-sonnet-4-6'")

old_tools = (
    'const tools = [\n'
    '  { name:"verificar_disponibilidade", description:"Consulta o Google Calendar da Damares e retorna eventos de um periodo. Use SEMPRE antes de confirmar horarios. Passe timeMin e timeMax em ISO 8601 com fuso -03:00. Ex: 2026-05-22T08:00:00-03:00.", input_schema:{ type:"object", properties:{ timeMin:{type:"string",description:"Datetime inicio ISO 8601 fuso -03:00"}, timeMax:{type:"string",description:"Datetime fim ISO 8601 fuso -03:00"}, bairro:{type:"string",description:"Bairro do cliente para calcular deslocamento"} }, required:["timeMin","timeMax"] } },\n'
    '  { name:"realizar_agendamento", description:"Cria agendamento na agenda da Damares. Use SOMENTE após coletar TODOS os dados. Inclua plano 5 sessoes ou sessao avulsa no campo service.", input_schema:{ type:"object", properties:{ client_name:{type:"string"}, client_phone:{type:"string"}, service:{type:"string"}, date:{type:"string"}, time:{type:"string"}, address:{type:"string"}, notes:{type:"string"} }, required:["client_name","client_phone","service","date","time","address"] } },\n'
    '  { name:"cancelar_agendamento", description:"Cancela agendamento existente. Use SOMENTE após cliente confirmar cancelamento.", input_schema:{ type:"object", properties:{ client_name:{type:"string"}, cancel_date:{type:"string",description:"DD/MM/YYYY"}, cancel_time:{type:"string",description:"HH:MM formato 24h"} }, required:["client_name","cancel_date","cancel_time"] } }\n'
    '];'
)
new_tools = (
    'const tools = [\n'
    '  { type:"function", function:{ name:"verificar_disponibilidade", description:"Consulta o Google Calendar da Damares e retorna eventos de um periodo. Use SEMPRE antes de confirmar horarios. Passe timeMin e timeMax em ISO 8601 com fuso -03:00. Ex: 2026-05-22T08:00:00-03:00.", parameters:{ type:"object", properties:{ timeMin:{type:"string",description:"Datetime inicio ISO 8601 fuso -03:00"}, timeMax:{type:"string",description:"Datetime fim ISO 8601 fuso -03:00"}, bairro:{type:"string",description:"Bairro do cliente para calcular deslocamento"} }, required:["timeMin","timeMax"] } } },\n'
    '  { type:"function", function:{ name:"realizar_agendamento", description:"Cria agendamento na agenda da Damares. Use SOMENTE após coletar TODOS os dados. Inclua plano 5 sessoes ou sessao avulsa no campo service.", parameters:{ type:"object", properties:{ client_name:{type:"string"}, client_phone:{type:"string"}, service:{type:"string"}, date:{type:"string"}, time:{type:"string"}, address:{type:"string"}, notes:{type:"string"} }, required:["client_name","client_phone","service","date","time","address"] } } },\n'
    '  { type:"function", function:{ name:"cancelar_agendamento", description:"Cancela agendamento existente. Use SOMENTE após cliente confirmar cancelamento.", parameters:{ type:"object", properties:{ client_name:{type:"string"}, cancel_date:{type:"string",description:"DD/MM/YYYY"}, cancel_time:{type:"string",description:"HH:MM formato 24h"} }, required:["client_name","cancel_date","cancel_time"] } } }\n'
    '];'
)
code = code.replace(old_tools, new_tools)

old_ret = (
    "return [{ json: { _state: { model: 'anthropic/claude-sonnet-4-6', max_tokens: 4096, "
    "system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }], "
    "messages: histMessages, tools: tools, telefone: telefoneColeta } } }];"
)
new_ret = (
    "const allMessages = [{ role: 'system', content: systemPrompt }, ...histMessages];\n"
    "return [{ json: { _state: { model: 'anthropic/claude-sonnet-4-6', max_tokens: 4096, "
    "messages: allMessages, tools: tools, telefone: telefoneColeta } } }];"
)
code = code.replace(old_ret, new_ret)

old_cache = (
    "if (tools && tools.length > 0) {\n"
    "  tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: { type: 'ephemeral' } };\n"
    "}"
)
code = code.replace(old_cache, "// cache_control nao aplicavel no OpenRouter")

ic['parameters']['jsCode'] = code
changes.append("v Inicializa Conversa -> OpenRouter + OpenAI tools + system as message")

# ─────────────────────────────────────────────────────────────────────────────
# 7. Chama Anthropic 1/2/3 -> OpenRouter
# ─────────────────────────────────────────────────────────────────────────────
OR_URL  = "https://openrouter.ai/api/v1/chat/completions"
OR_CRED = {"httpHeaderAuth": {"id": "INSERIR_OPENROUTER_API_KEY", "name": "OpenRouter Header Auth"}}
OR_BODY = "={{ JSON.stringify({ model: $json._state.model, max_tokens: $json._state.max_tokens, messages: $json._state.messages, tools: $json._state.tools }) }}"
OR_HEADERS = {"parameters": [
    {"name": "Content-Type", "value": "application/json"},
    {"name": "HTTP-Referer", "value": "https://damares-estetica.com"},
    {"name": "X-Title", "value": "Damares Estetica Agent"},
]}
for i in [1, 2, 3]:
    n = nodes_by_name.get(f'Chama Anthropic {i}')
    if not n: continue
    p = n['parameters']
    p['url']                  = OR_URL
    p['body']                 = OR_BODY
    p['headerParameters']     = OR_HEADERS
    p['authentication']       = 'genericCredentialType'
    p['genericAuthType']      = 'httpHeaderAuth'
    p.pop('nodeCredentialType', None)
    n['credentials']          = OR_CRED
    n['name']                 = f'Chama OpenRouter {i}'
changes.append("v Chama Anthropic -> Chama OpenRouter")

# ─────────────────────────────────────────────────────────────────────────────
# 8. É Tool Use? -> finish_reason === tool_calls
# ─────────────────────────────────────────────────────────────────────────────
for i in [1, 2, 3]:
    n = nodes_by_name.get(f'É Tool Use? ({i})')
    if not n: continue
    vals = n['parameters']['rules']['values']
    for v in vals:
        for c in v.get('conditions', {}).get('conditions', []):
            if 'stop_reason' in c.get('leftValue', ''):
                c['leftValue']  = "={{ $json.choices && $json.choices[0] && $json.choices[0].finish_reason }}"
                c['rightValue'] = "tool_calls"
changes.append("v É Tool Use? -> finish_reason === tool_calls")

# ─────────────────────────────────────────────────────────────────────────────
# 9. Extrai Resposta 1/2/3
# ─────────────────────────────────────────────────────────────────────────────
EXTRAI_RESP = (
    "const resp = $input.first().json;\n"
    "const text = (resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || '';\n"
    "return [{ json:{ output: text } }];"
)
for i in [1, 2, 3]:
    n = nodes_by_name.get(f'Extrai Resposta {i}')
    if n: n['parameters']['jsCode'] = EXTRAI_RESP
changes.append("v Extrai Resposta -> OpenAI choices")

# ─────────────────────────────────────────────────────────────────────────────
# 10. Extrai Tool Call 1/2/3
# ─────────────────────────────────────────────────────────────────────────────
def make_etc(state_src):
    return (
        f"const resp = $input.first().json;\n"
        f"const state = $('{state_src}').first().json._state;\n"
        f"const choice = resp.choices && resp.choices[0];\n"
        f"const toolCall = choice && choice.message && choice.message.tool_calls && choice.message.tool_calls[0];\n"
        f"if (!toolCall) {{\n"
        f"  const text = (choice && choice.message && choice.message.content) || '';\n"
        f"  return [{{ json:{{ output: text }} }}];\n"
        f"}}\n"
        f"let toolInput;\n"
        f"try {{ toolInput = JSON.parse(toolCall.function.arguments); }} catch(e) {{ toolInput = {{}}; }}\n"
        f"const assistantMsg = {{ role:'assistant', content: choice.message.content || null, tool_calls: choice.message.tool_calls }};\n"
        f"return [{{ json:{{ tool_use_id: toolCall.id, tool_name: toolCall.function.name, tool_input: toolInput, _state:{{ ...state, messages:[...state.messages, assistantMsg] }} }} }}];\n"
    )
nodes_by_name['Extrai Tool Call 1']['parameters']['jsCode'] = make_etc('Inicializa Conversa')
nodes_by_name['Extrai Tool Call 2']['parameters']['jsCode'] = make_etc('Adiciona Tool Result 1')
n3 = nodes_by_name.get('Extrai Tool Call 3')
if n3: n3['parameters']['jsCode'] = make_etc('Adiciona Tool Result 2')
changes.append("v Extrai Tool Call -> OpenAI function calling")

# ─────────────────────────────────────────────────────────────────────────────
# 11. Adiciona Tool Result 1/2 -> OpenAI tool message
# ─────────────────────────────────────────────────────────────────────────────
for i, src in [(1, 'Extrai Tool Call 1'), (2, 'Extrai Tool Call 2')]:
    n = nodes_by_name.get(f'Adiciona Tool Result {i}')
    if not n: continue
    n['parameters']['jsCode'] = (
        f"const toolResult = $input.first().json;\n"
        f"const toolCall = $('{src}').first().json;\n"
        f"const state = toolCall._state;\n"
        f"const toolResultMsg = {{ role:'tool', tool_call_id: toolCall.tool_use_id, content: JSON.stringify(toolResult) }};\n"
        f"return [{{ json:{{ _state:{{ ...state, messages:[...state.messages, toolResultMsg] }} }} }}];\n"
    )
changes.append("v Adiciona Tool Result -> OpenAI tool format")

# ─────────────────────────────────────────────────────────────────────────────
# 12. Log Métricas -> OpenRouter usage
# ─────────────────────────────────────────────────────────────────────────────
LOG_BASE = (
    "const resp = $input.first().json;\n"
    "const usage = resp.usage || {};\n"
    "const inputTokens  = usage.prompt_tokens     || usage.input_tokens  || 0;\n"
    "const outputTokens = usage.completion_tokens || usage.output_tokens || 0;\n"
    "const PRICE_INPUT  = 3.00;\n"
    "const PRICE_OUTPUT = 15.00;\n"
    "const totalUSD = ((inputTokens * PRICE_INPUT) + (outputTokens * PRICE_OUTPUT)) / 1_000_000;\n"
    "const telefone = $('Coleta').first().json.telefone.replace('@s.whatsapp.net','');\n"
    "return [{ json: {\n"
    "  input_tokens: inputTokens, output_tokens: outputTokens,\n"
    "  cache_creation_tokens: 0, cache_read_tokens: 0,\n"
    "  custo_estimado_usd: totalUSD, telefone,\n"
    "  iteracao: ITER_NUM,\n"
    "  model: resp.model || 'anthropic/claude-sonnet-4-6'\n"
    "} }];\n"
)
for i in [1, 2, 3]:
    n = nodes_by_name.get(f'Log Métricas Claude {i}')
    if n: n['parameters']['jsCode'] = LOG_BASE.replace('ITER_NUM', str(i))
changes.append("v Log Metricas -> OpenRouter usage format")

# ─────────────────────────────────────────────────────────────────────────────
# 13. Documentação
# ─────────────────────────────────────────────────────────────────────────────
doc = nodes_by_name.get('Documentação Geral')
if doc:
    doc['parameters']['content'] = (
        "## 🌿 Agente Damares — Estética Home Care\n\n"
        "**VERSÃO BACKUP v7 — Evolution API + OpenRouter**\n\n"
        "**Diferenças em relação ao v6 (YCloud + Anthropic):**\n"
        "- WhatsApp: Evolution API (self-hosted) no lugar do YCloud\n"
        "- LLM: OpenRouter (multi-model) no lugar da Anthropic direta\n"
        "- Templates: convertidos para mensagens de texto simples\n\n"
        "**Credenciais a configurar:**\n"
        "1. `Evolution API Header Auth` — Header Auth, name: `apikey`, value: sua API key\n"
        "2. `OpenRouter Header Auth` — Header Auth, name: `Authorization`, value: `Bearer <sua-key>`\n\n"
        "**Substituir nos HTTP nodes:**\n"
        "- `EVOLUTION_API_URL` → ex: https://evo.seudominio.com\n"
        "- `EVOLUTION_INSTANCE` → nome da sua instancia Evolution\n\n"
        "**Webhook Evolution API:**\n"
        "Configure Events: `messages.upsert`\n"
        "URL: `<n8n-url>/webhook/damares-estetica-wpp`\n\n"
        "**Modelos OpenRouter sugeridos:**\n"
        "- `anthropic/claude-sonnet-4-6` (padrao — mesmo comportamento)\n"
        "- `google/gemini-2.5-flash` (mais barato)\n"
        "- `openai/gpt-4o`\n\n"
        "Altere o model em `Inicializa Conversa` → linha `model: 'anthropic/...'`"
    )
changes.append("v Documentacao atualizada")

# ─────────────────────────────────────────────────────────────────────────────
# Save
# ─────────────────────────────────────────────────────────────────────────────
with open(dest, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("\n".join(changes))
print(f"\nTotal: {len(changes)} grupos")
