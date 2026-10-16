(() => {
  const content=document.getElementById('content');if(!content)return;
  const selector='.stat-value, .detail-card .balance, .chart-summary b, .donut-center b';
  let frame=0;
  function fitAmount(element){
    if(!element.isConnected||element.clientWidth===0)return;
    // Currency formatters use a non-breaking space. Allow a clean break
    // between the currency code and number on narrow cards, rather than
    // splitting the last digit off the amount.
    if(!element.childElementCount&&element.textContent.includes('\u00a0'))element.textContent=element.textContent.replaceAll('\u00a0',' ');
    // Recalculate from the responsive stylesheet so amounts can grow again
    // when the window gets wider or the dashboard currency gets shorter.
    element.style.fontSize='';element.style.whiteSpace='nowrap';element.style.overflowWrap='normal';
    const preferred=parseFloat(getComputedStyle(element).fontSize),minimum=Math.min(preferred,element.closest('.donut-center')?11:16),width=Math.max(1,element.clientWidth-3);
    const range=document.createRange();range.selectNodeContents(element);
    const textWidth=()=>range.getBoundingClientRect().width;
    if(textWidth()>width){
      let low=minimum,high=preferred;
      for(let step=0;step<10;step++){const size=(low+high)/2;element.style.fontSize=size+'px';if(textWidth()<=width)low=size;else high=size;}
      element.style.fontSize=(Math.floor(low*100)/100)+'px';
      if(textWidth()>width){element.style.whiteSpace='normal';element.style.overflowWrap='anywhere';}
    }
    element.title=element.textContent.trim();
  }
  function fitAll(){frame=0;content.querySelectorAll(selector).forEach(fitAmount);}
  function schedule(){if(!frame)frame=requestAnimationFrame(fitAll);}
  new MutationObserver(schedule).observe(content,{subtree:true,childList:true,characterData:true});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(schedule).observe(content);
  window.addEventListener('resize',schedule);
  document.fonts?.ready.then(schedule);
  document.fonts?.addEventListener('loadingdone',schedule);
  schedule();
})();
