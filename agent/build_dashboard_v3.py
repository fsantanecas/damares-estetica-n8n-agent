"""Gera Dashboard_Claude_Damares_v2.json — Anthropic Admin API + YCloud + CRM"""
import json

# ── PROCESSA DADOS ────────────────────────────────────────────────────────────
PROCESSA_CODE = """
// timestamp simples
var _n = new Date();
var _ts = _n.getDate() + '/' + (_n.getMonth()+1) + '/' + _n.getFullYear()
        + ' ' + _n.getHours() + ':' + String(_n.getMinutes()).padStart(2,'0');

// leitura segura de cada no
var mes30 = {}, d7 = {}, yc = {}, crm = [];
var diagErr = '';
try { mes30 = $('Anthropic-30d').first().json || {}; } catch(e) { diagErr += '[30d:'+e.message+']'; }
try { d7    = $('Anthropic-7d').first().json  || {}; } catch(e) { diagErr += '[7d:'+e.message+']';  }
try { yc    = $('YCloud Saldo').first().json  || {}; } catch(e) { diagErr += '[yc:'+e.message+']';  }
try { crm   = $('CRM Top Clientes').all().map(function(i){ return i.json; }); } catch(e) { diagErr += '[crm:'+e.message+']'; }

// agrega tokens 30d
var buckets30 = mes30.data || [];
var tU=0, tO=0, tCR=0, tCW=0;
var daily = [];
for (var i=0; i<buckets30.length; i++) {
  var bkt = buckets30[i];
  var res = bkt.results || [];
  var bU=0, bO=0, bCR=0, bCW=0;
  for (var j=0; j<res.length; j++) {
    var r = res[j];
    bU  += parseFloat(r.uncached_input_tokens)   || 0;
    bO  += parseFloat(r.output_tokens)            || 0;
    bCR += parseFloat(r.cache_read_input_tokens)  || 0;
    var cc = r.cache_creation || {};
    bCW += (parseFloat(cc.ephemeral_1h_input_tokens) || 0)
         + (parseFloat(cc.ephemeral_5m_input_tokens) || 0);
  }
  tU+=bU; tO+=bO; tCR+=bCR; tCW+=bCW;
  var dd = new Date(bkt.starting_at);
  var dia = String(dd.getUTCDate()).padStart(2,'0')+'/'+String(dd.getUTCMonth()+1).padStart(2,'0');
  daily.push({
    dia: dia, dia_iso: bkt.starting_at,
    tokens: bU+bO+bCR+bCW,
    custo: (bU*3.0 + bO*15.0 + bCR*0.30 + bCW*3.75) / 1000000
  });
}
var custoUSD = (tU*3.0 + tO*15.0 + tCR*0.30 + tCW*3.75) / 1000000;
var totalTok = tU + tO + tCR + tCW;

// cache 7d
var buckets7 = d7.data || [];
var c7r=0, c7u=0;
for (var i=0; i<buckets7.length; i++) {
  var res7 = buckets7[i].results || [];
  for (var j=0; j<res7.length; j++) {
    c7r += parseFloat(res7[j].cache_read_input_tokens) || 0;
    c7u += parseFloat(res7[j].uncached_input_tokens)   || 0;
  }
}
var totIn7 = c7r + c7u;
var hitPct = totIn7 > 0 ? (c7r / totIn7 * 100) : 0;
var econUSD = c7r * 2.70 / 1000000;

// ycloud saldo — chave é "amount"
var ycVal = parseFloat(yc.amount != null ? yc.amount :
            yc.balance != null ? yc.balance :
            yc.availableAmount != null ? yc.availableAmount : 0) || 0;

var BRL = 5.50;

// pré-renderiza tabela de top clientes em n8n (evita problema de serialização no browser)
var topHtml = '';
if (crm.length > 0) {
  topHtml = '<table><thead><tr>'
    + '<th>Cliente</th><th>Atend.</th><th>Último Serviço</th><th>Último Atend.</th>'
    + '</tr></thead><tbody>';
  for (var i=0; i<crm.length; i++) {
    var t = crm[i] || {};
    var dtStr = '';
    if (t.ultimo_atendimento) {
      try {
        var dd = new Date(t.ultimo_atendimento);
        dtStr = String(dd.getDate()).padStart(2,'0')+'/'+String(dd.getMonth()+1).padStart(2,'0')+'/'+dd.getFullYear();
      } catch(e) { dtStr = String(t.ultimo_atendimento).slice(0,10); }
    }
    topHtml += '<tr>'
      + '<td><div class="nm">'+(t.nome||'—')+'</div><div class="tel">+'+(t.telefone||'')+'</div></td>'
      + '<td><span class="bc">'+(t.total_atendimentos||0)+'</span></td>'
      + '<td>'+(t.ultimo_procedimento||'—')+'</td>'
      + '<td>'+(dtStr||'—')+'</td>'
      + '</tr>';
  }
  topHtml += '</tbody></table>';
} else {
  topHtml = '<div class="empty">Sem clientes registrados</div>';
}

return [{ json: {
  kpis_mes:   { custo_usd: custoUSD, custo_brl: custoUSD*BRL, tokens_total: totalTok },
  cache_7d:   { taxa_hit_pct: hitPct, tokens_economizados: c7r, total_input: totIn7, custo_economizado_usd: econUSD },
  daily:      daily,
  top_html:   topHtml,
  ycloud:     { saldo_usd: ycVal, saldo_brl: ycVal*BRL },
  ultima_atualizacao: _ts
}}];
"""

# ── MONTA HTML ────────────────────────────────────────────────────────────────
MONTA_HTML_CODE = r"""
var data = $input.first().json;
var dataJson = JSON.stringify(data);

var html = "<!DOCTYPE html>\n"
+ "<html lang=\"pt-BR\">\n<head>\n"
+ "<meta charset=\"UTF-8\">\n"
+ "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
+ "<title>Damares Estética · Painel do Agente</title>\n"
+ "<script src=\"https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js\"><\/script>\n"
+ "<style>\n"
+ "* { margin: 0; padding: 0; box-sizing: border-box; }\n"
+ ":root { --bg:#faf8f5; --surface:#fff; --border:#e8e4dd; --text:#2d2a26; --text-soft:#6b6258; --accent:#7a9471; --accent-light:#e8efe5; --success:#4a8a3f; --warning:#c9924a; --blue:#4a7fa8; --shadow:0 1px 3px rgba(45,42,38,.04),0 4px 12px rgba(45,42,38,.04); }\n"
+ "body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif; background:var(--bg); color:var(--text); min-height:100vh; padding:32px 20px; -webkit-font-smoothing:antialiased; }\n"
+ ".container { max-width:1200px; margin:0 auto; }\n"
+ "header { display:flex; align-items:center; justify-content:space-between; margin-bottom:32px; flex-wrap:wrap; gap:16px; }\n"
+ "h1 { font-size:24px; font-weight:600; letter-spacing:-.02em; }\n"
+ ".subtitle { color:var(--text-soft); font-size:13px; margin-top:4px; }\n"
+ ".timestamp { font-size:12px; color:var(--text-soft); background:var(--surface); padding:8px 12px; border-radius:8px; border:1px solid var(--border); }\n"
+ ".kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; margin-bottom:28px; }\n"
+ ".kpi-card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px; box-shadow:var(--shadow); }\n"
+ ".kpi-label { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-soft); margin-bottom:8px; }\n"
+ ".kpi-value { font-size:28px; font-weight:600; letter-spacing:-.02em; }\n"
+ ".kpi-sub { font-size:13px; color:var(--text-soft); margin-top:4px; }\n"
+ ".kpi-accent .kpi-value { color:var(--accent); } .kpi-success .kpi-value { color:var(--success); } .kpi-blue .kpi-value { color:var(--blue); }\n"
+ ".row { display:grid; grid-template-columns:2fr 1fr; gap:16px; margin-bottom:16px; }\n"
+ "@media(max-width:768px){ .row { grid-template-columns:1fr; } }\n"
+ ".card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px; box-shadow:var(--shadow); }\n"
+ ".card-title { font-size:14px; font-weight:600; margin-bottom:16px; display:flex; align-items:center; gap:8px; }\n"
+ ".badge { background:var(--accent-light); color:var(--accent); font-size:11px; padding:2px 8px; border-radius:6px; font-weight:500; }\n"
+ ".chart-box { height:280px; position:relative; }\n"
+ ".cs { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border); }\n"
+ ".cs:last-of-type { border-bottom:none; }\n"
+ ".cl { font-size:13px; color:var(--text-soft); } .cv { font-size:15px; font-weight:600; }\n"
+ ".cv.ok { color:var(--success); } .cv.bl { color:var(--blue); }\n"
+ ".cnote { margin-top:16px; font-size:12px; color:var(--text-soft); background:var(--bg); border-radius:8px; padding:10px 12px; line-height:1.5; }\n"
+ "table { width:100%; border-collapse:collapse; font-size:13px; }\n"
+ "th { text-align:left; padding:10px 8px; color:var(--text-soft); font-weight:500; font-size:11px; text-transform:uppercase; letter-spacing:.05em; border-bottom:1px solid var(--border); }\n"
+ "td { padding:12px 8px; border-bottom:1px solid var(--border); vertical-align:top; }\n"
+ "tr:last-child td { border-bottom:none; }\n"
+ ".nm { font-weight:500; } .tel { font-family:monospace; font-size:11px; color:var(--text-soft); margin-top:2px; }\n"
+ ".bc { background:var(--accent-light); color:var(--accent); font-size:13px; font-weight:600; padding:3px 10px; border-radius:20px; }\n"
+ ".empty { text-align:center; padding:40px 20px; color:var(--text-soft); font-size:13px; }\n"
+ ".footer { text-align:center; margin-top:32px; color:var(--text-soft); font-size:12px; }\n"
+ "</style>\n</head>\n<body>\n"
+ "<div class=\"container\">\n"
+ "  <header><div><h1>🌿 Damares Estética · Painel do Agente</h1><div class=\"subtitle\">Monitoramento via Anthropic Admin API · YCloud · N8N</div></div>"
+ "<div class=\"timestamp\">Atualizado: <span id=\"ts\">—</span></div></header>\n"
+ "  <div class=\"kpi-grid\">\n"
+ "    <div class=\"kpi-card kpi-accent\"><div class=\"kpi-label\">Custo (30 dias)</div><div class=\"kpi-value\" id=\"kc\">R$ 0,00</div><div class=\"kpi-sub\" id=\"kcu\">$0.0000 USD</div></div>\n"
+ "    <div class=\"kpi-card\"><div class=\"kpi-label\">Tokens (30 dias)</div><div class=\"kpi-value\" id=\"kt\">0</div><div class=\"kpi-sub\">tokens processados</div></div>\n"
+ "    <div class=\"kpi-card kpi-success\"><div class=\"kpi-label\">Cache Hit (7 dias)</div><div class=\"kpi-value\" id=\"kh\">0%</div><div class=\"kpi-sub\" id=\"khe\">R$ 0,00 economizados</div></div>\n"
+ "    <div class=\"kpi-card kpi-blue\"><div class=\"kpi-label\">Saldo YCloud</div><div class=\"kpi-value\" id=\"ky\">$0.000</div><div class=\"kpi-sub\" id=\"kyb\">R$ 0,00 disponível</div></div>\n"
+ "  </div>\n"
+ "  <div class=\"row\">\n"
+ "    <div class=\"card\"><div class=\"card-title\">Tokens por dia <span class=\"badge\">últimos 30 dias</span></div><div class=\"chart-box\"><canvas id=\"ch\"></canvas></div></div>\n"
+ "    <div class=\"card\"><div class=\"card-title\">Análise de Cache <span class=\"badge\">7 dias</span></div><div id=\"cd\"></div></div>\n"
+ "  </div>\n"
+ "  <div class=\"card\"><div class=\"card-title\">Top 5 clientes <span class=\"badge\">por atendimentos</span></div><div id=\"tc\"></div></div>\n"
+ "  <div class=\"footer\">🤖 Powered by Claude Sonnet 4.6 · YCloud · N8N</div>\n"
+ "</div>\n"
+ "<script>\n"
+ "var D = " + dataJson + ";\n"
+ "function brl(v){ return 'R$ '+Number(v).toFixed(2).replace('.',','); }\n"
+ "function fmt(v){ return Number(v).toLocaleString('pt-BR'); }\n"
+ "document.getElementById('ts').textContent = D.ultima_atualizacao || '—';\n"
+ "var k=D.kpis_mes||{};\n"
+ "document.getElementById('kc').textContent=brl(k.custo_brl||0);\n"
+ "document.getElementById('kcu').textContent='$'+Number(k.custo_usd||0).toFixed(4)+' USD';\n"
+ "document.getElementById('kt').textContent=fmt(k.tokens_total||0);\n"
+ "var c=D.cache_7d||{};\n"
+ "document.getElementById('kh').textContent=Number(c.taxa_hit_pct||0).toFixed(1)+'%';\n"
+ "document.getElementById('khe').textContent=brl((c.custo_economizado_usd||0)*5.50)+' economizados';\n"
+ "var y=D.ycloud||{};\n"
+ "document.getElementById('ky').textContent='$'+Number(y.saldo_usd||0).toFixed(3);\n"
+ "document.getElementById('kyb').textContent=brl(y.saldo_brl||0)+' disponível';\n"
+ "var dl=D.daily||[];\n"
+ "if(dl.length>0){\n"
+ "  new Chart(document.getElementById('ch'),{type:'bar',data:{labels:dl.map(function(d){return d.dia;}),datasets:[{label:'Tokens',data:dl.map(function(d){return d.tokens;}),backgroundColor:'#7a9471',borderRadius:6,maxBarThickness:40}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(ctx){var it=dl[ctx.dataIndex];return[fmt(ctx.parsed.y)+' tokens','Custo: '+brl(it.custo*5.50)];},},}},scales:{y:{beginAtZero:true,grid:{color:'#f0ede7'}},x:{grid:{display:false}}}}});\n"
+ "} else { document.getElementById('ch').parentElement.innerHTML='<div class=\"empty\">Sem dados ainda</div>'; }\n"
+ "document.getElementById('cd').innerHTML="
+ "'<div class=\"cs\"><span class=\"cl\">Tokens do cache</span><span class=\"cv bl\">'+fmt(c.tokens_economizados||0)+'</span></div>'"
+ "+'<div class=\"cs\"><span class=\"cl\">Total tokens entrada</span><span class=\"cv\">'+fmt(c.total_input||0)+'</span></div>'"
+ "+'<div class=\"cs\"><span class=\"cl\">💰 Economia</span><span class=\"cv ok\">'+brl((c.custo_economizado_usd||0)*5.50)+'</span></div>'"
+ "+'<div class=\"cnote\">Cache lê $0,30/MTok vs $3,00/MTok normal. '+Number(c.taxa_hit_pct||0).toFixed(1)+'% dos tokens vêm do cache.</div>';\n"
+ "document.getElementById('tc').innerHTML = D.top_html || '<div class=\"empty\">Sem clientes</div>';\n"
+ "<\/script>\n</body>\n</html>";

return [{ json: { html: html } }];
"""

# ── STICKY NOTE ───────────────────────────────────────────────────────────────
STICKY = """## Dashboard Damares v3

Credenciais necessarias no N8N:
1. Anthropic Admin Key (Header Auth: x-api-key = sk-ant-admin...)
2. YCloud API Key (Header Auth: X-API-Key = sua chave)
3. Dashboard Damares Basic Auth (Basic Auth)"""

# ── BUILD JSON ────────────────────────────────────────────────────────────────
nodes = [
    {"parameters": {"content": STICKY, "height": 400, "width": 400, "color": 5},
     "type": "n8n-nodes-base.stickyNote", "typeVersion": 1,
     "position": [-560, -200], "id": "dash-note", "name": "Instrucoes"},

    {"parameters": {"httpMethod": "GET", "path": "dashboard-damares",
                    "responseMode": "responseNode", "options": {},
                    "authentication": "basicAuth"},
     "type": "n8n-nodes-base.webhook", "typeVersion": 2,
     "position": [-400, 400], "id": "dash-webhook", "name": "Webhook Dashboard",
     "webhookId": "dashboard-damares-estetica",
     "credentials": {"httpBasicAuth": {"id": "PLACEHOLDER_BASIC_AUTH",
                                        "name": "Dashboard Damares Basic Auth"}}},

    {"parameters": {
        "method": "GET",
        "url": "https://api.anthropic.com/v1/organizations/usage_report/messages",
        "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
        "sendQuery": True,
        "queryParameters": {"parameters": [
            {"name": "starting_at", "value": "={{ new Date(Date.now()-30*24*60*60*1000).toISOString() }}"},
            {"name": "ending_at",   "value": "={{ new Date().toISOString() }}"},
            {"name": "bucket_width","value": "1d"},
            {"name": "limit",       "value": "31"}
        ]},
        "sendHeaders": True,
        "headerParameters": {"parameters": [{"name": "anthropic-version", "value": "2023-06-01"}]},
        "options": {}},
     "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
     "position": [-160, 400], "id": "dash-a30d", "name": "Anthropic-30d",
     "credentials": {"httpHeaderAuth": {"id": "PLACEHOLDER_ANTHROPIC_ADMIN",
                                         "name": "Anthropic Admin Key"}}},

    {"parameters": {
        "method": "GET",
        "url": "https://api.anthropic.com/v1/organizations/usage_report/messages",
        "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
        "sendQuery": True,
        "queryParameters": {"parameters": [
            {"name": "starting_at", "value": "={{ new Date(Date.now()-7*24*60*60*1000).toISOString() }}"},
            {"name": "ending_at",   "value": "={{ new Date().toISOString() }}"},
            {"name": "bucket_width","value": "1d"},
            {"name": "limit",       "value": "7"}
        ]},
        "sendHeaders": True,
        "headerParameters": {"parameters": [{"name": "anthropic-version", "value": "2023-06-01"}]},
        "options": {}},
     "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
     "position": [80, 400], "id": "dash-a7d", "name": "Anthropic-7d",
     "credentials": {"httpHeaderAuth": {"id": "PLACEHOLDER_ANTHROPIC_ADMIN",
                                         "name": "Anthropic Admin Key"}}},

    {"parameters": {"method": "GET", "url": "https://api.ycloud.com/v2/balance",
                    "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
                    "options": {}},
     "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
     "position": [320, 400], "id": "dash-yc", "name": "YCloud Saldo",
     "credentials": {"httpHeaderAuth": {"id": "PLACEHOLDER_YCLOUD",
                                         "name": "YCloud API Key"}}},

    {"parameters": {
        "operation": "executeQuery",
        "query": "SELECT nome, telefone, total_atendimentos, ultimo_procedimento, ultimo_atendimento FROM dm_crm WHERE status='ativo' ORDER BY total_atendimentos DESC LIMIT 5;",
        "options": {}},
     "type": "n8n-nodes-base.postgres", "typeVersion": 2.6,
     "position": [560, 400], "id": "dash-crm", "name": "CRM Top Clientes",
     "credentials": {"postgres": {"id": "LQ6Uqet7mGbpcLOH", "name": "postgres_cloudfy"}}},

    {"parameters": {"jsCode": PROCESSA_CODE},
     "type": "n8n-nodes-base.code", "typeVersion": 2,
     "position": [800, 400], "id": "dash-proc", "name": "Processa Dados"},

    {"parameters": {"jsCode": MONTA_HTML_CODE},
     "type": "n8n-nodes-base.code", "typeVersion": 2,
     "position": [1040, 400], "id": "dash-html", "name": "Monta HTML"},

    {"parameters": {
        "respondWith": "text", "responseBody": "={{ $json.html }}",
        "options": {"responseCode": 200, "responseHeaders": {"entries": [
            {"name": "Content-Type",  "value": "text/html; charset=utf-8"},
            {"name": "Cache-Control", "value": "no-cache, no-store, must-revalidate"}
        ]}}},
     "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1,
     "position": [1280, 400], "id": "dash-resp", "name": "Responde HTML"},
]

connections = {
    "Webhook Dashboard": {"main": [[{"node": "Anthropic-30d",     "type": "main", "index": 0}]]},
    "Anthropic-30d":     {"main": [[{"node": "Anthropic-7d",      "type": "main", "index": 0}]]},
    "Anthropic-7d":      {"main": [[{"node": "YCloud Saldo",      "type": "main", "index": 0}]]},
    "YCloud Saldo":      {"main": [[{"node": "CRM Top Clientes",  "type": "main", "index": 0}]]},
    "CRM Top Clientes":  {"main": [[{"node": "Processa Dados",    "type": "main", "index": 0}]]},
    "Processa Dados":    {"main": [[{"node": "Monta HTML",        "type": "main", "index": 0}]]},
    "Monta HTML":        {"main": [[{"node": "Responde HTML",     "type": "main", "index": 0}]]},
}

workflow = {
    "name": "Dashboard_Claude_Damares",
    "nodes": nodes, "connections": connections,
    "settings": {"executionOrder": "v1"},
    "tags": [{"name": "dashboard"}, {"name": "monitoring"}, {"name": "damares"}]
}

out = "Dashboard_Claude_Damares_v2.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump(workflow, f, ensure_ascii=False, indent=2)
print("OK:", out)
with open(out, encoding="utf-8") as f:
    json.load(f)
print("JSON valido. Nodes:", len(nodes))
