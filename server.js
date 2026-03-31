const express = require('express');
const { exec } = require('child_process');

const app = express();

app.use(express.static(__dirname));

app.get('/run', (req, res) => {
  exec('node run.js', (err, stdout) => {
    res.send(`<pre>${stdout}</pre>`);
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});