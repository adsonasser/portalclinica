let cachedApp;

module.exports = async (req, res) => {
  if (!cachedApp) {
    const { createApp } = require('../dist/main');
    cachedApp = await createApp();
  }
  cachedApp.getHttpAdapter().getInstance()(req, res);
};
