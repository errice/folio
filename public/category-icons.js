const categoryIconChoices={
  home:{label:'Home',path:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>'},
  groceries:{label:'Groceries',path:'<path d="M3 3h2l3 12h11l2-8H6M9 19h.01M18 19h.01"/><circle cx="9" cy="19" r="1"/><circle cx="18" cy="19" r="1"/>'},
  dining:{label:'Dining',path:'<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M19 21V3c-4 2-5 8 0 9"/>'},
  coffee:{label:'Coffee',path:'<path d="M4 8h13v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM17 9h2a3 3 0 0 1 0 6h-2M7 3v2M12 3v2M2 21h19"/>'},
  shopping:{label:'Shopping',path:'<path d="M4 7h16l1 14H3ZM8 8V6a4 4 0 0 1 8 0v2"/>'},
  transport:{label:'Transit',path:'<rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 10h14M9 14h.01M15 14h.01M8 18l-2 3M16 18l2 3M10 6h4"/>'},
  car:{label:'Car',path:'<path d="m4 9 2-5h12l2 5M3 9h18v8H3ZM5 17v3M19 17v3M6 13h2M16 13h2"/>'},
  bills:{label:'Bills',path:'<path d="M5 3h14v18l-4-2-3 2-3-2-4 2ZM9 7h6M9 11h6M9 15h3"/>'},
  health:{label:'Health',path:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>'},
  family:{label:'Family',path:'<circle cx="8" cy="7" r="3"/><circle cx="17" cy="8" r="2"/><path d="M2 21v-3a6 6 0 0 1 12 0v3M16 13a5 5 0 0 1 6 5v3"/>'},
  education:{label:'Education',path:'<path d="m2 8 10-5 10 5-10 5ZM6 10v7c4 3 8 3 12 0v-7M22 8v9"/>'},
  travel:{label:'Travel',path:'<path d="m3 10 7 2 5 8 2-1-2-7 6-6c2-3 0-5-3-3l-6 6-7-2Z"/>'},
  gifts:{label:'Gifts',path:'<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8C2 8 5 0 9 3l3 5c10 0 7-8 3-5Z"/>'},
  entertainment:{label:'Entertainment',path:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="m8 2 4 3 4-3m-6 8 5 3-5 3Z"/>'},
  subscriptions:{label:'Subscriptions',path:'<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>'},
  pets:{label:'Pets',path:'<ellipse cx="6" cy="8" rx="2" ry="3"/><ellipse cx="18" cy="8" rx="2" ry="3"/><ellipse cx="11" cy="5" rx="2" ry="3"/><path d="M5 19c-2-4 3-8 7-8s9 4 7 8c-2 3-5-1-7-1s-5 4-7 1Z"/>'},
  work:{label:'Work',path:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12c5 4 13 4 18 0M10 13h4v3h-4Z"/>'},
  income:{label:'Income',path:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>'},
  bank:{label:'Bank',path:'<path d="m3 8 9-5 9 5ZM5 11v7M12 11v7M19 11v7M3 21h18"/>'},
  investments:{label:'Investments',path:'<path d="m3 17 6-6 4 4 8-10M15 5h6v6M3 21h18"/>'},
  savings:{label:'Savings',path:'<circle cx="12" cy="12" r="9"/><path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9M12 6v12"/>'},
  charity:{label:'Charity',path:'<path d="M12 21 3 12C-2 5 7-1 12 6c5-7 14-1 9 6Z"/>'},
  insurance:{label:'Insurance',path:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6"/>'},
  tax:{label:'Taxes',path:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 10h2M14 10h2M8 14h2M14 14h2M8 18h2M14 18h2"/>'},
  phone:{label:'Phone',path:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4M11 19h2"/>'},
  utilities:{label:'Utilities',path:'<path d="m13 2-9 12h7l-1 8 10-13h-8Z"/>'},
  fitness:{label:'Fitness',path:'<path d="M6 3v18M3 7v10M18 3v18M21 7v10M6 12h12"/>'},
  other:{label:'Other',path:'<path d="m3 3 8 0 10 10-8 8L3 11Z"/><circle cx="7" cy="7" r="1"/>'}
};
function hasCategoryIcon(key){return typeof key==='string'&&Object.hasOwn(categoryIconChoices,key);}
function defaultCategoryIcon(name,type){const defaults={Salary:'income',Freelance:'work','Investment income':'investments','Other income':'income',Housing:'home',Groceries:'groceries',Dining:'dining',Shopping:'shopping',Transport:'transport',Entertainment:'entertainment',Utilities:'utilities',Health:'health',Other:'other'};return Object.hasOwn(defaults,name)?defaults[name]:type==='income'?'income':'other';}
function categorySymbol(key){const choice=categoryIconChoices[hasCategoryIcon(key)?key:'other'];return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${choice.path}</svg>`;}
function categoryIconPicker(selected){return `<fieldset class="category-icon-picker"><legend>Choose an icon</legend><div class="category-icon-grid">${Object.entries(categoryIconChoices).map(([key,choice])=>`<label class="category-icon-option"><input type="radio" name="icon" value="${key}" ${key===selected?'checked':''} required><span>${categorySymbol(key)}<small>${choice.label}</small></span></label>`).join('')}</div></fieldset>`;}
