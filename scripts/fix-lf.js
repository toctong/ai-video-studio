const fs = require('fs');
const files = [
  'g:/软件开发/AI Video Studio/docker/nginx.conf',
  'g:/软件开发/AI Video Studio/docker/docker-entrypoint.sh',
];
for (const p of files) {
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  fs.writeFileSync(p, c);
  console.log('normalized', p);
}
