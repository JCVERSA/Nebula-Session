const mega = require('megajs');

const email = process.env.MEGA_EMAIL;
const pw    = process.env.MEGA_PASSWORD;

const auth = {
  email,
  password: pw,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
};

const upload = (stream, filename) => {
  return new Promise((resolve, reject) => {
    try {
      const storage = new mega.Storage(auth, () => {
        const uploadStream = storage.upload({ name: filename, allowUploadBuffering: true });
        stream.pipe(uploadStream);
        uploadStream.on('complete', (file) => {
          file.link((err, url) => {
            if (err) throw err;
            storage.close();
            resolve(url);
          });
        });
      });
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { upload };
