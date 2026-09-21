async page => {
  const base='http://127.0.0.1:4173/';
  const browser=page.context().browser(), checks=[], errors=[];
  const check=(name,passed,detail)=>{checks.push({name,passed:!!passed,detail});if(!passed)throw Error(name+': '+JSON.stringify(detail));};
  for(const [width,height] of [[390,844],[412,915]]) {
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:3});
    try {
      await context.route('https://www.google.com/maps?**',r=>r.fulfill({body:'Map isolated for gesture checks'}));
      const tab=await context.newPage();
      tab.on('pageerror',e=>errors.push(e.message));
      await tab.goto(base);
      await tab.evaluate(()=>document.fonts.ready);
      await tab.waitForFunction(()=>document.querySelector('.growth-story').dataset.mode==='animated' && document.querySelector('.plant-canvas').dataset.media==='video');
      const client=await context.newCDPSession(tab);
      const send=(type,y)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:y===undefined?[]:[{x:180,y,id:0}]});
      const state=()=>tab.evaluate(()=>{const s=document.querySelector('.growth-story');return {y:scrollY,mode:s.dataset.mode,state:s.dataset.scrollState,stride:parseFloat(s.style.getPropertyValue('--chapter-stride'))};});
      const arrived=async index=>{
        await tab.waitForFunction(i=>{const s=document.querySelector('.growth-story');return s.dataset.scrollState==='idle'&&Math.abs(scrollY-i*parseFloat(s.style.getPropertyValue('--chapter-stride')))<2;},index,{timeout:6000});
      };
      const origin=async()=>{
        await tab.setViewportSize({width,height});
        await tab.locator('.chapter-nav a').nth(0).click();
        await arrived(0);
      };
      const swipe=async()=>{await send('touchStart',540);await send('touchMove',480);await tab.waitForTimeout(120);};

      await swipe();
      const first=await state();
      check('Swipe starts visibly before resizing '+width,first.state==='transitioning'&&first.y>0&&first.y<first.stride,first);
      await tab.setViewportSize({width,height:height+56});
      await send('touchEnd');
      await arrived(1);
      check('Height change while holding completes the chapter '+width,true);
      await tab.waitForFunction(()=>Math.abs(Number(document.querySelector('.plant-canvas').dataset.renderedTime)-Number(document.querySelector('.plant-canvas').dataset.targetTime))<.025);
      check('Plant resolves the destination after resize '+width,true);

      await origin();
      await swipe();
      await send('touchEnd');
      await tab.setViewportSize({width,height:height+56});
      await arrived(1);
      check('Height change after releasing completes the chapter '+width,true);

      await origin();
      await swipe();
      await tab.setViewportSize({width,height:height+56});
      await arrived(1);
      await tab.setViewportSize({width,height});
      await send('touchMove',390);
      await tab.waitForTimeout(350);
      const held=await state();
      check('Same held swipe cannot chain a second chapter after resize '+width,held.state==='idle'&&Math.abs(held.y-held.stride)<2,held);
      await send('touchEnd');
      await send('touchStart',440);await send('touchMove',500);await send('touchEnd');
      await arrived(0);
      check('Fresh reverse gesture returns normally '+width,true);

      await swipe();await send('touchEnd');
      await send('touchStart',520);await send('touchEnd');
      await arrived(1);
      check('Resting finger tap does not leave an intermediate stop '+width,true);
      await tab.screenshot({path:'artifacts/mobile-scroll-fixed-'+width+'.png'});

      await origin();
      await swipe();await send('touchEnd');
      await tab.locator('.header-contact').tap();
      await tab.waitForFunction(()=>location.hash==='#contacto' && document.querySelector('#contacto').getBoundingClientRect().top<innerHeight);
      await tab.waitForTimeout(1200);
      check('Actual navigation still interrupts the chapter '+width,(await state()).state==='idle'&&await tab.locator('#contacto').evaluate(el=>el.getBoundingClientRect().top<innerHeight));
      await tab.locator('.back-to-top').tap();
      await tab.waitForFunction(()=>scrollY<1);
      check('Return to top remains available '+width,true);
      await client.detach();
    }catch(error){throw Error('Viewport '+width+', after '+checks.at(-1)?.name+': '+error.message);}
    finally{await context.close();}
  }
  check('No runtime errors',errors.length===0,errors);
  return {checks,errors,scope:'Chromium with emulated mobile touch and variable viewport height, not physical Android or iPhone.'};
}
