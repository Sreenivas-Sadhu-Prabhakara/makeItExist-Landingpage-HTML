'use strict';
// Jest globalSetup – runs once before any test suite or module is loaded.
// This guarantees DATABASE_URL is set in the worker process environment
// before server.js is first require()d and creates its pg Pool.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
process.env.NODE_ENV = 'test';

module.exports = async () => {};
