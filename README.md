# Mensageria API — Exercícios Práticos

API em Node.js + Express para os exercícios práticos da aula de **Mensageria**. Implementa dois endpoints de eventos (`pedido` e `pagamento`), com validação de payload e respostas no padrão HTTP 202 Accepted / 400 Bad Request.

A última seção responde ao **Desafio**: por que esses endpoints síncronos via HTTP se comportam diferente de um fluxo assíncrono usando RabbitMQ.

---

## Tecnologias

- Node.js
- Express
- REST Client (extensão do VS Code) para os testes

---

## Como rodar

```bash
npm install
npm start
```

A API sobe em `http://localhost:3000`. Abrir essa URL no navegador retorna um JSON com as rotas disponíveis (health-check).

---

## Endpoints

### `POST /eventos/pedido`

Recebe um evento de pedido.

**Body esperado:**
```json
{
  "pedidoId": "abc-123",
  "cliente": "Katsu",
  "produto": "Notebook",
  "quantidade": 2,
  "valor": 5000
}
```

**Respostas:**
- `202 Accepted` — evento aceito
- `400 Bad Request` — body vazio ou campos obrigatórios ausentes

### `POST /eventos/pagamento`

Recebe um evento de pagamento.

**Body esperado:**
```json
{
  "pedidoId": "abc-123",
  "valor": 5000,
  "metodo": "pix"
}
```

**Respostas:**
- `202 Accepted` — pagamento aceito
- `400 Bad Request` — campos ausentes, valor ≤ 0 ou método inválido (aceitos: `pix`, `cartao`, `boleto`)

---

## Como testar

Os cenários de teste estão no arquivo `requests.http`, prontos pra rodar com a extensão **REST Client** (`humao.rest-client`) do VS Code. Basta abrir o arquivo e clicar em **Send Request** em cima de cada bloco.

| # | Cenário | Endpoint | Status esperado |
|---|---|---|---|
| 1 | Pedido válido | `POST /eventos/pedido` | **202** |
| 2 | Pedido sem o campo `produto` | `POST /eventos/pedido` | **400** |
| 3 | Pedido com body vazio | `POST /eventos/pedido` | **400** |
| 4 | Pagamento válido | `POST /eventos/pagamento` | **202** |
| 5 | Pagamento com valor negativo | `POST /eventos/pagamento` | **400** |

> A Collection do Thunder Client (`thunder-collection_Eventos.json`) também está no repositório, mas a importação requer a versão paga da extensão. Por isso o `requests.http` é o caminho recomendado.

---

## ⭐ Desafio — Síncrono (HTTP) vs Assíncrono (RabbitMQ)

### Como funciona hoje (síncrono, via HTTP)

```
Cliente ──HTTP POST──▶ /eventos/pedido (Express) ──▶ processa ──▶ 202
   │                                                                │
   └─────── espera a resposta nessa conexão TCP ◀───────────────────┘
```

O cliente abre uma conexão TCP, envia, **fica bloqueado esperando**, e só segue depois que o servidor responde. Se o consumer (no caso, o próprio Express que processa o pedido) estiver **fora do ar**:

- O cliente recebe `connection refused` ou `timeout` imediatamente
- A mensagem **se perde** — não há onde armazenar nada
- O cliente precisa implementar retry por conta própria
- Se o processamento for lento, o cliente fica esperando junto

### Como ficaria com RabbitMQ (assíncrono)

```
                      ┌────────────────────────────┐
Cliente ─POST─▶ API ──┤ RabbitMQ (fila "pedidos")  ├──▶ Consumer (worker)
        (202)         └────────────────────────────┘
```

A API recebe o request, **publica** na fila e responde **202 imediatamente**. O worker (consumer) lê a fila no seu próprio ritmo, em outro processo.

### O que muda quando o consumer está fora do ar

| Situação | Síncrono (HTTP direto) | Assíncrono (RabbitMQ) |
|---|---|---|
| Consumer offline | Erro imediato (`ECONNREFUSED`) | Mensagens **acumulam na fila** |
| Consumer volta a subir | Cliente teve que tentar de novo | Consumer puxa a fila e processa o backlog |
| Cliente precisa esperar? | Sim — até o processamento terminar | Não — recebe 202 assim que entra na fila |
| Perda de informação | Possível (sem retry no cliente) | Não — mensagens persistem (`durable: true`) |
| Escalabilidade | Limitada à instância que recebeu | Vários consumers em paralelo |
| Acoplamento | Produtor depende do consumer online | Produtor e consumer independentes no tempo |
| Linguagens | Geralmente mesma stack | Indiferente — qualquer linguagem consome a fila |

### Resumo

No síncrono, cliente e processador estão amarrados no tempo — se um cai, o outro sofre. No assíncrono com fila, a fila atua como **buffer e cofre** entre os dois: produtor entrega e segue a vida, consumer processa quando puder, e nada se perde no caminho.

Esse é exatamente o **desacoplamento** que o material da aula destaca como principal vantagem da mensageria: produtor e consumer não precisam estar online ao mesmo tempo, e a linguagem de cada lado se torna indiferente.

### Onde entraria o RabbitMQ no código

No `app.post('/eventos/pedido', ...)`, em vez de processar inline e responder 202, seria algo assim:

```js
// pseudo-código com amqplib
await channel.assertQueue('pedidos', { durable: true });
channel.sendToQueue(
  'pedidos',
  Buffer.from(JSON.stringify(body)),
  { persistent: true }
);
return res.status(202).json({ status: 'enfileirado', pedidoId: body.pedidoId });
```

E o consumer rodaria em outro processo (`worker.js`) escutando a fila `pedidos` via `channel.consume(...)`.

---

## Estrutura do projeto

```
mensageria/
├── server.js                          # API Express com os endpoints
├── package.json                       # dependências
├── requests.http                      # cenários de teste (REST Client)
├── thunder-collection_Eventos.json    # cenários de teste (Thunder Client - pago)
├── .gitignore
└── README.md
```

