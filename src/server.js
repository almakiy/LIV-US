const cfg = require('./config');
const app = require('./app');
const { bootstrap } = require('./lib/bootstrap');

bootstrap().finally(() => {
  app.listen(cfg.port, () => console.log(`${cfg.brand} certification platform on ${cfg.baseUrl} (port ${cfg.port})`));
});
