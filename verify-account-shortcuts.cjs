const fs=require('node:fs'),vm=require('node:vm');
const nodes=new Map(),node=s=>{if(!nodes.has(s))nodes.set(s,{value:'',innerHTML:'',textContent:'',classList:{toggle(){},add(){},remove(){}},showModal(){},close(){}});return nodes.get(s);};
const context=vm.createContext({document:{querySelector:node,addEventListener(){}},window:{addEventListener(){},scrollTo(){}},localStorage:{getItem(){return null;},setItem(){}},location:{hash:'#accounts'},crypto:require('node:crypto').webcrypto,Intl,Date,console,setTimeout(){},clearTimeout(){}});
for(const file of ['category-icons.js','currencies.js','app.js'])vm.runInContext(fs.readFileSync('public/'+file,'utf8'),context);
vm.runInContext(`
const assert=(ok,message)=>{if(!ok)throw Error(message);};
let captured,saves=0;modal=(title,body,submit)=>{captured={title,body,submit};};save=()=>{saves++;};toast=()=>{};
state={version:2,currency:'CAD',demo:false,accounts:[],transactions:[],budgets:[],categories:[{name:'Other income',type:'income',icon:'income'},{name:'Other',type:'expense',icon:'other'}]};
const form=(amount,type)=>({get:key=>({name:'Quick money record',amount:String(amount),category:type==='income'?'Other income':'Other',date:today()})[key]??null});
for(const type of ['bank','savings','cash','investment','debt']){
 state.accounts=[{id:'test',name:'Test',institution:'Test',type,currency:'NGN',balance:1000}];state.transactions=[];
 for(const direction of [1,-1]){
  const before=state.accounts[0].balance,count=state.transactions.length;
  txnModal('test',direction);assert($('#field-accountId').disabled&&$('#field-type').disabled,'Shortcut keeps account and direction fixed');
  const transactionType=(direction===1)!==(type==='debt')?'income':'expense';
  captured.submit(form(25.50,transactionType));
  assert(state.accounts[0].balance===before+direction*25.50,'Correct balance direction for '+type);
  assert(state.transactions.length===count+1,'Exactly one transaction created');
  const t=state.transactions.at(-1);assert(t.amount===25.50&&t.currency==='NGN'&&t.accountId==='test'&&t.type===transactionType&&t.name==='Quick money record','Native amount and record details match');
 }
}
for(const amount of [0,-1,Infinity,NaN,0.001,1000000000]){
 txnModal('test',1);const before=saves;let rejected=false;try{captured.submit(form(amount,'expense'));}catch{rejected=true;}assert(rejected&&saves===before,'Invalid amount is rejected without saving');
}
state.accounts[0].balance=10;txnModal('test',-1);const count=state.transactions.length;let rejected=false;try{captured.submit(form(11,'income'));}catch{rejected=true;}assert(rejected&&state.accounts[0].balance===10&&state.transactions.length===count,'Cannot reduce debt below zero');
state.accounts[0].type='bank';txnModal('test',-1);rejected=false;try{captured.submit(form(11,'expense'));}catch{rejected=true;}assert(rejected&&state.accounts[0].balance===10,'Cannot overdraw an account');
const cards=accountCards();assert(cards.includes('data-account-add="test"')&&cards.includes('data-account-subtract="test"'),'Both shortcuts appear on the account card');
`,context);
console.log('Account shortcuts passed: all account types, native currencies, matching records, invalid amounts, and balance limits.');
