const fs = require('fs');
const path = 'g:\\Meu Drive\\IT\\Projetos\\DamaresEstetica\\agent\\Agente_DamaresEstetica_HTTPRequest.json';
const wf = JSON.parse(fs.readFileSync(path, 'utf8'));

const ids = ['dm-envia-wpp', 'dm-envia-alerta', 'dm-resp-midia'];
for (const id of ids) {
  const n = wf.nodes.find(x => x.id === id);
  console.log('\n=== ' + n.name + ' ===');
  console.log(n.parameters.jsCode.substring(0, 400));
  console.log('Has fetch:', n.parameters.jsCode.includes('await fetch('));
  console.log('Has $http:', n.parameters.jsCode.includes('$http.request'));
}
