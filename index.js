const express    = require('express');
const path       = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 8000;
__path = process.cwd();

require('events').EventEmitter.defaultMaxListeners = 500;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ── Routes Pair Session ────────────────────────────────────────────────────────
const qrRouter   = require('./qr');
const pairRouter = require('./pair');
app.use('/server', qrRouter);
app.use('/code',   pairRouter);
app.use('/pair', (req, res) => res.sendFile(path.join(__path, 'pair.html')));
app.use('/qr',   (req, res) => res.sendFile(path.join(__path, 'qr.html')));

// ── Dashboard ─────────────────────────────────────────────────────────────────
const dashboardRouter = require('./dashboard');
app.use('/dashboard', dashboardRouter);
app.use('/dashboard.html', (req, res) => res.sendFile(path.join(__path, 'dashboard.html')));

// ── Home ──────────────────────────────────────────────────────────────────────
app.use('/', (req, res) => res.sendFile(path.join(__path, 'main.html')));

app.listen(PORT, () => {
    console.log(`✅ Nebula Bot Server running on port ${PORT}`);
});

module.exports = app;
