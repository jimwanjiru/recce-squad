// Offline analysis. Never print cell contents from personnel records.
const ExcelJS = require('exceljs');
const fs = require('node:fs/promises');
async function analyze(file) {
 const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
 const value = c => { const v=c.value; return v && typeof v==='object' && 'formula' in v ? v.result : v; };
 const text = c => { const v=value(c); return v == null || typeof v==='object' ? '' : String(v).trim(); };
 const report = {sheets:[], names:{}, warnings:[]};
 for(const s of wb.worksheets) {
  let populatedRows=0,formulas=0,errors=0;
  s.eachRow(r=>{populatedRows++;r.eachCell(c=>{if(c.type===ExcelJS.ValueType.Formula) formulas++;const v=value(c);if(v && typeof v==='object' && 'error' in v)errors++;});});
  report.sheets.push({name:s.name.trim(),physicalRows:s.rowCount,populatedRows,columns:s.columnCount,formulas,cachedErrors:errors});
 }
 const s=wb.getWorksheet('NAMES');const seen=new Set();let candidates=0,missingForce=0,duplicateForce=0,rankDifferences=0;const types={};
 s.eachRow((r,i)=>{if(i===1)return; const force=text(r.getCell(2)),name=text(r.getCell(6));if(!name)return;candidates++;if(!force)missingForce++;if(force && seen.has(force))duplicateForce++;if(force)seen.add(force);if(text(r.getCell(4))!==text(r.getCell(5)))rankDifferences++;
 for(let c=1;c<=38;c++){const v=value(r.getCell(c));const t=v instanceof Date?'date':v===null||v===undefined?'empty':typeof v;types[c]??={};types[c][t]=(types[c][t]||0)+1;}
 });
 report.names={candidateRows:candidates,missingForce,duplicateForce,rankDifferences,headers:s.getRow(1).values.slice(1).map((v,i)=>i===37?'Derived retirement flag (error header)':String(v).trim()),columnTypes:types};
 report.warnings=['Candidate rows require validation; a populated name does not prove a valid officer.','Cached formula results are not recalculated by ExcelJS.','CHANGES uses multiple section layouts and must not use NAMES column offsets.','Do not publish raw rows, identifiers, names, demographics or account data.'];return report;
}
if(require.main===module) analyze(process.argv[2]||'reference/RECCE DETAILED.xlsx').then(r=>process.stdout.write(JSON.stringify(r,null,2)+'\n')).catch(()=>{console.error('Workbook analysis failed; verify the file and XLSX format.');process.exitCode=1;});
module.exports={analyze};
