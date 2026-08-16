// PM2 process file — the spec's "(optional if not using Docker orchestration)"
// path. Docker Compose (infra/docker/) is the primary, recommended deployment
// method for this project; this file exists for the alternative of running
// directly on a bare Ubuntu VM without containers (e.g. a small single-VM
// deployment where Docker's overhead isn't wanted). Requires `npm run build`
// to have produced apps/api/dist and apps/web/dist first.
//
// Usage: pm2 start ecosystem.config.js --env production
module.exports = {
  apps: [
    {
      name: 'medcommerce-api',
      cwd: './apps/api',
      script: 'dist/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env_production: { NODE_ENV: 'production' },
      max_memory_restart: '1G',
      error_file: '../../infra/logs/api-error.log',
      out_file: '../../infra/logs/api-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'medcommerce-worker',
      cwd: './apps/api',
      script: 'dist/worker.js',
      instances: 1, // BullMQ workers should not be naively multi-instanced without partitioning queues — one process is the safe default
      exec_mode: 'fork',
      env_production: { NODE_ENV: 'production' },
      max_memory_restart: '1G',
      error_file: '../../infra/logs/worker-error.log',
      out_file: '../../infra/logs/worker-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
