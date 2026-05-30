/**
 * Liga/Desliga Notebook v2 — acesso local ou pela rede Wi-Fi/LAN
 *
 * COMO FUNCIONA:
 *  - O servidor roda no notebook e serve o painel em http://IP_DO_NOTEBOOK:3000
 *  - Outro aparelho na mesma rede acessa esse endereço e envia comandos.
 *  - O botão "Ligar" envia o pacote WoL para a rede local e, se configurado,
 *    também para o IP público do roteador.
 *
 * PRIMEIRA VEZ:
 *  1. Execute: instalar-e-iniciar.ps1  (como Administrador)
 *  2. Edite config.js com MAC e IP público, se quiser WoL externo.
 */

const express = require('express');
const { exec }  = require('child_process');
const path      = require('path');
const wol       = require('wake_on_lan');
const config    = require('./config');

const app  = express();
const PORT = config.porta || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
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
  res.json({ ok: true, online: true });
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
});
