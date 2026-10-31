module.exports = {
  apps: [
    {
      name: "fms-api",
      cwd: "/var/www/fms/artifacts/api-server",
      script: "node",
      args: "--enable-source-maps ./dist/index.mjs",
      env: {
        NODE_ENV: "production",
        PORT: 8080,
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: "fms-flight-system",
      cwd: "/var/www/fms/artifacts/flight-system",
      script: "npx",
      args: "serve dist/public -l 18693 --no-clipboard --single",
      env: {
        NODE_ENV: "production",
      },
      watch: false,
      autorestart: true,
    },
    {
      name: "fms-booking-engine",
      cwd: "/var/www/fms/artifacts/booking-engine",
      script: "npx",
      args: "serve dist/public -l 24633 --no-clipboard --single",
      env: {
        NODE_ENV: "production",
      },
      watch: false,
      autorestart: true,
    },
  ],
};
