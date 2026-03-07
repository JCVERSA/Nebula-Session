/**
 * Nebula Bot — Dashboard Server
 * Gère l'authentification owner et les settings du bot
 */

const express    = require('express');
const path       = require('path');
const fs         = require('fs');
const router     = express.Router();

const SETTINGS_FILE = path.join(__dirname, 'dashboard-settings.json');
const OWNER_NUMBER  = process.env.OWNER_NUMBER || '237640143760';

// Charge ou initialise les settings
function loadSettings() {
    if (fs.existsSync(SETTINGS_FILE)) {
        try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
        catch(e) {}
    }
    return getDefaultSettings();
}

function saveSettings(settings) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function getDefaultSettings() {
    return {
        // Bot général
        selfMode:     false,
        autoRead:     false,
        autoTyping:   false,
        autoBio:      false,
        autoSticker:  false,
        autoReact:    true,
        autoReactMode: 'bot',
        autoDownload: false,
        prefix:       '.',
        botName:      'Nebula Bot',
        timezone:     'Europe/Paris',
        maxWarnings:  3,

        // Groupes
        antilink:              false,
        antilinkAction:        'delete',
        antitag:               false,
        antitagAction:         'delete',
        antiall:               false,
        antiviewonce:          false,
        antibot:               false,
        anticall:              false,
        antigroupmention:      false,
        antigroupmentionAction:'delete',
        welcome:               false,
        goodbye:               false,
        antiSpam:              false,
        antidelete:            false,
        nsfw:                  false,
        detect:                false,
        chatbot:               false,
        autosticker:           false,
    };
}

// Sessions actives (en mémoire)
const activeSessions = new Map();

// ─── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
    const token = req.headers['x-auth-token'] || req.query.token;
    if (token && activeSessions.has(token)) {
        req.owner = activeSessions.get(token);
        return next();
    }
    res.status(401).json({ error: 'Non autorisé' });
}

// ─── Routes publiques ──────────────────────────────────────────────────────────

// Page dashboard HTML
router.get('/', (req, res) => {
    res.sendFile(path.join(__path, 'dashboard.html'));
});

// Login — envoie un OTP WhatsApp (simulé ici, à brancher sur sock)
router.post('/auth/request', express.json(), async (req, res) => {
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Numéro requis' });

    const clean = number.replace(/\D/g, '');
    if (clean !== OWNER_NUMBER) {
        return res.status(403).json({ error: 'Accès refusé — numéro non autorisé' });
    }

    // Génère un OTP 6 chiffres
    const otp   = Math.floor(100000 + Math.random() * 900000).toString();
    const token = Buffer.from(`${clean}:${Date.now()}:${Math.random()}`).toString('base64');

    // Stocke l'OTP temporairement (5 min)
    activeSessions.set(`otp:${clean}`, { otp, token, expires: Date.now() + 300000 });

    // Envoie l'OTP via WhatsApp si le bot est connecté
    try {
        if (global.botSock && global.botSock.user) {
            await global.botSock.sendMessage(`${clean}@s.whatsapp.net`, {
                text: `🔐 *Nebula Bot Dashboard*\n\nTon code de connexion :\n\n*${otp}*\n\n_Valide 5 minutes. Ne le partage pas._`
            });
            res.json({ success: true, message: 'OTP envoyé sur WhatsApp' });
        } else {
            // Bot pas connecté — renvoie l'OTP dans la réponse (mode dev)
            res.json({ success: true, message: 'Bot hors ligne — OTP: ' + otp, dev_otp: otp });
        }
    } catch(e) {
        res.json({ success: true, message: 'OTP: ' + otp, dev_otp: otp });
    }
});

// Vérification OTP
router.post('/auth/verify', express.json(), (req, res) => {
    const { number, otp } = req.body;
    const clean = number?.replace(/\D/g, '');
    const stored = activeSessions.get(`otp:${clean}`);

    if (!stored || Date.now() > stored.expires) {
        return res.status(400).json({ error: 'OTP expiré ou invalide' });
    }
    if (stored.otp !== otp) {
        return res.status(400).json({ error: 'Code incorrect' });
    }

    // Crée le token de session
    activeSessions.delete(`otp:${clean}`);
    activeSessions.set(stored.token, { number: clean, loginAt: Date.now() });

    res.json({ success: true, token: stored.token });
});

// ─── Routes protégées ──────────────────────────────────────────────────────────

// Récupère tous les settings
router.get('/settings', requireAuth, (req, res) => {
    res.json(loadSettings());
});

// Met à jour un ou plusieurs settings
router.post('/settings', requireAuth, express.json(), (req, res) => {
    const current  = loadSettings();
    const updated  = { ...current, ...req.body };
    saveSettings(updated);

    // Applique en live si le bot est connecté
    if (global.botConfig) {
        Object.assign(global.botConfig, updated);
    }

    res.json({ success: true, settings: updated });
});

// Reset aux valeurs par défaut
router.post('/settings/reset', requireAuth, (req, res) => {
    const defaults = getDefaultSettings();
    saveSettings(defaults);
    res.json({ success: true, settings: defaults });
});

// Statut du bot
router.get('/status', requireAuth, (req, res) => {
    const connected = !!(global.botSock && global.botSock.user);
    res.json({
        connected,
        user: connected ? global.botSock.user : null,
        uptime: process.uptime()
    });
});

// Logout
router.post('/auth/logout', requireAuth, (req, res) => {
    const token = req.headers['x-auth-token'];
    activeSessions.delete(token);
    res.json({ success: true });
});

module.exports = router;
module.exports.loadSettings = loadSettings;
