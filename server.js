/**
 * Liga/Desliga Notebook v2 — Acesso de QUALQUER rede via túnel ngrok
 *
 * COMO FUNCIONA:
 *  - O servidor roda no notebook e abre um túnel HTTPS automático (ngrok).
 *  - Um URL público é gerado: https://xxxx.ngrok-free.app
 *  - Você acessa esse URL de qualquer celular, de qualquer rede do mundo.
 *  - O URL é enviado para o seu Telegram (se configurado) toda vez que o
 *    notebook ligar, para você sempre ter o endereço atualizado.
 *
 * WoL (ligar de fora da rede):
 *  - Configure no roteador: redirecionamento UDP porta 9 → IP local do notebook.
 *  - Informe ip_publico em config.js.
 *  - O botão "Ligar" envia o pacote para o IP público + broadcast local.
 *  - Obs: quando o notebook está desligado, acesse o URL salvo no Telegram
 *    de OUTRO dispositivo ligado, ou use um app WoL no celular.
 *
 * PRIMEIRA VEZ:
 *  1. Execute: configurar-windows.ps1  (como Administrador)
 *  2. Edite config.js com MAC, token ngrok e Telegram.
 */

const express = require('express');
const { exec }  = require('child_process');
const path      = require('path');
const https     = require('https');
const http      = require('http');
const wol       = require('wake_on_lan');
const config    = require('./config');

const app  = express();
const PORT = config.porta || 3000;

// URL pública do túnel (preenchida ao conectar)
let tunnelUrl = null;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, ngrok-skip-browser-warning');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'docs')));

// ─── Rotas ───────────────────────────────────────────────────────────────────

app.get('/api/status', (_req, res) => {
  res.json({ ok: true, online: true, tunnelUrl });
});

app.post('/api/desligar', (_req, res) => {
  exec('shutdown /s /f /t 0', err => {
    if (err) return res.status(500).json({ ok: false, mensagem: err.message });
    res.json({ ok: true, mensagem: 'Desligamento forcado iniciado.' });
  });
});

app.post('/api/cancelar', (_req, res) => {
  exec('shutdown /a', err => {
    if (err) return res.status(500).json({ ok: false, mensagem: err.message });
    res.json({ ok: true, mensagem: 'Desligamento cancelado.' });
  });
});

app.post('/api/reiniciar', (_req, res) => {
  exec('shutdown /r /t 5', err => {
    if (err) return res.status(500).json({ ok: false, mensagem: err.message });
    res.json({ ok: true, mensagem: 'Reiniciando em 5s…' });
  });
});

app.post('/api/suspender', (_req, res) => {
  exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0', err => {
    if (err) return res.status(500).json({ ok: false, mensagem: err.message });
    res.json({ ok: true, mensagem: 'Suspendendo…' });
  });
});

// Wake-on-LAN — envia para broadcast local e para IP público (via roteador)
app.post('/api/ligar', (req, res) => {
  const mac = config.mac_address;
  if (!mac || mac.includes('X')) {
    return res.status(400).json({ ok: false, mensagem: 'MAC address não configurado em config.js.' });
  }

  const targets = [config.broadcast || '255.255.255.255'];
  if (config.ip_publico) targets.push(config.ip_publico);

  let ok = 0, erros = [];
  targets.forEach(addr => {
    wol.wake(mac, { address: addr }, err => {
      if (err) erros.push(`${addr}: ${err.message}`);
      else ok++;
      if (ok + erros.length === targets.length) {
        if (ok > 0)
          res.json({ ok: true, mensagem: `Pacote WoL enviado para ${mac} (${ok} destino(s))` });
        else
          res.status(500).json({ ok: false, mensagem: erros.join(' | ') });
      }
    });
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', async () => {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   Liga/Desliga Notebook v2 — Iniciado        ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Local:  http://localhost:${PORT}                  ║`);
  console.log('╚══════════════════════════════════════════════╝\n');

  if (config.ngrok_token) {
    try {
      const ngrok = require('@ngrok/ngrok');
      const listener = await ngrok.forward({ addr: PORT, authtoken: config.ngrok_token });
      tunnelUrl = listener.url();
      console.log(`✅ Túnel ativo: ${tunnelUrl}\n`);

      if (config.telegram_token && config.telegram_chat_id) {
        notificarTelegram(
          `🟢 *Notebook Online*\n` +
          `Painel: ${tunnelUrl}\n` +
          `Guarde este link — muda a cada reinício.`
        );
      }
      if (config.webhook_url) notificarWebhook(tunnelUrl);
    } catch (e) {
      console.warn('⚠️  Falha no túnel ngrok:', e.message);
      console.warn('   Verifique ngrok_token em config.js\n');
    }
  } else {
    console.log('ℹ️  ngrok_token não configurado — acesso apenas na rede local.');
    console.log('   Edite config.js e adicione seu token: https://dashboard.ngrok.com\n');
  }
});

// ─── Notificações ─────────────────────────────────────────────────────────────

function notificarTelegram(msg) {
  const body = JSON.stringify({ chat_id: config.telegram_chat_id, text: msg, parse_mode: 'Markdown' });
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${config.telegram_token}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, () => {});
  req.on('error', e => console.warn('Telegram:', e.message));
  req.write(body);
  req.end();
}

function notificarWebhook(url) {
  const body = JSON.stringify({ online: true, url: tunnelUrl });
  const lib  = url.startsWith('https') ? https : http;
  try {
    const parsed = new URL(url);
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (url.startsWith('https') ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, () => {});
    req.on('error', e => console.warn('Webhook:', e.message));
    req.write(body);
    req.end();
  } catch (e) {
    console.warn('Webhook URL inválida:', e.message);
  }
}
