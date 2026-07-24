'use strict';

// AggregateError (e.g. pg's ECONNREFUSED, which retries IPv4/IPv6) has an empty
// .message by design — the real detail lives in .code or nested .errors. Plain
// Errors already have a good .message, so this is a no-op for those.
function describeError(err) {
  if (err.message) return err.message;
  if (err.code) return err.code;
  if (Array.isArray(err.errors) && err.errors.length > 0) {
    return err.errors.map((e) => e.message || e.code || String(e)).join('; ');
  }
  return String(err);
}

module.exports = { describeError };
