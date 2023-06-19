// server.js
const { PORT = 5000 } = process.env;
require('./build/index.js').start({ port: PORT });
