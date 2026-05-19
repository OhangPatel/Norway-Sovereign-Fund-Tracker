import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve public folder as static
app.use(express.static(path.join(__dirname, 'public')));

// Serve src folder (for .jsx files) - this is the key fix
app.use('/src', express.static(path.join(__dirname, 'src')));

// All other routes return index.html (for client-side routing if needed)
 // Catch-all route for SPA
 app.all('*', (req, res) => {
   if (!req.path.startsWith('/src') && !req.path.startsWith('/data.json')) {
     res.sendFile(path.join(__dirname, 'public', 'index.html'));
   }
 });

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
 console.log(`\n✓ Server running at http://localhost:${PORT}\n`);
