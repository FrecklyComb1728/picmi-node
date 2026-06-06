module.exports = {
  apps: [{
    name: 'picmi-node',
    script: 'index.js',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '256M',
    autorestart: true,
    env: { NODE_ENV: 'production', PORT: 5409 }
  }]
};
