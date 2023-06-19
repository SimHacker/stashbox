// server.js
import { start } from './build/index.js';

const PORT = process.env.PORT || 5000;

start({ port: PORT });
