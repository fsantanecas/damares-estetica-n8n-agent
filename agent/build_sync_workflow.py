import json

FOLDER_SYNC = '1qH9D31OI6qtI2OlTfCaQaJ3lrv-oOioG'
FOLDER_PROC = '1p5DPJtp3lLq6T8hsewk67K72ZqAuAN6y'
CALENDAR_ID_ENC = 'damaresesteticasp%40gmail.com'
YCLOUD_KEY = 'ea53799239658212b3a8be3befbffff9'
GCAL_CRED_ID = 'w6Tw24lXeRMlXejy'
GCAL_CRED_NAME = 'calendar-damares-n8n'

CODE_FILTER = r"""// Filtra arquivos XLSX na lista retornada pelo Drive
const files = $input.all().map(i => i.json.files || []).flat();
const xlsx = files.filter(f => f.name && f.name.toLowerCase().endsWith('.xlsx') && !f.trashed);
if (xlsx.length === 0) {
  return [{ json: { hasFile: false, fileId: null, fileName: null } }];
}
const f = xlsx[0];
return [{ json: { hasFile: true, fileId: f.id, fileName: f.name } }];"""

CODE_PARSE = r"""// Parse das linhas do XLSX, filtra datas futuras
const fileId = $('Filtrar XLSX').first().json.fileId;
const fileName = $('Filtrar XLSX').first().json.fileName;

const now = new Date();
const nowBRT = new Date(now.getTime() - 3 * 60 * 60 * 1000);
const todayISO = nowBRT.toISOString().split('T')[0];

const futureEvents = [];

for (const item of $input.all()) {
  const row = item.json;
  const dataStr = String(row['Data'] || '');
  if (!dataStr || dataStr === 'Data') continue;

  const dateMatch = dataStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!dateMatch) continue;
  const [, dd, mm, yyyy] = dateMatch;
  const dateISO = `${yyyy}-${mm}-${dd}`;
  if (dateISO < todayISO) continue;

  const horario = String(row['Horário'] || '').trim();
  const timeParts = horario.split(' às ');
  if (timeParts.length !== 2) continue;
  const startTime = timeParts[0].trim();
  const endTime = timeParts[1].trim();
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) continue;

  const cliente = String(row['Cliente'] || '').trim();
  const servico = String(row['Serviço(s)'] || row['Servico(s)'] || '').trim();
  if (!cliente || !servico) continue;

  futureEvents.push({
    eventKey: `${dateISO}T${startTime}`,
    startDT: `${dateISO}T${startTime}:00-03:00`,
    endDT: `${dateISO}T${endTime}:00-03:00`,
    cliente,
    servico
  });
}

return [{ json: { futureEvents, fileId, fileName, todayISO } }];"""

CODE_COMPARE = r"""// Compara eventos do XLSX com os do Google Calendar
const parsedData = $('Parse Linhas XLSX').first().json;
const futureEvents = parsedData.futureEvents;
const fileId = parsedData.fileId;
const fileName = parsedData.fileName;

const gcalItems = ($input.first().json.items || []);

const existingKeys = new Set();
for (const ev of gcalItems) {
  const dt = ev.start && (ev.start.dateTime || ev.start.date);
  if (!dt) continue;
  const m = dt.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  if (m) existingKeys.add(m[1]);
}

const creates = futureEvents.filter(ev => !existingKeys.has(ev.eventKey));

return [{ json: { creates, fileId, fileName, totalFuture: futureEvents.length } }];"""

CODE_EXPAND = r"""// Expande array de creates em itens individuais
const data = $input.first().json;
return data.creates.map(ev => ({
  json: {
    summary: `[MA] ${ev.cliente} — ${ev.servico}`,
    startDT: ev.startDT,
    endDT: ev.endDT,
    fileId: data.fileId,
    fileName: data.fileName
  }
}));"""

CODE_AGGREGATE = r"""// Agrega resultados em 1 item com contagem
const items = $input.all();
const fileId = items[0].json.fileId;
const fileName = items[0].json.fileName;
return [{ json: { created: items.length, fileId, fileName } }];"""

CODE_NOTIFY = r"""// Monta mensagem WhatsApp para a Damares
const item = $input.first().json;
const created = item.created || 0;
const fileName = item.fileName || '';

const now = new Date();
const nowBRT = new Date(now.getTime() - 3 * 60 * 60 * 1000);
const hora = nowBRT.toISOString().substring(11, 16);
const dia = nowBRT.toISOString().substring(0, 10).split('-').reverse().join('/');

let msg;
if (created > 0) {
  msg = `🌿 *Sync Minha Agenda concluído!*\n✅ ${created} novo(s) agendamento(s) adicionado(s) ao Google Calendar\n📁 ${fileName}\n🕐 ${dia} às ${hora} (Brasília)`;
} else {
  msg = `🌿 *Sync Minha Agenda concluído!*\nℹ️ Nenhum novo agendamento encontrado (todos já estavam no Google Calendar)\n📁 ${fileName}\n🕐 ${dia} às ${hora} (Brasília)`;
}

const body = JSON.stringify({
  from: '+5511994265257',
  to: '+5511999950549',
  type: 'text',
  text: { body: msg }
});
return [{ json: { body } }];"""

GCAL_BODY = '={\n  "summary": "{{ $json.summary }}",\n  "start": { "dateTime": "{{ $json.startDT }}", "timeZone": "America/Sao_Paulo" },\n  "end": { "dateTime": "{{ $json.endDT }}", "timeZone": "America/Sao_Paulo" },\n  "description": "Sincronizado via Minha Agenda"\n}'

cred = {'googleCalendarOAuth2Api': {'id': GCAL_CRED_ID, 'name': GCAL_CRED_NAME}}

workflow = {
    '_meta': {'description': 'Sync Minha Agenda → Google Calendar. 2x por dia.'},
    'name': 'Sync_MinhaAgenda_GoogleCalendar',
    'nodes': [
        {
            'id': 'dm-ma-note', 'name': 'Documentação Sync',
            'type': 'n8n-nodes-base.stickyNote', 'typeVersion': 1,
            'position': [-200, -340],
            'parameters': {
                'content': '## 🔄 Sync Minha Agenda → Google Calendar\n\n**Frequência:** 2x por dia (08:00 e 18:00, seg–sáb)\n\n**Fluxo:**\n1. Lista XLSX na pasta `Agenda_Sync` do Drive\n2. Baixa e lê o arquivo\n3. Filtra agendamentos futuros\n4. Compara com Google Calendar (próximos 90 dias)\n5. Cria eventos **[MA]** para os novos\n6. Move XLSX para `processados`\n7. Notifica Damares via WhatsApp\n\n**Credenciais necessárias:**\n- `calendar-damares-n8n` — Google Calendar OAuth2 (já existe no agente principal)\n  ⚠️ A conta Google precisa ter escopo de Drive também\n  (ou criar credencial separada Google Drive OAuth2)\n\n**Pasta Agenda_Sync:** `1qH9D31OI6qtI2OlTfCaQaJ3lrv-oOioG`\n**Pasta processados:** `1p5DPJtp3lLq6T8hsewk67K72ZqAuAN6y`',
                'height': 360, 'width': 540, 'color': 4
            }
        },
        {
            'id': 'dm-ma-trigger', 'name': 'Agendador Sync',
            'type': 'n8n-nodes-base.scheduleTrigger', 'typeVersion': 1.2,
            'position': [0, 0],
            'parameters': {
                'rule': {'interval': [
                    {'field': 'cronExpression', 'expression': '0 8 * * 1-6'},
                    {'field': 'cronExpression', 'expression': '0 18 * * 1-6'}
                ]}
            }
        },
        {
            'id': 'dm-ma-list-drive', 'name': 'Lista Arquivos Drive',
            'type': 'n8n-nodes-base.httpRequest', 'typeVersion': 4.2,
            'position': [240, 0],
            'credentials': cred,
            'parameters': {
                'method': 'GET',
                'url': 'https://www.googleapis.com/drive/v3/files',
                'authentication': 'predefinedCredentialType',
                'nodeCredentialType': 'googleCalendarOAuth2Api',
                'sendQuery': True,
                'queryParameters': {'parameters': [
                    {'name': 'q', 'value': f"'{FOLDER_SYNC}' in parents and mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and trashed=false"},
                    {'name': 'fields', 'value': 'files(id,name,modifiedTime,trashed)'},
                    {'name': 'orderBy', 'value': 'modifiedTime desc'},
                    {'name': 'pageSize', 'value': '10'}
                ]},
                'options': {}
            }
        },
        {
            'id': 'dm-ma-filter', 'name': 'Filtrar XLSX',
            'type': 'n8n-nodes-base.code', 'typeVersion': 2,
            'position': [480, 0],
            'parameters': {'mode': 'runOnceForAllItems', 'jsCode': CODE_FILTER}
        },
        {
            'id': 'dm-ma-has-file', 'name': 'Tem Arquivo?',
            'type': 'n8n-nodes-base.if', 'typeVersion': 2,
            'position': [720, 0],
            'parameters': {
                'conditions': {
                    'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'strict', 'version': 2},
                    'conditions': [{'id': 'chk-has-file', 'leftValue': '={{ $json.hasFile }}', 'rightValue': True,
                                    'operator': {'type': 'boolean', 'operation': 'true', 'singleValue': True}}],
                    'combinator': 'and'
                },
                'options': {}
            }
        },
        {
            'id': 'dm-ma-download', 'name': 'Download XLSX',
            'type': 'n8n-nodes-base.httpRequest', 'typeVersion': 4.2,
            'position': [960, 0],
            'credentials': cred,
            'parameters': {
                'method': 'GET',
                'url': '=https://www.googleapis.com/drive/v3/files/{{ $json.fileId }}?alt=media',
                'authentication': 'predefinedCredentialType',
                'nodeCredentialType': 'googleCalendarOAuth2Api',
                'options': {
                    'response': {'response': {'responseFormat': 'file', 'outputPropertyName': 'data'}}
                }
            }
        },
        {
            'id': 'dm-ma-read-xlsx', 'name': 'Lê XLSX',
            'type': 'n8n-nodes-base.spreadsheetFile', 'typeVersion': 2,
            'position': [1200, 0],
            'parameters': {
                'operation': 'fromFile',
                'binaryPropertyName': 'data',
                'options': {'headerRow': True, 'rawData': False}
            }
        },
        {
            'id': 'dm-ma-parse', 'name': 'Parse Linhas XLSX',
            'type': 'n8n-nodes-base.code', 'typeVersion': 2,
            'position': [1440, 0],
            'parameters': {'mode': 'runOnceForAllItems', 'jsCode': CODE_PARSE}
        },
        {
            'id': 'dm-ma-get-gcal', 'name': 'Busca Eventos GCal',
            'type': 'n8n-nodes-base.httpRequest', 'typeVersion': 4.2,
            'position': [1680, 0],
            'credentials': cred,
            'parameters': {
                'method': 'GET',
                'url': f'https://www.googleapis.com/calendar/v3/calendars/{CALENDAR_ID_ENC}/events',
                'authentication': 'predefinedCredentialType',
                'nodeCredentialType': 'googleCalendarOAuth2Api',
                'sendQuery': True,
                'queryParameters': {'parameters': [
                    {'name': 'timeMin', 'value': '={{ $json.todayISO }}T00:00:00-03:00'},
                    {'name': 'timeMax', 'value': '={{ DateTime.fromISO($json.todayISO).plus({days:90}).toISODate() }}T23:59:59-03:00'},
                    {'name': 'maxResults', 'value': '500'},
                    {'name': 'singleEvents', 'value': 'true'}
                ]},
                'options': {}
            }
        },
        {
            'id': 'dm-ma-compare', 'name': 'Compara XLSX vs GCal',
            'type': 'n8n-nodes-base.code', 'typeVersion': 2,
            'position': [1920, 0],
            'parameters': {'mode': 'runOnceForAllItems', 'jsCode': CODE_COMPARE}
        },
        {
            'id': 'dm-ma-has-creates', 'name': 'Tem Novos Eventos?',
            'type': 'n8n-nodes-base.if', 'typeVersion': 2,
            'position': [2160, 0],
            'parameters': {
                'conditions': {
                    'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'loose', 'version': 2},
                    'conditions': [{'id': 'chk-creates', 'leftValue': '={{ $json.creates.length }}', 'rightValue': 0,
                                    'operator': {'type': 'number', 'operation': 'gt'}}],
                    'combinator': 'and'
                },
                'options': {}
            }
        },
        {
            'id': 'dm-ma-expand', 'name': 'Expande Creates',
            'type': 'n8n-nodes-base.code', 'typeVersion': 2,
            'position': [2400, -200],
            'parameters': {'mode': 'runOnceForAllItems', 'jsCode': CODE_EXPAND}
        },
        {
            'id': 'dm-ma-create-gcal', 'name': 'Cria Evento [MA] no GCal',
            'type': 'n8n-nodes-base.httpRequest', 'typeVersion': 4.2,
            'position': [2640, -200],
            'credentials': cred,
            'parameters': {
                'method': 'POST',
                'url': f'https://www.googleapis.com/calendar/v3/calendars/{CALENDAR_ID_ENC}/events',
                'authentication': 'predefinedCredentialType',
                'nodeCredentialType': 'googleCalendarOAuth2Api',
                'sendBody': True,
                'contentType': 'json',
                'jsonBody': GCAL_BODY,
                'options': {}
            }
        },
        {
            'id': 'dm-ma-aggregate', 'name': 'Agrega Criações',
            'type': 'n8n-nodes-base.code', 'typeVersion': 2,
            'position': [2880, -200],
            'parameters': {'mode': 'runOnceForAllItems', 'jsCode': CODE_AGGREGATE}
        },
        {
            'id': 'dm-ma-move', 'name': 'Move para Processados',
            'type': 'n8n-nodes-base.httpRequest', 'typeVersion': 4.2,
            'position': [3120, 0],
            'credentials': cred,
            'parameters': {
                'method': 'PATCH',
                'url': '=https://www.googleapis.com/drive/v3/files/{{ $json.fileId }}',
                'authentication': 'predefinedCredentialType',
                'nodeCredentialType': 'googleCalendarOAuth2Api',
                'sendQuery': True,
                'queryParameters': {'parameters': [
                    {'name': 'addParents', 'value': FOLDER_PROC},
                    {'name': 'removeParents', 'value': FOLDER_SYNC},
                    {'name': 'fields', 'value': 'id,parents'}
                ]},
                'options': {}
            }
        },
        {
            'id': 'dm-ma-notify-build', 'name': 'Monta Notificação',
            'type': 'n8n-nodes-base.code', 'typeVersion': 2,
            'position': [3360, 0],
            'parameters': {'mode': 'runOnceForAllItems', 'jsCode': CODE_NOTIFY}
        },
        {
            'id': 'dm-ma-notify-http', 'name': 'Notifica Damares WhatsApp',
            'type': 'n8n-nodes-base.httpRequest', 'typeVersion': 4.2,
            'position': [3600, 0],
            'parameters': {
                'method': 'POST',
                'url': 'https://api.ycloud.com/v2/whatsapp/messages/sendDirectly',
                'sendHeaders': True,
                'headerParameters': {'parameters': [{'name': 'X-API-Key', 'value': YCLOUD_KEY}]},
                'sendBody': True,
                'contentType': 'raw',
                'rawContentType': 'application/json',
                'body': '={{ $json.body }}',
                'options': {}
            }
        }
    ],
    'connections': {
        'Agendador Sync':       {'main': [[{'node': 'Lista Arquivos Drive',   'type': 'main', 'index': 0}]]},
        'Lista Arquivos Drive': {'main': [[{'node': 'Filtrar XLSX',           'type': 'main', 'index': 0}]]},
        'Filtrar XLSX':         {'main': [[{'node': 'Tem Arquivo?',           'type': 'main', 'index': 0}]]},
        'Tem Arquivo?':         {'main': [[{'node': 'Download XLSX',          'type': 'main', 'index': 0}], []]},
        'Download XLSX':        {'main': [[{'node': 'Lê XLSX',                'type': 'main', 'index': 0}]]},
        'Lê XLSX':              {'main': [[{'node': 'Parse Linhas XLSX',      'type': 'main', 'index': 0}]]},
        'Parse Linhas XLSX':    {'main': [[{'node': 'Busca Eventos GCal',     'type': 'main', 'index': 0}]]},
        'Busca Eventos GCal':   {'main': [[{'node': 'Compara XLSX vs GCal',   'type': 'main', 'index': 0}]]},
        'Compara XLSX vs GCal': {'main': [[{'node': 'Tem Novos Eventos?',     'type': 'main', 'index': 0}]]},
        'Tem Novos Eventos?':   {'main': [
            [{'node': 'Expande Creates',         'type': 'main', 'index': 0}],
            [{'node': 'Move para Processados',   'type': 'main', 'index': 0}]
        ]},
        'Expande Creates':              {'main': [[{'node': 'Cria Evento [MA] no GCal', 'type': 'main', 'index': 0}]]},
        'Cria Evento [MA] no GCal':     {'main': [[{'node': 'Agrega Criações',          'type': 'main', 'index': 0}]]},
        'Agrega Criações':              {'main': [[{'node': 'Move para Processados',    'type': 'main', 'index': 0}]]},
        'Move para Processados':        {'main': [[{'node': 'Monta Notificação',        'type': 'main', 'index': 0}]]},
        'Monta Notificação':            {'main': [[{'node': 'Notifica Damares WhatsApp','type': 'main', 'index': 0}]]}
    },
    'settings': {'executionOrder': 'v1'}
}

out = r'g:\Meu Drive\IT\Projetos\DamaresEstetica\agent\Sync_MinhaAgenda_GoogleCalendar.json'
with open(out, 'w', encoding='utf-8') as f:
    json.dump(workflow, f, ensure_ascii=False, indent=2)

print(f'Gerado: {out}')
print(f'Nodes: {len(workflow["nodes"])}  Connections: {len(workflow["connections"])}')
