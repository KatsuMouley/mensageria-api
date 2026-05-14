// server.js
// Exercícios 1, 2 e 3 — Endpoints de eventos (síncronos, via HTTP)

const express = require('express');
const app = express();

app.use(express.json());

// -------------------------------------------------------------
// Middleware de log — ajuda a "observar o log no terminal"
// -------------------------------------------------------------
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length) {
    console.log('  body:', JSON.stringify(req.body));
  }
  next();
});

// -------------------------------------------------------------
// Health-check — útil pra abrir no navegador e confirmar que o
// servidor está no ar (browser sempre faz GET).
// -------------------------------------------------------------
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    rotas: [
      'POST /eventos/pedido',
      'POST /eventos/pagamento',
    ],
  });
});

// =============================================================
// Exercício 1 + 2 — POST /eventos/pedido
// =============================================================
// Body esperado:
// {
//   "pedidoId": "abc-123",
//   "cliente":  "Katsu",
//   "produto":  "Notebook",
//   "quantidade": 2,
//   "valor": 5000
// }
app.post('/eventos/pedido', (req, res) => {
  const body = req.body || {};

  // body completamente vazio -> 400
  if (!body || Object.keys(body).length === 0) {
    return res.status(400).json({
      erro: 'BODY_VAZIO',
      mensagem: 'O corpo da requisição não pode estar vazio.',
    });
  }

  // campos obrigatórios
  const camposObrigatorios = ['pedidoId', 'cliente', 'produto', 'quantidade', 'valor'];
  const faltando = camposObrigatorios.filter((c) => body[c] === undefined || body[c] === null || body[c] === '');

  if (faltando.length > 0) {
    return res.status(400).json({
      erro: 'CAMPOS_OBRIGATORIOS_AUSENTES',
      camposAusentes: faltando,
    });
  }

  // Aqui, num cenário real, publicaríamos na fila do RabbitMQ.
  // Como é síncrono via HTTP, apenas logamos e respondemos 202.
  console.log('  ✅ Evento de pedido aceito:', body.pedidoId);

  return res.status(202).json({
    status: 'aceito',
    pedidoId: body.pedidoId,
    recebidoEm: new Date().toISOString(),
  });
});

// =============================================================
// Exercício 3 — POST /eventos/pagamento
// =============================================================
// Body esperado: { pedidoId, valor, metodo }
app.post('/eventos/pagamento', (req, res) => {
  const { pedidoId, valor, metodo } = req.body || {};

  if (!pedidoId || valor === undefined || !metodo) {
    return res.status(400).json({
      erro: 'CAMPOS_OBRIGATORIOS_AUSENTES',
      mensagem: 'pedidoId, valor e metodo são obrigatórios.',
    });
  }

  if (typeof valor !== 'number' || valor <= 0) {
    return res.status(400).json({
      erro: 'VALOR_INVALIDO',
      mensagem: 'O valor deve ser um número maior que zero.',
    });
  }

  const metodosAceitos = ['pix', 'cartao', 'boleto'];
  if (!metodosAceitos.includes(metodo)) {
    return res.status(400).json({
      erro: 'METODO_INVALIDO',
      metodosAceitos,
    });
  }

  console.log(`  ✅ Pagamento aceito para pedido ${pedidoId}: R$ ${valor} via ${metodo}`);

  return res.status(202).json({
    status: 'aceito',
    pedidoId,
    valor,
    metodo,
    recebidoEm: new Date().toISOString(),
  });
});

// -------------------------------------------------------------
// Inicialização
// -------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}`);
  console.log('   POST /eventos/pedido');
  console.log('   POST /eventos/pagamento');
});
