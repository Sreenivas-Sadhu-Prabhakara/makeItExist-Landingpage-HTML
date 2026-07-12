// Vercel serverless entry point — hands every routed request to the Express app.
// server.js exports the app without calling app.listen() when imported here.
module.exports = require('../server.js');
