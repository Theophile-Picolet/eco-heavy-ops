const projectName = process.cwd().split('/').pop();

console.log('Projet ' + projectName);
console.log('1. Lancez npm run dev');
console.log('2. Ouvrez http://localhost:5173');
console.log('3. Lancez npx lighthouse http://localhost:5173 --view');
console.log('4. Relevez poids de page, requetes, LCP, TBT et observations qualitatives.');
