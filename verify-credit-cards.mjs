import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { validateFinance } from './lib/finance-store.mjs';
const nodes=new Map(),node=s=>{if(!nodes.has(s))nodes.set(s,{value:'',innerHTML:'',textContent:'',classList:{toggle(){},add(){},remove(){}},showModal(){},close(){}});return nodes.get(s);};
const context=vm.createContext({assert,document:{querySelector:node,addEventListener(){}},window:{addEventListener(){},scrollTo(){}},localStorage:{getItem(){return null;},setItem(){}},location:{hash:'#creditcards'},crypto:webcrypto,Intl,Date,console,setTimeout(){},clearTimeout(){}});
for(const file of ['category-icons.js','currencies.js','app.js'])vm.runInContext(readFileSync('public/'+file,'utf8'),context);
vm.runInContext(`
let captured;modal=(title,body,submit)=>{captured={title,body,submit};};save=()=>{};toast=()=>{};
fxSnapshot={base:'USD',rates:{USD:1,CAD:2,NGN:1000}};
state={version:2,currency:'CAD',demo:false,accounts:[{id:'cad',name:'CAD card',institution:'Test',type:'debt',debtKind:'credit-card',creditLimit:1000,balance:100,currency:'CAD'},{id:'ngn',name:'NGN card',institution:'Test',type:'debt',debtKind:'credit-card',creditLimit:100000,balance:25000,currency:'NGN'},{id:'loan',name:'Car loan',institution:'Test',type:'debt',balance:400,currency:'CAD'}],transactions:[],budgets:[],categories:[{name:'Other income',type:'income',icon:'income'},{name:'Other',type:'expense',icon:'other'}]};
assert.equal(creditCardTotals().count,2);assert.equal(creditCardTotals().limit,1200);assert.equal(creditCardTotals().owed,150);assert.equal(creditCardTotals().available,1050);assert.equal(total('debt'),550);assert.equal(total('assets'),0);
assert.ok(!accountCards('credit-card').includes('Car loan'));assert.ok(creditCardsPage().includes('12.5%'));
txnModal('cad',1);captured.submit({get:key=>({name:'Purchase',amount:'50',category:'Other',date:today()})[key]??null});assert.equal(state.accounts[0].balance,150);assert.equal(state.transactions[0].type,'expense');
txnModal('cad',-1);captured.submit({get:key=>({name:'Repayment',amount:'25',category:'Other income',date:today()})[key]??null});assert.equal(state.accounts[0].balance,125);assert.equal(state.transactions[1].currency,'CAD');assert.equal(state.transactions.length,2);
accountModal('credit-card');assert.equal(captured.title,'Add a credit card');assert.ok(captured.body.includes('Amount owed'));assert.equal($('#field-creditLimit').required,true);
const cardForm=limit=>({get:key=>({name:'New card',institution:'Test bank',type:'credit-card',accountCurrency:'USD',balance:'200',creditLimit:limit,apr:'19',payment:'10'})[key]??null});
const before=state.accounts.length;for(const limit of ['0','-1','NaN','5.555']){assert.throws(()=>captured.submit(cardForm(limit)));assert.equal(state.accounts.length,before);}
captured.submit(cardForm('500'));assert.equal(state.accounts.at(-1).type,'debt');assert.equal(state.accounts.at(-1).debtKind,'credit-card');assert.equal(state.accounts.at(-1).creditLimit,500);
accountModal('bank','cad');captured.submit({get:key=>({name:'CAD card',institution:'Test',type:'credit-card',accountCurrency:'USD',balance:'125',creditLimit:'1500',apr:'20',payment:'25'})[key]??null});assert.equal(state.accounts[0].currency,'CAD');assert.equal(state.accounts[0].creditLimit,1500);assert.equal(state.accounts.length,before+1);
accountModal('bank','loan');captured.submit({get:key=>({name:'Existing card',institution:'Test',type:'credit-card',accountCurrency:'CAD',balance:'400',creditLimit:'600',apr:'20',payment:'25'})[key]??null});assert.equal(state.accounts.length,before+1);assert.equal(isCreditCard(state.accounts.find(a=>a.id==='loan')),true);
state.accounts[0].balance=1600;assert.ok(creditCardDetails(state.accounts[0]).includes('Over limit'));assert.equal(Math.max(0,state.accounts[0].creditLimit-state.accounts[0].balance),0);
`,context);
const data=JSON.parse(vm.runInContext('JSON.stringify(state)',context));
const roundTrip=JSON.parse(validateFinance(structuredClone(data)));assert.equal(roundTrip.accounts[0].creditLimit,1500);assert.equal(roundTrip.accounts[0].debtKind,'credit-card');
for(const limit of [0,-1,NaN,1.234]){const invalid=structuredClone(data);invalid.accounts[0].creditLimit=limit;assert.throws(()=>validateFinance(invalid));}
const legacy=structuredClone(data);delete legacy.accounts[0].creditLimit;delete legacy.accounts[0].debtKind;assert.doesNotThrow(()=>validateFinance(legacy));
console.log('Credit cards passed: combined FX totals, debt accounting, +/- records, create/edit/conversion, limits, over-limit balances, linked currencies, and backup validation.');
