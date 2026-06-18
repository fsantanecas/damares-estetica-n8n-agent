# Documentação — Agente IA Damares Estética Home Care
**Versão:** HTTPRequest v9 (147 nós)
**Última atualização:** Junho/2026
**Plataforma:** n8n (self-hosted via Cloudfy)

---

## 1. Visão Geral do Projeto

### 1.1 Contexto
A **Damares Estética Home Care** é um serviço de estética a domicílio especializado em massagem relaxante, drenagem linfática e tratamentos pós-operatórios, com atendimento em São Paulo Capital e São Caetano do Sul.

### 1.2 Objetivo
Automatizar 100% do atendimento via WhatsApp Business — desde o primeiro contato até o agendamento confirmado, com gestão de cancelamentos, reagendamentos, pedidos de avaliação e campanhas de reengajamento — usando IA conversacional (Claude/Anthropic), sem intervenção humana na operação rotineira.

### 1.3 Resultados Obtidos (Case de Sucesso)
- Atendimento 24/7 sem intervenção humana para agendamentos, cancelamentos e dúvidas
- Média de resposta < 7 segundos após mensagem do cliente
- Gestão automática de agenda via Google Calendar com verificação de conflitos em tempo real
- Envio automático de pedidos de avaliação Google pós-atendimento (template `pedido_avaliacao_google` aprovado Meta)
- Follow-up automático de reengajamento para clientes inativos > 30 dias
- Campanha de leads semanais com disparo de mensagem de apresentação
- CRM integrado ao banco de dados com histórico completo de atendimentos
- Notificação automática para a profissional a cada novo agendamento ou cancelamento

---

## 2. Arquitetura Técnica

### 2.1 Stack de Tecnologias

| Componente | Tecnologia | Finalidade |
|---|---|---|
| Orquestrador | n8n (Cloudfy) | Fluxo de automação |
| IA / LLM | Claude (Anthropic API) | Processamento de linguagem natural |
| WhatsApp API | YCloud (v2) | Envio/recebimento de mensagens |
| Calendário | Google Calendar API (OAuth2) | Verificar disponibilidade e criar eventos |
| Banco de Dados | PostgreSQL | CRM, histórico de conversa, fila de mensagens |
| Webhook | n8n Webhook node | Receber eventos YCloud |

### 2.2 Modelo de IA
- **Modelo atual:** `claude-opus-4-7` (ou equivalente configurado em `_state.model`)
- **Max tokens:** configurado via `_state.max_tokens`
- **Modo:** Tool Use (function calling) para chamar ferramentas de calendário
- **Cache de contexto:** ativo via prompt caching do sistema

### 2.3 Diagrama de Fluxo Principal

```
WhatsApp (cliente)
        │
        ▼
   YCloud Webhook ──► n8n Webhook "Recebe mensagem"
        │
        ▼
   Filtra Evento YCloud (só whatsapp.inbound_message.received)
        │
        ▼
   Coleta (extrai nome, telefone, tipo, mensagem)
        │
        ├──► Ignora Bot (fromMe = true → encerra)
        │
        ├──► É Damares? (número próprio → encerra)
        │
        ▼
   Verifica tipo de arquivo (Switch)
        │
        ├── texto/extendedText ──► REGISTRA MENSAGEM ──► Debounce ──► Agente IA
        │
        ├── audioMessage/ptt ──► Fallback mídia + Alerta Damares
        │
        ├── imageMessage ──► Fallback mídia + Alerta Damares
        │
        ├── videoMessage ──► Fallback mídia + Alerta Damares
        │
        └── unsupported / fallback ──► Fallback genérico + Alerta Damares
```

### 2.4 Pipeline de Debounce (Anti-flood)

Agrupa múltiplas mensagens enviadas rapidamente pelo cliente em uma única chamada à IA:

```
REGISTRA MENSAGEM (INSERT no PostgreSQL, status=0)
        │
        ├──► Atualiza Contato CRM (timestamp último contato)
        │
        ▼
PAUSA DE 3 SEGUNDOS (Wait node)
        │
        ▼
BUSCA MENSAGENS DO USUÁRIO (UPDATE status=0→1, RETURNING *)
        │
        ▼
AGRUPA MENSAGENS (concatena conteúdo)
        │
        ▼
DELETA MENSAGENS (limpa fila status=1)
        │
        ▼
Busca Histórico da Conversa (últimas 20 interações)
        │
        ▼
Busca Contexto CRM (dados do cliente)
        │
        ▼
Inicializa Conversa → Chama Anthropic (IA)
        │
        ▼
Loop de Tool Use (até 3 iterações)
        │
        ▼
Envia mensagem para o WhatsApp HTTP
```

---

## 3. Banco de Dados

### 3.1 Tabelas

#### `messages` — Fila de debounce
```sql
id             SERIAL PRIMARY KEY
status         INT          -- 0=pendente, 1=processando
source_id      VARCHAR      -- telefone@s.whatsapp.net
content        TEXT         -- conteúdo da mensagem
inbox_id       VARCHAR
conversation_id VARCHAR
message_type   VARCHAR
created_at     TIMESTAMP
updated_at     TIMESTAMP
```

#### `dm_crm` — CRM de clientes
```sql
id                    SERIAL PRIMARY KEY
nome                  VARCHAR(200)
bairro                VARCHAR(100)
telefone              VARCHAR(30) UNIQUE NOT NULL   -- formato: 5511999999999
address               VARCHAR(300)
ultimo_procedimento   VARCHAR(100)
ultimo_atendimento    TIMESTAMP
proximo_followup      TIMESTAMP
avaliacao_pendente    BOOLEAN DEFAULT FALSE
avaliacao_enviada_em  TIMESTAMP
avaliacao_confirmada  BOOLEAN DEFAULT FALSE
lembretes_avaliacao   INTEGER DEFAULT 0
total_atendimentos    INTEGER DEFAULT 0
status                VARCHAR(20) DEFAULT 'ativo'   -- ativo / cancelou
ultimo_contato_em     TIMESTAMP
criado_em             TIMESTAMP DEFAULT NOW()
atualizado_em         TIMESTAMP
```

#### `dm_leads` — Leads de campanhas
```sql
id          SERIAL PRIMARY KEY
nome        VARCHAR(200) DEFAULT ''
telefone    VARCHAR(30) NOT NULL UNIQUE
status      VARCHAR(20) DEFAULT 'pendente'  -- pendente / enviado / erro
enviado_em  TIMESTAMP
erro        TEXT
criado_em   TIMESTAMP DEFAULT NOW()
```

#### `dm_conversation_history` — Histórico de conversas
```sql
id         SERIAL PRIMARY KEY
telefone   VARCHAR(50) NOT NULL
role       VARCHAR(20)    -- user / assistant
content    TEXT
created_at TIMESTAMP DEFAULT NOW()
```
> Indexado por `telefone`. Consulta limitada a 20 mensagens recentes por conversa.

#### `dm_claude_usage_log` — Métricas de uso da IA
```sql
id                     SERIAL PRIMARY KEY
telefone               VARCHAR(50)
iteracao               INT
modelo                 VARCHAR(100)
input_tokens           INT
cache_creation_tokens  INT
cache_read_tokens      INT
output_tokens          INT
created_at             TIMESTAMP DEFAULT NOW()
```

---

## 4. Integrações Externas

### 4.1 YCloud (WhatsApp Business API)

**Credencial:** API Key `X-API-Key` (header)
**WABA ID:** `1279013391103386`
**Número de origem:** `+5511994265257`

| Endpoint | Uso |
|---|---|
| `POST /v2/whatsapp/messages/sendDirectly` | Envio de texto livre (dentro janela 24h) |
| `POST /v2/whatsapp/messages` | Envio de template Meta aprovado (qualquer momento) |

**Templates Meta aprovados:**

| Template | Variáveis | Uso |
|---|---|---|
| `pedido_avaliacao_google` | {{1}} nome, {{2}} último procedimento | Pedido de avaliação pós-atendimento |
| `alerta_midia_recebida` | {{1}} cliente, {{2}} telefone, {{3}} tipo mídia | Alerta à Damares de mídia não processada |
| `reengajamento_clientes_servicos` | — | Follow-up de reengajamento |

> **Regra 131047:** Mensagens de texto livre para números sem sessão ativa (> 24h) retornam erro. Sempre usar template nesses casos.

### 4.2 Google Calendar API

**Calendário:** `damaresesteticasp@gmail.com`
**Autenticação:** OAuth2 (`googleCalendarOAuth2Api`)

| Operação | Node |
|---|---|
| Listar eventos (verificar disponibilidade) | `Busca Eventos Calendar` (GET) |
| Listar eventos (verificar cancelamento) | `Busca Evento Cancelamento` (GET) |
| Criar evento | `Cria Evento no Calendário` (Google Calendar node) |
| Deletar evento | `Deleta Evento Calendario` (DELETE) |
| Verificar duplicidade | `Verifica Duplicidade` (GET) |

### 4.3 Anthropic API

**Endpoint:** `https://api.anthropic.com/v1/messages`
**Header:** `anthropic-beta: prompt-caching-2024-07-31`
**Loop de tool use:** até 3 iterações (`Chama Anthropic 1/2/3`)

**Ferramentas disponíveis para a IA:**

| Ferramenta | Descrição |
|---|---|
| `verificar_disponibilidade` | Consulta horários livres no Google Calendar por período e bairro |
| `realizar_agendamento` | Cria evento no calendário + salva no CRM |
| `cancelar_agendamento` | Remove evento do calendário + marca CRM |

---

## 5. Fluxos Funcionais

### 5.1 Primeiro Contato (Novo Cliente)
1. Cliente envia mensagem via WhatsApp
2. Agente apresenta-se como "Damys" (assistente da Damares)
3. Exibe menu principal com opções (1 Massagem, 2 Drenagem, 3 Pós-operatório, 4 Outros)
4. Coleta: nome completo + sobrenome, bairro/região, data, período e horário
5. Verifica disponibilidade (`verificar_disponibilidade`)
6. Apresenta horários disponíveis
7. Coleta escolha de sessão (avulsa ou plano 5 sessões)
8. Apresenta resumo completo com valor e taxa de deslocamento
9. Solicita pagamento de sinal (50%) via PIX
10. Aguarda confirmação de pagamento → cria agendamento (`realizar_agendamento`)
11. Notifica Damares via WhatsApp template

### 5.2 Cliente Recorrente
1. Sistema busca contexto CRM (`Busca Contexto CRM`)
2. Agente personaliza atendimento com nome e histórico
3. Se endereço cadastrado → confirma antes de usar ("Ainda é o mesmo?")
4. Após confirmação de endereço → vai direto para resumo (sem reexibir horários)

### 5.3 Cancelamento
1. Cliente solicita cancelamento
2. Agente confirma dados: nome completo, data (DD/MM/YYYY), horário (HH:MM)
3. Apresenta resumo: "Vou cancelar o agendamento de [Nome] em [DD/MM] às [HH:MM]. Confirma?"
4. Cliente confirma → `cancelar_agendamento` (deleta evento + atualiza CRM)
5. Informa política de reembolso (prazo mínimo 6h de antecedência)

### 5.4 Reagendamento
1. Cancela agendamento atual (passos do cancelamento)
2. Coleta nova data/horário
3. Verifica disponibilidade
4. Cria novo agendamento
5. Solicita novo sinal se necessário

### 5.5 Pedido de Avaliação Google (Automático)
**Trigger:** `Agendador Avaliação` — a cada 30 minutos

**Critérios para disparo (todos obrigatórios):**
```sql
avaliacao_pendente = true
AND avaliacao_confirmada = false
AND lembretes_avaliacao < 3
AND ultimo_atendimento < NOW() - INTERVAL '30 minutes'
AND (avaliacao_enviada_em IS NULL OR avaliacao_enviada_em < NOW() - INTERVAL '3 days')
AND (ultimo_contato_em IS NULL OR ultimo_contato_em < NOW() - INTERVAL '2 hours')
```

**Envio:** template `pedido_avaliacao_google` com nome e último procedimento do cliente.
**Após envio:** incrementa `lembretes_avaliacao` e registra `avaliacao_enviada_em`.

### 5.6 Follow-up Automático (Reengajamento)
**Trigger:** `Agendador Follow-up` — toda quinta-feira às 18h

**Critérios:**
```sql
status = 'ativo'
AND ultimo_atendimento < NOW() - INTERVAL '30 days'
AND (proximo_followup IS NULL OR proximo_followup < NOW())
```

**Envio:** template `reengajamento_clientes_servicos`
**Após envio:** atualiza `proximo_followup = NOW() + INTERVAL '30 days'`

### 5.7 Campanha de Leads
**Trigger:** `Campanha Leads` — toda terça-feira às 16h

**Fluxo:**
1. Busca leads com `status = 'pendente'` no `dm_leads`
2. Processa em lotes (`SplitInBatches`)
3. Envia mensagem de apresentação via `/sendDirectly`
4. Atualiza status → `enviado` ou `erro`

---

## 6. Regras de Negócio

### 6.1 Área de Cobertura
- **Atendida:** São Paulo Capital + São Caetano do Sul
- **Não atendida:** ABC Paulista, Grande SP exceto exceções, cidades da região metropolitana
- Verificar bairro ANTES de qualquer informação de valor

### 6.2 Tabela de Preços (Junho/2026)

**Massagem Relaxante**

| Duração | Grupo A | Grupo B | Grupo C |
|---|---|---|---|
| 1h — avulsa | R$ 220 | R$ 250 | R$ 350 |
| 1h — plano 5x | R$ 1.045 | R$ 1.190 | R$ 1.665 |
| 1h30 — avulsa | R$ 300 | R$ 320 | R$ 430 |
| 1h30 — plano 5x | R$ 1.425 | R$ 1.520 | R$ 2.045 |

**Drenagem Linfática**

| Duração | Grupo A/B | Grupo C |
|---|---|---|
| 1h — avulsa | R$ 250 | R$ 300 |
| 1h — plano 5x | R$ 1.190 | R$ 1.425 |
| 1h20 — avulsa | R$ 300 | R$ 380 |
| 1h20 — plano 5x | R$ 1.425 | R$ 1.805 |

**Pós-operatório (todos os grupos)**

| Duração | Avulsa | Plano 5x |
|---|---|---|
| 1h30 | R$ 400 | R$ 1.900 |

**Grupos de bairro:**
- Grupo A: Mooca, Tatuapé, Anália Franco
- Grupo B: demais bairros SP Capital
- Grupo C: Itaim Bibi, Jardim Europa, Jardins, Vila Nova Conceição, Higienópolis

**Sinal:** 50% do valor total no momento do agendamento via PIX (CPF 339.409.548-76, Itaú)

### 6.3 Restrições de Horário
- **Funcionamento:** Segunda a sexta, 8h–19h (sem atendimento 11h–14h)
- **Quinta-feira:** ÚNICO horário válido é 14:00 (restrição hard-coded no código e no prompt)
- **Sábado/Domingo:** nenhum atendimento
- **Feriados:** lista dinâmica calculada para os próximos 90 dias

### 6.4 Deslocamento entre Atendimentos
Tempo mínimo entre atendimentos calculado por grupos de bairro:

| De \ Para | Grupo A | Grupo B | Grupo C |
|---|---|---|---|
| Grupo A | 45 min | 60 min | 90 min |
| Grupo B | 60 min | 45 min | 60 min |
| Grupo C | 90 min | 60 min | 45 min |

---

## 7. Componentes de Código Principais

### 7.1 `Inicializa Conversa` (Code node — `dm-init-conv`)
Monta o payload completo para a Anthropic API:
- Injeta `dataHoje` (dia da semana + data atual no fuso -03:00)
- Injeta lista de feriados dos próximos 90 dias (`feriadosList`, `datasProibidasList`)
- Injeta `CONTEXTO_SISTEMA` com dados do CRM do cliente
- Injeta histórico de conversa (últimas 20 mensagens)
- Monta `system prompt` (~62k chars) com todas as regras e tabelas de preço
- Configura `tools` (verificar_disponibilidade, realizar_agendamento, cancelar_agendamento)

### 7.2 `Prepara Dados do Evento` (Code node — `dm-agend-prep`)
Valida e prepara dados para criação de evento no Google Calendar:
- **Validação de quinta-feira:** se `getDay() === 4` e `time !== '14:00'` → retorna erro (bloqueio server-side, impede agendamento inválido mesmo se IA falhar)
- Calcula duração do serviço (40/60/80/90 min conforme procedimento)
- Calcula grupo de bairro e valor do sinal
- Monta título e descrição do evento com todos os dados do cliente

### 7.3 `Formata Resposta Disponibilidade` (Code node)
Processa eventos retornados pelo Google Calendar:
- Calcula `proximo_disponivel` com base na matriz de deslocamento por grupos
- Detecta se a data é quinta-feira → inclui campo `quinta_restricao` na resposta à IA
- Retorna eventos formatados com `inicio_brt`, `fim_brt`, `buffer_minutos`, `proximo_disponivel`

### 7.4 `Envia Pedido Avaliação` (Code node — `dm-aval-envia`)
Monta payload de template Meta para pedido de avaliação:
```js
{ type: 'template', template: { name: 'pedido_avaliacao_google', language: { code: 'pt_BR' },
  components: [{ type: 'body', parameters: [
    { type: 'text', text: item.nome },
    { type: 'text', text: item.ultimo_procedimento }
  ]}]
}}
```

---

## 8. Validações e Proteções

| Proteção | Onde | Descrição |
|---|---|---|
| Anti-loop debounce | `PAUSA DE 3 SEGUNDOS` → `BUSCA MENSAGENS` | Agrupa mensagens consecutivas, evita múltiplas chamadas à IA |
| Ignora mensagens próprias | `Ignora Bot` (IF) | `fromMe = true` → descarta |
| Ignora número da Damares | `É Damares?` (IF) | Número `+5511999950549` → descarta |
| Filtro de eventos webhook | `Filtra Evento YCloud` (IF) | Só processa `whatsapp.inbound_message.received` |
| Validação quinta-feira (prompt) | System prompt seção 7.3b | IA instruída a não oferecer 14:00 em quintas |
| Validação quinta-feira (server) | `Prepara Dados do Evento` + IF `Horário Válido (Quinta)?` | Bloqueia criação de evento inválido no calendário |
| Anti-duplicidade de agendamento | `Verifica Duplicidade` → `Checa Duplicidade` → `Duplicidade?` | Consulta calendar antes de criar evento |
| Template obrigatório fora 24h | `Envia Pedido Avaliação HTTP`, `Notifica Damares HTTP` | Usa `/v2/whatsapp/messages` (template) em vez de `/sendDirectly` |

---

## 9. Configuração de Schedules

| Automação | Dia/Horário | Critério |
|---|---|---|
| Campanha Leads | Toda terça-feira, 16h | `dm_leads.status = 'pendente'` |
| Pedidos de Avaliação | A cada 30 minutos | Ver critérios seção 5.5 |
| Follow-up Reengajamento | Toda quinta-feira, 18h | Inativo > 30 dias |

---

## 10. Guia de Manutenção

### 10.1 Atualização do Workflow
1. Editar `Agente_DamaresEstetica_HTTPRequest_v9.json` (scripts Python na pasta `agent/`)
2. Importar no n8n: Editor → ⋯ → Import from file
3. Ativar o workflow (toggle "Active")
4. Verificar credenciais (Google Calendar OAuth2, YCloud API Key, PostgreSQL)

> **ATENÇÃO:** conexões entre nós são referenciadas por **nome** (não por ID). Renomear um nó exige atualizar TODAS as referências no objeto `connections`.

### 10.2 Atualização de Preços / Regras
Editar o system prompt no nó `Inicializa Conversa` (id: `dm-init-conv`) via script Python:
```python
import json
with open('Agente_DamaresEstetica_HTTPRequest_v9.json', encoding='utf-8') as f:
    data = json.load(f)
for node in data['nodes']:
    if node['id'] == 'dm-init-conv':
        code = node['parameters']['jsCode']
        code = code.replace('TEXTO ANTIGO', 'TEXTO NOVO')
        node['parameters']['jsCode'] = code
with open('Agente_DamaresEstetica_HTTPRequest_v9.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
```
> O system prompt contém literais `\n` e `\"` como sequências de escape. Usar `.replace()` via Python evita problemas de encoding; não editar o JSON diretamente em editor de texto.

### 10.3 Adicionar Novo Template Meta
1. Submeter template em: [business.facebook.com](https://business.facebook.com) → WhatsApp → Templates
2. Aguardar aprovação (tipicamente 24h)
3. Atualizar o nó que monta o payload trocando `name` do template
4. Alterar URL do HTTP node de `/sendDirectly` para `/v2/whatsapp/messages`

### 10.4 Adicionar/Remover Leads
```sql
-- Adicionar
INSERT INTO dm_leads (nome, telefone, status)
VALUES ('Nome Completo', '5511999999999', 'pendente')
ON CONFLICT (telefone) DO NOTHING;

-- Remover
DELETE FROM dm_leads WHERE telefone IN ('5511999999999');
DELETE FROM dm_crm WHERE telefone IN ('5511999999999');
```

### 10.5 Normalizar registro de teste após testes manuais
```sql
UPDATE dm_crm SET
  avaliacao_enviada_em = NOW(),
  lembretes_avaliacao = 3,
  atualizado_em = NOW()
WHERE telefone = '55119XXXXXXXX';
```

### 10.6 Diagnóstico de Problemas Comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Agente não responde a mensagens de texto | Conexão quebrada por rename de nó | Verificar `connections["REGISTRA MENSAGEM"]` aponta para nome correto do Wait node |
| Mensagem falha com erro 131047 | Texto livre fora janela 24h | Usar template aprovado em vez de `/sendDirectly` |
| `Busca Pendentes de Avaliação` retorna 0 | `lembretes_avaliacao >= 3` ou `avaliacao_enviada_em` recente | Verificar dados no `dm_crm` |
| Agendamento aceito em quinta com horário inválido | Falha de aderência do modelo ao prompt | IF `Horário Válido (Quinta)?` bloqueia server-side |
| Mensagem tipo "unsupported" sem resposta do agente | Click-to-WhatsApp Ads / mídia não decodificável pelo YCloud | By design — fallback genérico enviado ao cliente, alerta enviado à Damares |
| Alerta técnico para Damares falha (131047) | Janela 24h expirada | Template `alerta_midia_recebida` usado automaticamente |

---

## 11. Histórico de Versões (Changelog Relevante)

| Versão | Data | Mudança |
|---|---|---|
| v1–v6 | Mai/2026 | Versões iniciais com Evolution API e HTTP Request direto |
| v7 | Mai/2026 | Migração para YCloud; templates para erros 131047 |
| v8 | Mai/2026 | Integração Instagram/Facebook DM via Meta Graph API |
| v9 | Jun/2026 | **Versão atual** — system prompt refatorado, debounce corrigido, validação quinta-feira server-side, template `pedido_avaliacao_google`, template `alerta_midia_recebida`, fallback de mídia genérico |

### Correções aplicadas na v9
- Conexão `REGISTRA MENSAGEM → PAUSA DE 3 SEGUNDOS` corrigida após rename de nó
- Template `pedido_avaliacao_google` implementado no fluxo de avaliação (substituiu `/sendDirectly`)
- Endpoint `Envia Pedido Avaliação HTTP` migrado para `/v2/whatsapp/messages`
- Regra de estado corrigida: após confirmação de endereço → vai para seção **7.5** (resumo), não 7.4 (disponibilidade)
- Mensagem duplicada de cancelamento: adicionada regra de repetição como confirmação implícita
- Validação server-side quinta-feira: nó `Horário Válido (Quinta)?` + `Retorna Erro Quinta`
- Fallback de mídia não assume mais "mensagem de voz" para tipo `unsupported`
- Template `alerta_midia_recebida` implementado para alertas à Damares fora da janela 24h

---

## 12. Informações de Acesso (manter seguro)

| Recurso | Detalhe |
|---|---|
| n8n (Cloudfy) | `lightweightkangaroo-n8n.cloudfy.live` |
| YCloud API Key | `ea53799239658212b3a8be3befbffff9` |
| WhatsApp Business | `+5511994265257` |
| WABA ID | `1279013391103386` |
| Google Calendar | `damaresesteticasp@gmail.com` |
| Número admin (Damares) | `+5511999950549` |
| PIX (sinal) | CPF 339.409.548-76 — Itaú |

---

*Documento gerado automaticamente em 12/06/2026*
