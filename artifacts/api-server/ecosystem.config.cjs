// PM2 Ecosystem Config - kingsmanagment.com VPS
// Secrets are loaded from /root/artifacts/api-server/.env on the server (not committed to repo).
module.exports = {
  apps: [
    {
      name: "api-server",
      script: "dist/index.mjs",
      cwd: "/root/artifacts/api-server",
      interpreter: "node",
      interpreter_args: "--enable-source-maps --env-file=/root/artifacts/api-server/.env",
      env_file: "/root/artifacts/api-server/.env",
      env: {
        PORT: 3000,
        NODE_ENV: "production",
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
