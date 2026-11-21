// Pure financial close planner. Balances = debit minus credit (in UAH).
// Closing accounts 7 and 9 to 791/792/793, then 79 to 44.
export function resultAccount(code){
  if (/^(70|71|90|91|92|93|94)/.test(code)) return '791';
  if (/^(72|73|95|96)/.test(code)) return '792';
  return '793';
}
export function buildFinancialClose(balances){
  const rows = balances.map(x=>({code:String(x.code),balance:Math.round(Number(x.balance)*100)/100}));
  const unclosed8=rows.filter(x=>/^8/.test(x.code)&&Math.abs(x.balance)>=0.005);
  const source=rows.filter(x=>/^[79]/.test(x.code)&&!x.code.startsWith('79')&&Math.abs(x.balance)>=0.005);
  const result=new Map(['79','791','792','793'].map(x=>[x,0]));
  for(const r of rows.filter(x=>/^79(?:[123])?$/.test(x.code)))result.set(r.code,(result.get(r.code)||0)+r.balance);
  const lines=[];
  for(const r of source){
    const target=resultAccount(r.code);result.set(target,Math.round(((result.get(target)||0)+r.balance)*100)/100);
    lines.push({debit_acc:r.balance<0?r.code:target,credit_acc:r.balance<0?target:r.code,amount:Math.abs(r.balance),description:`Закриття рахунка ${r.code} на ${target}`});
  }
  for(const [code,balance] of result){
    const net=Math.round(balance*100)/100;
    if(Math.abs(net)<0.005)continue;
    lines.push({debit_acc:net<0?code:'44',credit_acc:net<0?'44':code,amount:Math.abs(net),description:`Списання фінансового результату ${code} на 44`});
  }
  const profit=-[...result.values()].reduce((a,b)=>a+b,0);
  return {lines,profit:(Math.round(profit*100)/100||0),unclosed8,sourceCount:source.length};
}
