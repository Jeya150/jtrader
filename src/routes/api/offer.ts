import {createFileRoute} from '@tanstack/react-router';
import {db,user} from '../../lib/course.server';
import {ADMIN_EMAIL} from '../../lib/config.server';

const DEFAULT={enabled:1,cycle_hours:9,basic_old_price:2000,option_old_price:13000,banner_title:'Build your market edge.',social_proof_enabled:1,social_proof_course:'basic-share-market'};

async function getSettings(){
  const row=await db()
    .prepare('SELECT enabled,cycle_hours,basic_old_price,option_old_price,banner_title,social_proof_enabled,social_proof_course FROM offer_settings WHERE id=1')
    .first<any>();
  return row||DEFAULT;
}

export const Route=createFileRoute('/api/offer')({
  server:{
    handlers:{
      GET:async()=>{
        const s=await getSettings();
        return Response.json({
          enabled:!!s.enabled,
          cycleHours:Number(s.cycle_hours)||9,
          basicOldPrice:Number(s.basic_old_price)||2000,
          optionOldPrice:Number(s.option_old_price)||13000,
          bannerTitle:String(s.banner_title||DEFAULT.banner_title),
          socialProofEnabled:s.social_proof_enabled!==0,
          socialProofCourse:String(s.social_proof_course||'basic-share-market')
        });
      },

      POST:async({request})=>{
        const u=await user(request);
        if(!u||u.role!=='admin'||u.email!==ADMIN_EMAIL){
          return Response.json({error:'Admin only'},{status:403});
        }

        const d=await request.json().catch(()=>({})) as any;
        const enabled=d.enabled===false||d.enabled===0?0:1;
        const cycleHours=Math.max(0.5,Math.min(168,Number(d.cycleHours)||9));
        const basicOldPrice=Math.max(0,Number(d.basicOldPrice)||2000);
        const optionOldPrice=Math.max(0,Number(d.optionOldPrice)||13000);
        const bannerTitle=String(d.bannerTitle||DEFAULT.banner_title).slice(0,120);
        const socialProofEnabled=d.socialProofEnabled===false||d.socialProofEnabled===0?0:1;
        const socialProofCourse=['basic-share-market','option-trading','both'].includes(d.socialProofCourse)?d.socialProofCourse:'basic-share-market';

        await db()
          .prepare(
            `INSERT INTO offer_settings(id,enabled,cycle_hours,basic_old_price,option_old_price,banner_title,social_proof_enabled,social_proof_course)
             VALUES(1,?,?,?,?,?,?,?)
             ON CONFLICT(id) DO UPDATE SET
               enabled=excluded.enabled,
               cycle_hours=excluded.cycle_hours,
               basic_old_price=excluded.basic_old_price,
               option_old_price=excluded.option_old_price,
               banner_title=excluded.banner_title,
               social_proof_enabled=excluded.social_proof_enabled,
               social_proof_course=excluded.social_proof_course`
          )
          .bind(enabled,cycleHours,basicOldPrice,optionOldPrice,bannerTitle,socialProofEnabled,socialProofCourse)
          .run();

        return Response.json({ok:true});
      }
    }
  }
});
