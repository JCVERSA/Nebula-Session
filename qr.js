const { makeid } = require('./gen-id');
const express    = require('express');
const QRCode     = require('qrcode');
const fs         = require('fs');
const path       = require('path');
const pino       = require('pino');
const router     = express.Router();

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers
} = require('@whiskeysockets/baileys');

const { upload } = require('./mega');

function removeFile(filePath) {
    if (!fs.existsSync(filePath)) return false;
    fs.rmSync(filePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = makeid();

    async function startQR() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        try {
            const sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }),
                browser: Browsers.macOS('Desktop')
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
                if (qr && !res.headersSent) {
                    const qrBuffer = await QRCode.toBuffer(qr);
                    res.end(qrBuffer);
                }

                if (connection === 'open') {
                    await delay(5000);
                    const credsPath = path.join(__dirname, 'temp', id, 'creds.json');

                    try {
                        const megaUrl       = await upload(fs.createReadStream(credsPath), `${sock.user.id}.json`);
                        const sessionId     = megaUrl.replace('https://mega.nz/file/', '');
                        const fullSessionId = 'NebulaBot!' + sessionId;

                        const sent = await sock.sendMessage(sock.user.id, { text: fullSessionId });

                        await sock.sendMessage(sock.user.id, {
                            text: `✅ *Session créée avec succès !*\n\n🤖 *Nebula Bot* est prêt à être connecté.\n\n🔐 Ton Session ID a été envoyé ci-dessus.\n⚠️ Ne le partage avec personne.\n\n💬 Rejoins le groupe de support :\nhttps://chat.whatsapp.com/EqrRF0FvlTWLcgJR91RfCA\n\n> _Powered by Nebula Bot — Dark Neon_`,
                            contextInfo: {
                                externalAdReply: {
                                    title: 'Nebula Bot',
                                    body: 'Session créée avec succès ✅',
                                    thumbnailUrl: 'https://files.catbox.moe/3um4vc.jpg',
                                    sourceUrl: 'https://chat.whatsapp.com/EqrRF0FvlTWLcgJR91RfCA',
                                    mediaType: 1,
                                    renderLargerThumbnail: true
                                }
                            }
                        }, { quoted: sent });

                    } catch (e) {
                        await sock.sendMessage(sock.user.id, { text: `❗ Erreur : ${e.message || e}` });
                    }

                    await delay(100);
                    await sock.ws.close();
                    removeFile('./temp/' + id);
                    process.exit(0);

                } else if (
                    connection === 'close' &&
                    lastDisconnect?.error?.output?.statusCode !== 401
                ) {
                    await delay(1000);
                    startQR();
                }
            });

        } catch (err) {
            removeFile('./temp/' + id);
        }
    }

    await startQR();
});

// Redémarre toutes les 30 min pour éviter les sessions bloquées
setInterval(() => process.exit(0), 30 * 60 * 1000);

module.exports = router;
