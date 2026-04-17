const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');
code = code.replace('const app = express();', "const app = express();\nif (!fs.existsSync('uploads')) fs.mkdirSync('uploads');");
fs.writeFileSync('server.js', code);
console.log('done');
