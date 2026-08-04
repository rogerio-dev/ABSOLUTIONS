const express = require('express');
const compression = require('compression');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(compression());

// Cabeçalhos de segurança
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  });
  next();
});

// Redireciona para o domínio oficial, evitando que o endereço interno da
// Railway seja indexado como conteúdo duplicado. Fica inativo enquanto a
// variável CANONICAL_HOST não estiver definida.
const CANONICAL_HOST = process.env.CANONICAL_HOST;

app.use((req, res, next) => {
  const host = req.headers.host;
  if (!CANONICAL_HOST || !host || host === CANONICAL_HOST || host.startsWith('localhost')) {
    return next();
  }
  res.redirect(301, `https://${CANONICAL_HOST}${req.originalUrl}`);
});

app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        // CSS, JS e imagens podem ficar em cache por 7 dias
        res.setHeader('Cache-Control', 'public, max-age=604800');
      }
    }
  })
);

// Qualquer rota desconhecida cai no 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
  console.log(`AB Solutions no ar em http://localhost:${PORT}`);
});
