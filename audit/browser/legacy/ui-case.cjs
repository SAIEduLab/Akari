// Each case starts without another case's pointer capture, click suppression,
// composition, focus, timers, local storage or disclosure state. Never retry a case.
async function withFreshPage(browser,{url,errors,networkRequests},fn){
 const context=await browser.newContext({viewport:{width:1440,height:1800}});
 try{
  await context.route(/^https?:\/\//,route=>{networkRequests.push(route.request().url());return route.abort();});
  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.stack));
  page.on('dialog',d=>d.accept());
  await page.goto(url);
  return await fn(page);
 }finally{await context.close();}
}
module.exports={withFreshPage};
