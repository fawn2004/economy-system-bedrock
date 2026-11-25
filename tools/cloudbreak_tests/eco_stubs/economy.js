const bal=new Map();
export const getBalance=(p)=>bal.get(p.id)??0; export const setBalance=(p,v)=>bal.set(p.id,v);
export const addMoney=(p,v)=>bal.set(p.id,getBalance(p)+v);
export const takeMoney=(p,v)=>{if(getBalance(p)<v)return false;bal.set(p.id,getBalance(p)-v);return true;};
export const fmt=(n)=>'$'+Math.floor(n); export const fmtMoney=fmt; let sm; export const setSellMultiplier=(f)=>sm=f; export const sellMult=(p)=>sm(p); export const sellMultiplier=(p)=>sm?sm(p):1; export const fmtShort=fmt;
