// server.js
import http from 'http';
import { init, render } from './build/index.js';

const PORT = process.env.PORT || 5000;

init().then(() => {
  http.createServer((req, res) => {
    render({ method: req.method, headers: req.headers, path: req.url, body: '' })
      .then(({ status, headers, body }) => {
        res.writeHead(status, headers);
        res.end(body);
      });
  }).listen(PORT, () => console.log(`Listening on port ${PORT}`));
});
