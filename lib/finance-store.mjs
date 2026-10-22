export const MAX_STATE_BYTES=1500000;
const validIcons=new Set(['home','groceries','dining','coffee','shopping','transport','car','bills','health','family','education','travel','gifts','entertainment','subscriptions','pets','work','income','bank','investments','savings','charity','insurance','tax','phone','utilities','fitness','other']);
const validCurrencies=new Set(['NGN','USD','CAD','EUR','GBP','GHS','KES','ZAR','AUD','NZD','CHF','JPY','CNY','INR','AED','SAR','SGD','HKD','BRL','MXN','SEK','NOK','DKK','PLN','TRY','EGP','PKR','BDT','PHP','MYR','IDR','THB','KRW','ILS','TWD','UGX','TZS','RWF','XOF','XAF']);
const fail=message=>{throw new Error(message);};
const text=(v,max=100)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const amount=(v,positive=false)=>Number.isFinite(v)&&v>=(positive?0.01:0)&&v<=999999999999&&Math.abs(v*100-Math.round(v*100))<0.01;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export function validateFinance(d){
  if(d?.profile!=null&&(typeof d.profile!=='object'||Array.isArray(d.profile)||!text(d.profile.displayName,50)||d.profile.displayName!==d.profile.displayName.trim()||/[\u0000-\u001f\u007f]/.test(d.profile.displayName)))fail('Invalid profile.');
  if(!d||![1,2].includes(d.version)||!validCurrencies.has(d.currency)||typeof d.demo!=='boolean'||!Array.isArray(d.categories)||!Array.isArray(d.accounts)||!Array.isArray(d.transactions)||!Array.isArray(d.budgets))fail('Invalid financial workspace.');
  for(const a of d.accounts)if(a&&a.currency==null)a.currency=d.currency;
  for(const t of d.transactions)if(t&&t.currency==null)t.currency=d.accounts.find(a=>a?.id===t.accountId)?.currency||d.currency;
  for(const b of d.budgets)if(b&&b.currency==null)b.currency=d.currency;
  if(Array.isArray(d.transfers))for(const t of d.transfers)if(t){t.currency??=d.currency;t.toCurrency??=t.currency;t.toAmount??=t.amount;}
  d.version=2;
  const categories=new Map(),accountIds=new Set(),recordIds=new Set(),budgets=new Set();
  for(const c of d.categories){if(!c||!text(c.name,50)||c.name!==c.name.trim()||!['income','expense'].includes(c.type)||!validIcons.has(c.icon)||categories.has(c.name.toLowerCase()))fail('Invalid category.');categories.set(c.name.toLowerCase(),c);}
  if(![...categories.values()].some(c=>c.type==='income')||![...categories.values()].some(c=>c.type==='expense'))fail('Keep income and expense categories.');
  for(const a of d.accounts){if(!a||!text(a.id,100)||accountIds.has(a.id)||!text(a.name,70)||!text(a.institution,50)||!validCurrencies.has(a.currency)||!['bank','savings','cash','investment','debt'].includes(a.type)||!amount(a.balance)||['apr','payment'].some(k=>a[k]!=null&&!amount(a[k]))||(a.apr??0)>100)fail('Invalid account.');if(a.debtKind!=null&&(a.debtKind!=='credit-card'||a.type!=='debt'||!amount(a.creditLimit,true)))fail('Invalid credit card limit.');if(a.creditLimit!=null&&a.debtKind!=='credit-card')fail('Invalid credit card.');accountIds.add(a.id);}
  for(const t of d.transactions){if(!t||!text(t.id,100)||recordIds.has(t.id)||!text(t.name,90)||!['income','expense'].includes(t.type)||!validCurrencies.has(t.currency)||t.currency!==d.accounts.find(a=>a.id===t.accountId)?.currency||!categories.has(String(t.category).toLowerCase())||!accountIds.has(t.accountId)||!amount(t.amount,true)||!date(t.date))fail('Invalid transaction.');recordIds.add(t.id);}
  for(const b of d.budgets){if(!b||!text(b.id,100)||recordIds.has(b.id)||!validCurrencies.has(b.currency)||!categories.has(String(b.category).toLowerCase())||budgets.has(b.category)||!amount(b.limit,true))fail('Invalid budget.');recordIds.add(b.id);budgets.add(b.category);}
  if(d.transfers!=null){if(!Array.isArray(d.transfers))fail('Invalid transfers.');for(const t of d.transfers)if(!t||!text(t.from,70)||!text(t.to,70)||!validCurrencies.has(t.currency)||!validCurrencies.has(t.toCurrency)||!amount(t.amount,true)||!amount(t.toAmount,true)||!date(t.date))fail('Invalid transfer.');}
  const payload=JSON.stringify(d);if(new TextEncoder().encode(payload).length>MAX_STATE_BYTES)fail('Workspace exceeds the database size limit. Export a backup and contact support.');
  return payload;
}
export async function loadFinance(db,userId){const row=await db.prepare('SELECT data_json, revision, updated_at FROM finance_workspaces WHERE user_id = ?').bind(userId).first();return row?{state:JSON.parse(row.data_json),revision:row.revision,updatedAt:row.updated_at}:{state:null,revision:0};}
export async function saveFinance(db,userId,state,revision){
  if(!Number.isSafeInteger(revision)||revision<0)fail('Invalid workspace revision.');
  const data=validateFinance(state),now=new Date().toISOString();
  const row=revision===0?await db.prepare('INSERT OR IGNORE INTO finance_workspaces (user_id, data_json, revision, updated_at) VALUES (?, ?, 1, ?) RETURNING revision, updated_at').bind(userId,data,now).first():await db.prepare('UPDATE finance_workspaces SET data_json = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING revision, updated_at').bind(data,now,userId,revision).first();
  return row?{revision:row.revision,updatedAt:row.updated_at}:null;
}
