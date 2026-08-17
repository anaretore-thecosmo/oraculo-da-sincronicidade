// =====================================================================
// PM2 — oraculo-api
// Destino: /var/www/oraculo-api/ecosystem.config.js
//
// Subir:    pm2 start ecosystem.config.js && pm2 save
// Logs:     pm2 logs oraculo-api
// Reiniciar: pm2 restart oraculo-api
// =====================================================================

module.exports = {
  apps: [
    {
      name: 'oraculo-api',
      script: 'server.js',
      cwd: '/var/www/oraculo/server',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      // Log separado por app. Nada de tudo misturado no log do PM2.
      out_file: '/var/log/oraculo-api/out.log',
      error_file: '/var/log/oraculo-api/error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
