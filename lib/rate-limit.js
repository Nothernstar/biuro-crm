const buckets=globalThis.__brcrmRateBuckets||(globalThis.__brcrmRateBuckets=new Map());

function clientIp(req){
  const forwarded=String(req.headers?.['x-forwarded-for']||'').split(',')[0].trim();
  return forwarded||String(req.headers?.['x-real-ip']||req.socket?.remoteAddress||'unknown');
}

function cleanup(now){
  if(buckets.size<1000)return;
  for(const [key,b] of buckets){
    if(now>b.resetAt+60000)buckets.delete(key);
  }
}

export function rateLimit(req,res,{scope='api',limit=120,windowMs=60000}={}){
  const now=Date.now();
  cleanup(now);
  const key=scope+':'+clientIp(req);
  let bucket=buckets.get(key);
  if(!bucket||now>=bucket.resetAt){
    bucket={count:0,resetAt:now+windowMs};
    buckets.set(key,bucket);
  }
  bucket.count++;
  const remaining=Math.max(0,limit-bucket.count);
  res.setHeader('X-RateLimit-Limit',String(limit));
  res.setHeader('X-RateLimit-Remaining',String(remaining));
  res.setHeader('X-RateLimit-Reset',String(Math.ceil(bucket.resetAt/1000)));
  if(bucket.count>limit){
    const retry=Math.max(1,Math.ceil((bucket.resetAt-now)/1000));
    res.setHeader('Retry-After',String(retry));
    res.status(429).json({error:'Zbyt wiele żądań. Spróbuj ponownie za chwilę.'});
    return false;
  }
  return true;
}

export function authRateLimit(req,res){
  return rateLimit(req,res,{scope:'auth',limit:10,windowMs:15*60*1000});
}

export function apiRateLimit(req,res){
  return rateLimit(req,res,{scope:'api',limit:180,windowMs:60*1000});
}
