let cachedApp;
let initError;

async function init() {
  try {
    const { createApp } = require('../dist/main');
    cachedApp = await createApp();
  } catch (e) {
    initError = e;
    console.error('Init error:', e);
  }
}

const initPromise = init();

module.exports = async (req, res) => {
  await initPromise;
  if (initError) {
    return res.status(500).json({
      message: 'Initialization failed',
      error: initError.message,
      stack: initError.stack,
    });
  }
  cachedApp.getHttpAdapter().getInstance()(req, res);
};
