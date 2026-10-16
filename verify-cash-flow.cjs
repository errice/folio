const fs=require('node:fs'),vm=require('node:vm');
const nodes=new Map(),node=s=>{if(!nodes.has(s))nodes.set(s,{value:'',innerHTML:'',textContent:'',classList:{toggle(){},add(){},remove(){}},showModal(){},close(){}});return nodes.get(s);};
const context=vm.createContext({document:{querySelector:node,addEventListener(){}},window:{addEventListener(){},scrollTo(){}},localStorage:{getItem(){return null;},setItem(){}},location:{hash:'#overview'},crypto:require('node:crypto').webcrypto,Intl,Date,console,setTimeout(){},clearTimeout(){}});
for(const file of ['category-icons.js','currencies.js','app.js'])vm.runInContext(fs.readFileSync('public/'+file,'utf8'),context);
vm.runInContext(`
const assert=(ok,message)=>{if(!ok)throw Error(message);};
assert(cashFlowPeriods(1,'2027-01-03').join(',')==='2026-12-28,2026-12-29,2026-12-30,2026-12-31,2027-01-01,2027-01-02,2027-01-03','Week crosses year boundary');
assert(cashFlowPeriods(1,'2028-03-02').includes('2028-02-29'),'Leap day included');
assert(new Set(cashFlowPeriods(1,'2026-11-03')).size===7,'Seven distinct calendar days across daylight saving change');
fxSnapshot={base:'USD',rates:{USD:1,CAD:1.4},dates:{CAD:'2026-10-15'}};
state={currency:'USD',accounts:[{id:'a',type:'bank',balance:0,currency:'USD'}],transactions:[],budgets:[]};
const dates=cashFlowPeriods(1),first=dates[0],last=dates[6];
const previous=new Date(first+'T12:00:00');previous.setDate(previous.getDate()-1);
const future=new Date(last+'T12:00:00');future.setDate(future.getDate()+1);
state.transactions=[{type:'income',amount:140,currency:'CAD',date:first},{type:'expense',amount:20,currency:'USD',date:last},{type:'expense',amount:999,currency:'USD',date:previous.toLocaleDateString('en-CA')},{type:'income',amount:999,currency:'USD',date:future.toLocaleDateString('en-CA')}];
const week=dates.map(totals);assert(week.reduce((s,d)=>s+d.income,0)===100,'Week converts native income and excludes future dates');assert(week.reduce((s,d)=>s+d.expense,0)===20,'Week includes today and excludes older transactions');
period=1;const weekly=chartPanel();assert(weekly.includes('last 7 days')&&(weekly.match(/<rect /g)||[]).length===14,'Weekly chart has seven daily income/expense pairs');assert(!weekly.includes('NaN'),'Weekly scale remains valid');
state.transactions=[];assert(!chartPanel().includes('NaN'),'Empty week has valid chart scale');
for(const n of [3,6,12]){period=n;assert(cashFlowPeriods().length===n,'Monthly bucket count preserved');assert(chartPanel().includes('last '+n+' months'),'Monthly chart preserved');}
`,context);
console.log('Cash flow checks passed: seven-day boundaries, currency conversion, empty data, and monthly views.');
