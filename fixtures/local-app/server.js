#!/usr/bin/env node
// Throwaway local login page for PW-001 — stands in for a real staging app
// until one exists. Zero dependencies on purpose (fixture, not product code).
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

const ROUTES = {
  '/': 'login.html',
  '/login': 'login.html',
  '/dashboard': 'dashboard.html',
};

const server = http.createServer((req, res) => {
  const file = ROUTES[req.url];
  if (!file) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  fs.readFile(path.join(ROOT, file), (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Server error');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Login fixture running at http://localhost:${PORT}`);
});
