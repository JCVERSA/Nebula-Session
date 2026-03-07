const { makeid } = require('./gen-id');
const express    = require('express');
const fs         = require('fs');
const path       = require('path');
const pino       = require('pino');
const router     = express.Router();

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

function removeFolder(folderPath) {
    if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
    }
}

router.get('/', async (req, res) => {
    const id          = makeid();
    const tempDir     = path.join(__dirname, 'temp', id);
    const phoneNumber = (req.query.number || '').replace(/\D/g, '');

    if (!phoneNumber) {
        return res.status(400).send({ error: 'Numéro invalide' });
    }

    async function createSocketSession() {
        const { state, saveCreds } = await useMultiFileAuthState(tempDir);
        const logger = pino({ level: 'fatal' }).child({ level: 'fatal' });

        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            printQRInTerminal: false,
            generateHighQualityLinkPreview: true,
            logger,
            syncFullHistory: false,
            browser: Browsers.macOS('Safari')
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
            if (connection === 'open') {
                await delay(5000);
                try {
                    const credsPath   = path.join(tempDir, 'creds.json');
                    const sessionData = fs.readFileSync(credsPath, 'utf8');
                    const base64      = Buffer.from(sessionData).toString('base64');
                    const sessionId   = 'NebulaBot!' + base64;

                    const sent = await sock.sendMessage(sock.user.id, { text: sessionId });

                    await sock.sendMessage(sock.user.id, {
                        text:
                            `✅ *Session Nebula Bot créée avec succès !*\n\n` +
                            `▸ Ne partage jamais ton Session ID\n` +
                            `▸ Rejoins le groupe de support\n\n` +
                            `💬 *Support :*\nhttps://chat.whatsapp.com/EqrRF0FvlTWLcgJR91RfCA\n\n` +
                            `> _Powered by Nebula Bot — Dark Neon_`,
                        contextInfo: {
                            externalAdReply: {
                                title: 'Nebula Bot',
                                body: 'Session créée ✅',
                                thumbnailUrl: 'https://files.catbox.moe/3um4vc.jpg',
                                sourceUrl: 'https://chat.whatsapp.com/EqrRF0FvlTWLcgJR91RfCA',
                                mediaType: 1,
                                renderLargerThumbnail: true
                            }
                        }
                    }, { quoted: sent });

                } catch (err) {
                    console.error('❌ Session Error:', err.message);
                    await sock.sendMessage(sock.user.id, {
                        text: `⚠️ Erreur : ${err.message}`
                    });
                } finally {
                    await delay(1000);
                    await sock.ws.close();
                    removeFolder(tempDir);
                    console.log(`✅ ${sock.user.id} session terminée`);
                    process.exit();
                }

            } else if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
                console.log('🔁 Reconnexion...');
                await delay(10);
                createSocketSession();
            }
        });

        if (!sock.authState.creds.registered) {
            await delay(1500);
            const pairingCode = await sock.requestPairingCode(phoneNumber);
            if (!res.headersSent) {
                return res.send({ code: pairingCode });
            }
        }
    }

    try {
        await createSocketSession();
    } catch (err) {
        console.error('🚨 Fatal Error:', err.message);
        removeFolder(tempDir);
        if (!res.headersSent) {
            res.status(500).send({ code: 'Service indisponible. Réessaie.' });
        }
    }
});

module.exports = router;
