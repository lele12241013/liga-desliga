/**
 * Liga/Desliga Notebook v2 — app Windows leve com acesso externo via Cloudflare Tunnel
 *
 * COMO FUNCIONA:
 *  - O servidor roda no notebook e serve o painel localmente em http://localhost:3000.
 *  - O cloudflared cria um link público sem depender de roteador ou port forwarding.
 *  - O botão "Ligar" continua usando Wake-on-LAN pela rede local.
 *
 * PRIMEIRA VEZ:
 *  1. Execute: instalar-e-iniciar.ps1  (como Administrador)
 *  2. Se quiser WoL fora da rede, mantenha o IP público configurado em config.js.
 */

const express = require('express');
const { exec, spawn }  = require('child_process');
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

// Wake-on-LAN — envia para broadcast local
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

  iniciarTunnelCloudflare();
});

function iniciarTunnelCloudflare() {
  const cloudflared = process.env.CLOUDFLARED_PATH || 'cloudflared';
  const args = ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'];

  try {
    const processo = spawn(cloudflared, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let urlPublicado = false;

    const registrarLinha = linha => {
      const texto = String(linha || '').trim();
      if (!texto) return;

      console.log(`[cloudflared] ${texto}`);

      const match = texto.match(/https:\/\/[-a-z0-9]+\.trycloudflare\.com/i);
      if (match && !urlPublicado) {
        urlPublicado = true;
        console.log(`✅ Link externo: ${match[0]}`);
      }
    };

    processo.stdout.on('data', data => {
      String(data).split(/\r?\n/).forEach(registrarLinha);
    });

    processo.stderr.on('data', data => {
      String(data).split(/\r?\n/).forEach(registrarLinha);
    });

    processo.on('error', err => {
      console.warn('⚠️  cloudflared nao encontrado ou nao iniciou:', err.message);
      console.warn('   Instale o cloudflared para acesso externo.');
    });

    processo.on('exit', code => {
      if (code !== 0) {
        console.warn(`⚠️  cloudflared encerrou com codigo ${code}.`);
      }
    });
  } catch (err) {
    console.warn('⚠️  Nao foi possivel iniciar cloudflared:', err.message);
  }
}
