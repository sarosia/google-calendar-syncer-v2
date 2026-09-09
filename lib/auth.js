const Apper = require('@sarosia/apper');

class SyncerAuthManager extends Apper.AuthManager {
  constructor(config = {}, logger = console) {
    const syncerConfig = {
      ...config,
      auth: {
        cookieName: 'gcs_session',
        ...(config.auth || {}),
      },
    };
    super('calendersyncer', syncerConfig, logger);
  }
}

module.exports = SyncerAuthManager;
