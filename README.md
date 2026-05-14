# Eventos API — Exercícios de Mensageria

## Como rodar

```bash
npm install
npm start
# servidor em http://localhost:3000
```

## Importar a Collection no Thunder Client

1. Abra Thunder Client no VS Code → aba **Collections**.
2. Clique no menu (⋯) → **Import**.
3. Selecione `thunder-collection_Eventos.json`.

A Collection "Eventos" virá com duas pastas (**Pedido** e **Pagamento**) e os 5 cenários já com **assertions** na aba *Tests*:

| Pasta     | Request                          | Esperado |
|-----------|----------------------------------|----------|
| Pedido    | Pedido — válido                  | 202      |
| Pedido    | Pedido — sem `produto`           | 400      |
| Pedido    | Pedido — body vazio              | 400      |
| Pagamento | Pagamento — válido               | 202      |
| Pagamento | Pagamento — valor negativo       | 400      |

---

## ⭐ Desafio — Síncrono (HTTP) vs Assíncrono (RabbitMQ)

### Como funciona hoje (síncrono, via HTTP)

```
Cliente ──HTTP POST──▶ /eventos/pedido (Express) ──▶ processa ──▶ 202
   │                                                                │
   └─────── espera a resposta nessa conexão TCP ◀───────────────────┘
```

O cliente abre uma conexão TCP, envia, **fica bloqueado esperando**, e só
segue depois que o servidor responde. Se o "consumer" (no caso, o próprio
Express que processa o pedido) **estiver fora do ar**:

- `connection refused` ou `timeout` imediato no cliente
- A mensagem **se perde** — não há onde armazenar nada
- O cliente precisa implementar *retry* por conta própria
- Se o processamento for lento, o cliente fica esperando junto

### Como ficaria com RabbitMQ (assíncrono)

```
                      ┌────────────────────────────┐
Cliente ─POST─▶ API ──┤ RabbitMQ (fila "pedidos")  ├──▶ Consumer (worker)
        (202)         └────────────────────────────┘
```

A API recebe o request, **publica** na fila e responde **202 imediatamente**.
O *worker* (consumer) lê a fila no seu próprio ritmo.

### O que muda quando o consumer está fora do ar

| Situação                       | Síncrono (HTTP direto)                | Assíncrono (RabbitMQ)                                |
|--------------------------------|---------------------------------------|------------------------------------------------------|
| Consumer offline               | Erro imediato (`ECONNREFUSED`)        | Mensagens **ficam acumulando na fila**               |
| Consumer volta a subir         | Cliente teve que tentar de novo       | Consumer puxa a fila e processa o backlog            |
| Cliente precisa esperar?       | Sim — até o processamento terminar    | Não — recebe 202 assim que entra na fila             |
| Perda de informação            | Possível (sem retry no cliente)       | Não — mensagens persistem (com `durable: true`)      |
| Escalabilidade                 | Limitada à instância que recebeu      | Vários consumers podem processar em paralelo         |
| Acoplamento                    | Produtor depende do consumer no ar    | Produtor e consumer não precisam estar online juntos |
| Linguagens                     | Geralmente mesma stack                | Indiferente — qualquer linguagem consome a fila      |

### Resumo em uma frase

No **síncrono**, o cliente e o processador estão amarrados no tempo —
se um cai, o outro sofre. No **assíncrono com fila**, a fila atua como
*buffer* e *cofre* entre os dois: produtor entrega e segue a vida,
consumer processa quando puder, e nada se perde no caminho.

Isso é exatamente o **desacoplamento** que o material da aula destaca
como principal vantagem da mensageria.

### Onde entraria o RabbitMQ no nosso código

No `app.post('/eventos/pedido', ...)`, em vez de processar inline e
responder 202, seria algo como:

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

E o consumer rodaria em outro processo (`worker.js`) escutando a fila
`pedidos` com `channel.consume(...)`.
