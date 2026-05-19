const express = require('express');
const path = require('path');
const app = express();

// Serve static files from public
app.use(express.static(path.join(__dirname, 'public')));

// Serve src as static files
app.use('/src', express.static(path.join(__dirname, 'src')));

// Fallback to index.html for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`\n✓ Server running at http://localhost:${PORT}\n`);
});
