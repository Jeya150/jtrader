import {useEffect, useState} from 'react';

type Settings={enabled:boolean;cycleHours:number;basicOldPrice:number;optionOldPrice:number;bannerTitle:string};
const DEFAULT:Settings={enabled:true,cycleHours:9,basicOldPrice:2000,optionOldPrice:13000,bannerTitle:'Build your market edge.'};

function format(ms:number){
  const total=Math.max(0,Math.floor(ms/1000));
  return [Math.floor(total/3600),Math.floor((total%3600)/60),total%60].map(v=>String(v).padStart(2,'0')).join(':');
}

export default function OfferCycleBanner({basicPrice,optionPrice,basicOldPrice,optionOldPrice}:{basicPrice?:number;optionPrice?:number;basicOldPrice?:number;optionOldPrice?:number}){
  const [now,setNow]=useState(Date.now());
  const [settings,setSettings]=useState<Settings>(DEFAULT);

  useEffect(()=>{
    fetch('/api/offer').then(r=>r.json()).then((d:any)=>{
      if(d&&typeof d.cycleHours==='number') setSettings(d);
    }).catch(()=>{});
    const timer=window.setInterval(()=>setNow(Date.now()),1000);
    return ()=>window.clearInterval(timer);
  },[]);

  if(!settings.enabled) return null;

  const cycleMs=settings.cycleHours*60*60*1000;
  const cycleStart=Math.floor(now/cycleMs)*cycleMs;
  const remainingMs=(cycleStart+cycleMs)-now;

  const bp=basicPrice??1500;
  const op=optionPrice??9999;

  return (
    <section className="offerCycleBanner">
      <div>
        <small>LIMITED-TIME COURSE OFFER</small>
        <h2>{settings.bannerTitle}</h2>
      </div>
      <div className="offerCyclePrices">
        {basicPrice!==undefined&&<div>
          <b>Basic of Share Market</b>
          <strong>₹{bp.toLocaleString('en-IN')} <s>₹{(basicOldPrice??settings.basicOldPrice).toLocaleString('en-IN')}</s></strong>
        </div>}
        {optionPrice!==undefined&&<div>
          <b>Option Trading Course</b>
          <strong>₹{op.toLocaleString('en-IN')} <s>₹{(optionOldPrice??settings.optionOldPrice).toLocaleString('en-IN')}</s></strong>
        </div>}
        <span>Offer ends in <em>{format(remainingMs)}</em></span>
      </div>
    </section>
  );
}
