// Optional developer tool; Node.js 24+. Browser deployment does not need Node.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
let out='/* Vendored GPL-3.0 Uni PJSK Viewer SUS parser. See THIRD_PARTY.md and vendor/src. */\n(function(global){\n';
for(const name of ['fraction','model','parser']){
 let text=readFileSync(join(root,'vendor','src',name+'.ts'),'utf8');
 text=text.replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"]\s*$/gm,'');
 out+=stripTypeScriptTypes(text,{mode:'strip'}).replace(/\bexport\s+/g,'')+'\n';
}
out+='global.YoisakiSUS={parseSusText,Fraction,Score,Tap,Slide,Directional,TapType,SlideType,DirectionalType};\n})(typeof window!=="undefined"?window:globalThis);\n';
mkdirSync(join(root,'assets','js','vendor'),{recursive:true});
writeFileSync(join(root,'assets','js','vendor','sus-parser.js'),out);
console.log('Browser SUS parser generated.');
