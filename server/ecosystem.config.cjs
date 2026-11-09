module.exports = {
  apps: [
    {
      name: "roadguard-api",
      script: "./dist/index.js",
      instances: "max",
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "development",
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5000,
        DATABASE_URL: "file:./prisma/roadguard.db",
        RATE_LIMIT_WINDOW_MS: 900000,
        RATE_LIMIT_MAX: 200,
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/error.log",
      out_file: "./logs/combined.log",
      merge_logs: true,
      time: true,
    },
  ],
}

